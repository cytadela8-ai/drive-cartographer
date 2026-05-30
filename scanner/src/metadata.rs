use crate::errors::ScannerError;
use serde_json::json;
use std::fs::Metadata;
use std::path::Path;
use std::time::SystemTime;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

#[derive(Debug, Clone)]
pub struct FileMetadata {
    pub size_bytes: u64,
    pub created_at_fs: String,
    pub modified_at_fs: String,
    pub platform_file_id: Option<String>,
    pub mime_type: String,
    pub ownership_permissions_json: String,
    pub exif_json: String,
    pub metadata_json: String,
}

pub fn collect_metadata(path: &Path) -> Result<FileMetadata, ScannerError> {
    let collector = MetadataCollector::new()?;
    collector.collect(path)
}

pub struct MetadataCollector {
    magic_cookie: magic::cookie::Cookie<magic::cookie::Load>,
}

impl MetadataCollector {
    pub fn new() -> Result<Self, ScannerError> {
        let flags = magic::cookie::Flags::MIME_TYPE | magic::cookie::Flags::ERROR;
        let magic_cookie = magic::Cookie::open(flags).map_err(|source| ScannerError::Mime {
            path: "libmagic".to_string(),
            message: source.to_string(),
        })?;
        let database = Default::default();
        let magic_cookie = magic_cookie
            .load(&database)
            .map_err(|source| ScannerError::Mime {
                path: "libmagic database".to_string(),
                message: source.to_string(),
            })?;

        Ok(Self { magic_cookie })
    }

    pub fn collect(&self, path: &Path) -> Result<FileMetadata, ScannerError> {
        collect_metadata_with_magic(path, &self.magic_cookie)
    }
}

fn collect_metadata_with_magic(
    path: &Path,
    magic_cookie: &magic::cookie::Cookie<magic::cookie::Load>,
) -> Result<FileMetadata, ScannerError> {
    let metadata = std::fs::metadata(path).map_err(|source| ScannerError::Io {
        path: path.display().to_string(),
        source,
    })?;

    let created_at_fs = metadata
        .created()
        .ok()
        .map(format_system_time)
        .transpose()?
        .unwrap_or_default();
    let modified_at_fs =
        format_system_time(metadata.modified().map_err(|source| ScannerError::Io {
            path: path.display().to_string(),
            source,
        })?)?;

    Ok(FileMetadata {
        size_bytes: metadata.len(),
        created_at_fs,
        modified_at_fs,
        platform_file_id: platform_file_id(&metadata),
        mime_type: detect_mime_type(path, magic_cookie)?,
        ownership_permissions_json: permissions_json(&metadata),
        exif_json: "{}".to_string(),
        metadata_json: metadata_json(&metadata),
    })
}

fn detect_mime_type(
    path: &Path,
    magic_cookie: &magic::cookie::Cookie<magic::cookie::Load>,
) -> Result<String, ScannerError> {
    magic_cookie
        .file(path)
        .map_err(|source| ScannerError::Mime {
            path: path.display().to_string(),
            message: source.to_string(),
        })
}

fn format_system_time(system_time: SystemTime) -> Result<String, ScannerError> {
    let datetime = OffsetDateTime::from(system_time);
    Ok(datetime.format(&Rfc3339)?)
}

#[cfg(unix)]
fn platform_file_id(metadata: &Metadata) -> Option<String> {
    use std::os::unix::fs::MetadataExt;

    Some(format!("unix:{}:{}", metadata.dev(), metadata.ino()))
}

#[cfg(not(unix))]
fn platform_file_id(_metadata: &Metadata) -> Option<String> {
    None
}

#[cfg(unix)]
fn metadata_json(metadata: &Metadata) -> String {
    use std::os::unix::fs::MetadataExt;

    json!({
        "platform_file_identity": {
            "platform": "unix",
            "device": metadata.dev(),
            "inode": metadata.ino(),
        },
    })
    .to_string()
}

#[cfg(not(unix))]
fn metadata_json(_metadata: &Metadata) -> String {
    "{}".to_string()
}

#[cfg(unix)]
fn permissions_json(metadata: &Metadata) -> String {
    use std::os::unix::fs::MetadataExt;

    json!({
        "platform": "unix",
        "owner": metadata.uid(),
        "group": metadata.gid(),
        "mode": metadata.mode(),
        "readonly": metadata.permissions().readonly(),
    })
    .to_string()
}

#[cfg(windows)]
fn permissions_json(metadata: &Metadata) -> String {
    json!({
        "platform": "windows",
        "readonly": metadata.permissions().readonly(),
    })
    .to_string()
}

#[cfg(not(any(unix, windows)))]
fn permissions_json(metadata: &Metadata) -> String {
    json!({
        "platform": "unknown",
        "readonly": metadata.permissions().readonly(),
    })
    .to_string()
}
