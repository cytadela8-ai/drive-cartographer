use crate::cache::{CacheLookup, HashCache};
use crate::config::{RootConfig, ScannerConfig};
use crate::csv_schema::{CSV_HEADER, CsvFileRow};
use crate::errors::ScannerError;
use crate::metadata::{FileMetadata, MetadataCollector};
use crate::paths::split_relative_path;
use crate::progress::{ProgressReporter, ScanProgress, terminal_or_noop};
use globset::{Glob, GlobSet, GlobSetBuilder};
use sha2::{Digest, Sha256};
use std::fs::{File, remove_file};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use walkdir::WalkDir;

#[derive(Debug, Clone)]
pub struct ScanOptions {
    pub output_path: PathBuf,
    pub full_rehash: bool,
    pub show_progress: bool,
    pub upload: bool,
}

#[derive(Debug, Default, Eq, PartialEq)]
pub struct ScanSummary {
    pub files_discovered: u64,
    pub bytes_discovered: u64,
    pub files_written: u64,
    pub cache_hits: u64,
    pub errors: u64,
}

pub fn run_scan(
    config: &ScannerConfig,
    options: &ScanOptions,
) -> Result<ScanSummary, ScannerError> {
    let mut progress = terminal_or_noop(options.show_progress);
    run_scan_with_progress(config, options, progress.as_mut())
}

pub fn run_scan_with_progress(
    config: &ScannerConfig,
    options: &ScanOptions,
    progress_reporter: &mut dyn ProgressReporter,
) -> Result<ScanSummary, ScannerError> {
    validate_roots(&config.roots)?;

    let excludes = Excludes::from_patterns(&config.exclude_patterns)?;
    let scan_started_at = timestamp_now()?;
    let mut summary = enumerate_roots(&config.roots, &excludes, progress_reporter)?;
    let cache = HashCache::open(&config.cache_path)?;
    let metadata_collector = MetadataCollector::new()?;
    let partial_output_path = partial_output_path(&options.output_path);
    let file = File::create(&partial_output_path).map_err(|source| ScannerError::Io {
        path: partial_output_path.display().to_string(),
        source,
    })?;
    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(file);
    writer.write_record(CSV_HEADER)?;

    let mut execution = ScanExecution {
        config,
        options,
        cache: &cache,
        metadata_collector: &metadata_collector,
        writer: &mut writer,
        summary: &mut summary,
        progress_reporter,
        scan_started_at,
        excludes: &excludes,
    };
    execution.process_roots()?;

    writer.flush().map_err(ScannerError::CsvFlush)?;
    drop(writer);

    let scan_finished_at = timestamp_now()?;
    progress_reporter.begin_finalization();
    finalize_csv_output(
        &partial_output_path,
        &options.output_path,
        &scan_finished_at,
    )?;
    progress_reporter.finish_finalization();

    if options.upload {
        progress_reporter.begin_upload();
        crate::upload::upload_artifact(&options.output_path, config.server_url.as_deref())?;
        progress_reporter.finish_upload();
    }

    Ok(summary)
}

fn validate_roots(roots: &[RootConfig]) -> Result<(), ScannerError> {
    for root in roots {
        if !root.path.is_dir() {
            return Err(ScannerError::InvalidRoot {
                path: root.path.display().to_string(),
            });
        }
    }

    Ok(())
}

fn enumerate_roots(
    roots: &[RootConfig],
    excludes: &Excludes,
    progress_reporter: &mut dyn ProgressReporter,
) -> Result<ScanSummary, ScannerError> {
    let mut progress = ScanProgress::new();
    progress_reporter.begin_enumeration();

    for root in roots {
        for entry in walk_entries(root, excludes) {
            let entry = entry?;
            if entry.file_type().is_file() {
                let size_bytes = entry.metadata()?.len();
                progress.record_file(size_bytes);
                progress_reporter.record_enumerated_file(size_bytes);
            }
        }
    }

    progress_reporter.finish_enumeration(progress.files_seen(), progress.bytes_seen());
    Ok(ScanSummary {
        files_discovered: progress.files_seen(),
        bytes_discovered: progress.bytes_seen(),
        ..ScanSummary::default()
    })
}

struct ScanExecution<'a, W: std::io::Write> {
    config: &'a ScannerConfig,
    options: &'a ScanOptions,
    cache: &'a HashCache,
    metadata_collector: &'a MetadataCollector,
    writer: &'a mut csv::Writer<W>,
    summary: &'a mut ScanSummary,
    progress_reporter: &'a mut dyn ProgressReporter,
    scan_started_at: String,
    excludes: &'a Excludes,
}

impl<W: std::io::Write> ScanExecution<'_, W> {
    fn process_roots(&mut self) -> Result<(), ScannerError> {
        self.progress_reporter
            .begin_processing(self.summary.files_discovered, self.summary.bytes_discovered);
        for root in &self.config.roots {
            self.process_root(root)?;
        }
        self.progress_reporter
            .finish_processing(self.summary.files_written, self.summary.cache_hits);

        Ok(())
    }

    fn process_root(&mut self, root: &RootConfig) -> Result<(), ScannerError> {
        for entry in walk_entries(root, self.excludes) {
            let entry = entry?;
            if entry.file_type().is_file() {
                self.process_file(root, entry.path())?;
            }
        }

        Ok(())
    }

    fn process_file(&mut self, root: &RootConfig, path: &Path) -> Result<(), ScannerError> {
        let source_name = self.config.effective_source_name();
        let metadata = self.metadata_collector.collect(path)?;
        let size_bytes = metadata.size_bytes;
        let absolute_path = path.to_string_lossy().to_string();
        let relative_path = relative_path(&root.path, path)?;
        let sha256 = hash_with_cache(
            HashContext {
                source_name: &source_name,
                root_label: &root.label,
                absolute_path: &absolute_path,
                path,
                metadata: &metadata,
                full_rehash: self.options.full_rehash,
            },
            self.cache,
            self.summary,
        )?;
        let row = build_csv_row(RowContext {
            source_name,
            root,
            metadata,
            absolute_path,
            relative_path,
            sha256,
            scan_started_at: self.scan_started_at.clone(),
        });

        self.writer.serialize(row)?;
        self.summary.files_written += 1;
        self.progress_reporter.record_processed_file(size_bytes);
        Ok(())
    }
}

struct RowContext<'a> {
    source_name: String,
    root: &'a RootConfig,
    metadata: FileMetadata,
    absolute_path: String,
    relative_path: String,
    sha256: String,
    scan_started_at: String,
}

fn build_csv_row(context: RowContext<'_>) -> CsvFileRow {
    let parts = split_relative_path(&context.relative_path);

    CsvFileRow {
        schema_version: "1".to_string(),
        source_name: context.source_name,
        hostname: std::env::var("HOSTNAME").unwrap_or_else(|_| "unknown-host".to_string()),
        os: std::env::consts::OS.to_string(),
        scanner_version: env!("CARGO_PKG_VERSION").to_string(),
        scan_started_at: context.scan_started_at,
        scan_finished_at: String::new(),
        root_label: context.root.label.clone(),
        root_path_seen: context.root.path.to_string_lossy().to_string(),
        sha256: context.sha256,
        size_bytes: context.metadata.size_bytes,
        absolute_path: context.absolute_path,
        relative_path: context.relative_path,
        parent_relative_path: parts.parent_relative_path,
        basename: parts.basename,
        created_at_fs: context.metadata.created_at_fs,
        modified_at_fs: context.metadata.modified_at_fs,
        mime_type: context.metadata.mime_type,
        ownership_permissions_json: context.metadata.ownership_permissions_json,
        exif_json: context.metadata.exif_json,
        metadata_json: context.metadata.metadata_json,
    }
}

fn finalize_csv_output(
    partial_output_path: &Path,
    output_path: &Path,
    scan_finished_at: &str,
) -> Result<(), ScannerError> {
    let mut reader = csv::Reader::from_path(partial_output_path)?;
    let file = File::create(output_path).map_err(|source| ScannerError::Io {
        path: output_path.display().to_string(),
        source,
    })?;
    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(file);
    writer.write_record(CSV_HEADER)?;

    for row in reader.deserialize() {
        let mut row: CsvFileRow = row?;
        row.scan_finished_at = scan_finished_at.to_string();
        writer.serialize(row)?;
    }

    writer.flush().map_err(ScannerError::CsvFlush)?;
    remove_file(partial_output_path).map_err(|source| ScannerError::Io {
        path: partial_output_path.display().to_string(),
        source,
    })?;
    Ok(())
}

fn partial_output_path(output_path: &Path) -> PathBuf {
    let mut path = output_path.to_path_buf();
    let suffix = format!(
        "{}.partial.{}",
        output_path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or("csv"),
        std::process::id()
    );
    path.set_extension(suffix);
    path
}

fn timestamp_now() -> Result<String, ScannerError> {
    Ok(OffsetDateTime::now_utc().format(&Rfc3339)?)
}

struct Excludes {
    patterns: GlobSet,
}

impl Excludes {
    fn from_patterns(patterns: &[String]) -> Result<Self, ScannerError> {
        let mut builder = GlobSetBuilder::new();
        for pattern in patterns {
            let glob = Glob::new(pattern).map_err(|source| ScannerError::ExcludePattern {
                pattern: pattern.clone(),
                source,
            })?;
            builder.add(glob);
        }
        let patterns = builder
            .build()
            .map_err(|source| ScannerError::ExcludePattern {
                pattern: patterns.join(", "),
                source,
            })?;

        Ok(Self { patterns })
    }

    fn matches(&self, root: &Path, path: &Path) -> bool {
        let Ok(relative) = path.strip_prefix(root) else {
            return false;
        };
        if relative.as_os_str().is_empty() {
            return false;
        }

        self.patterns.is_match(normalized_path(relative))
    }
}

fn walk_entries<'a>(
    root: &'a RootConfig,
    excludes: &'a Excludes,
) -> impl Iterator<Item = walkdir::Result<walkdir::DirEntry>> + 'a {
    WalkDir::new(&root.path)
        .into_iter()
        .filter_entry(move |entry| !excludes.matches(&root.path, entry.path()))
}

fn normalized_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

struct HashContext<'a> {
    source_name: &'a str,
    root_label: &'a str,
    absolute_path: &'a str,
    path: &'a Path,
    metadata: &'a FileMetadata,
    full_rehash: bool,
}

fn hash_with_cache(
    context: HashContext<'_>,
    cache: &HashCache,
    summary: &mut ScanSummary,
) -> Result<String, ScannerError> {
    let lookup = CacheLookup {
        source_name: context.source_name,
        root_label: context.root_label,
        absolute_path: context.absolute_path,
        platform_file_id: context.metadata.platform_file_id.as_deref(),
        size_bytes: context.metadata.size_bytes,
        modified_at_fs: &context.metadata.modified_at_fs,
    };

    if !context.full_rehash
        && let Some(sha256) = cache.get(&lookup)?
    {
        summary.cache_hits += 1;
        return Ok(sha256);
    }

    let sha256 = hash_file(context.path)?;
    cache.put(&lookup, &sha256)?;
    Ok(sha256)
}

fn hash_file(path: &Path) -> Result<String, ScannerError> {
    let file = File::open(path).map_err(|source| ScannerError::Io {
        path: path.display().to_string(),
        source,
    })?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|source| ScannerError::Io {
                path: path.display().to_string(),
                source,
            })?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hex_lower(&hasher.finalize()))
}

fn relative_path(root: &Path, path: &Path) -> Result<String, ScannerError> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| ScannerError::InvalidRelativePath {
            path: path.display().to_string(),
        })?;

    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write;
        write!(&mut output, "{byte:02x}").expect("writing to string cannot fail");
    }
    output
}
