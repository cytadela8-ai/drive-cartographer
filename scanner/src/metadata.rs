use crate::errors::ScannerError;
use exif::{In, Tag, Value};
use serde_json::Map;
use serde_json::json;
use std::fs::File;
use std::fs::Metadata;
use std::io::BufReader;
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
        exif_json: extract_exif_json(path)?,
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

fn extract_exif_json(path: &Path) -> Result<String, ScannerError> {
    let file = File::open(path).map_err(|source| ScannerError::Io {
        path: path.display().to_string(),
        source,
    })?;
    let mut reader = BufReader::new(file);
    let Ok(exif) = exif::Reader::new().read_from_container(&mut reader) else {
        return Ok("{}".to_string());
    };

    let mut fields = Map::new();
    insert_ascii(&mut fields, &exif, Tag::Make, "make");
    insert_ascii(&mut fields, &exif, Tag::Model, "model");
    insert_ascii(&mut fields, &exif, Tag::Software, "software");
    insert_ascii(&mut fields, &exif, Tag::Artist, "artist");
    insert_ascii(&mut fields, &exif, Tag::Copyright, "copyright");
    insert_ascii(
        &mut fields,
        &exif,
        Tag::DateTimeOriginal,
        "date_time_original",
    );
    insert_ascii(&mut fields, &exif, Tag::DateTime, "date_time");
    insert_uint(&mut fields, &exif, Tag::Orientation, "orientation");
    insert_uint(&mut fields, &exif, Tag::PixelXDimension, "image_width");
    insert_uint(&mut fields, &exif, Tag::PixelYDimension, "image_height");

    Ok(serde_json::Value::Object(fields).to_string())
}

fn insert_ascii(
    fields: &mut Map<String, serde_json::Value>,
    exif: &exif::Exif,
    tag: Tag,
    key: &str,
) {
    let Some(field) = exif.get_field(tag, In::PRIMARY) else {
        return;
    };
    let Some(value) = ascii_value(&field.value) else {
        return;
    };

    fields.insert(key.to_string(), json!(value));
}

fn insert_uint(
    fields: &mut Map<String, serde_json::Value>,
    exif: &exif::Exif,
    tag: Tag,
    key: &str,
) {
    let Some(field) = exif.get_field(tag, In::PRIMARY) else {
        return;
    };
    let Some(value) = field.value.get_uint(0) else {
        return;
    };

    fields.insert(key.to_string(), json!(value));
}

fn ascii_value(value: &Value) -> Option<String> {
    let Value::Ascii(values) = value else {
        return None;
    };
    let bytes = values.first()?;
    let text = String::from_utf8_lossy(bytes).trim().to_string();
    if text.is_empty() {
        return None;
    }

    Some(text)
}

fn format_system_time(system_time: SystemTime) -> Result<String, ScannerError> {
    let datetime = OffsetDateTime::from(system_time);
    Ok(datetime.format(&Rfc3339)?)
}

#[cfg(any(target_os = "macos", all(unix, not(target_os = "macos"))))]
fn platform_file_id(metadata: &Metadata) -> Option<String> {
    use std::os::unix::fs::MetadataExt;

    Some(format!(
        "{}:{}:{}",
        platform_name(),
        metadata.dev(),
        metadata.ino()
    ))
}

#[cfg(not(unix))]
fn platform_file_id(_metadata: &Metadata) -> Option<String> {
    None
}

#[cfg(any(target_os = "macos", all(unix, not(target_os = "macos"))))]
fn metadata_json(metadata: &Metadata) -> String {
    use std::os::unix::fs::MetadataExt;

    json!({
        "platform_file_identity": {
            "platform": platform_name(),
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

#[cfg(any(target_os = "macos", all(unix, not(target_os = "macos"))))]
fn permissions_json(metadata: &Metadata) -> String {
    use std::os::unix::fs::MetadataExt;

    json!({
        "platform": platform_name(),
        "owner": metadata.uid(),
        "group": metadata.gid(),
        "mode": metadata.mode(),
        "mode_octal": format!("{:o}", metadata.mode() & 0o7777),
        "readonly": metadata.permissions().readonly(),
    })
    .to_string()
}

#[cfg(target_os = "macos")]
fn platform_name() -> &'static str {
    "macos"
}

#[cfg(all(unix, not(target_os = "macos")))]
fn platform_name() -> &'static str {
    "unix"
}

#[cfg(windows)]
fn permissions_json(metadata: &Metadata) -> String {
    use std::os::windows::fs::MetadataExt;

    json!({
        "platform": "windows",
        "file_attributes": metadata.file_attributes(),
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
