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
    pub mime_type: String,
    pub ownership_permissions_json: String,
    pub exif_json: String,
    pub metadata_json: String,
}

pub fn collect_metadata(path: &Path) -> Result<FileMetadata, ScannerError> {
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
        mime_type: "application/octet-stream".to_string(),
        ownership_permissions_json: permissions_json(&metadata),
        exif_json: "{}".to_string(),
        metadata_json: "{}".to_string(),
    })
}

fn format_system_time(system_time: SystemTime) -> Result<String, ScannerError> {
    let datetime = OffsetDateTime::from(system_time);
    Ok(datetime.format(&Rfc3339)?)
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
