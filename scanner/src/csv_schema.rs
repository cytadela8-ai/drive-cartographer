use serde::Serialize;

pub const CSV_HEADER: [&str; 21] = [
    "schema_version",
    "source_name",
    "hostname",
    "os",
    "scanner_version",
    "scan_started_at",
    "scan_finished_at",
    "root_label",
    "root_path_seen",
    "sha256",
    "size_bytes",
    "absolute_path",
    "relative_path",
    "parent_relative_path",
    "basename",
    "created_at_fs",
    "modified_at_fs",
    "mime_type",
    "ownership_permissions_json",
    "exif_json",
    "metadata_json",
];

#[derive(Debug, Clone, Serialize)]
pub struct CsvFileRow {
    pub schema_version: String,
    pub source_name: String,
    pub hostname: String,
    pub os: String,
    pub scanner_version: String,
    pub scan_started_at: String,
    pub scan_finished_at: String,
    pub root_label: String,
    pub root_path_seen: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub absolute_path: String,
    pub relative_path: String,
    pub parent_relative_path: String,
    pub basename: String,
    pub created_at_fs: String,
    pub modified_at_fs: String,
    pub mime_type: String,
    pub ownership_permissions_json: String,
    pub exif_json: String,
    pub metadata_json: String,
}

pub struct MinimalFileRowInput<'a> {
    pub source_name: &'a str,
    pub root_label: &'a str,
    pub absolute_path: &'a str,
    pub relative_path: &'a str,
    pub sha256: &'a str,
    pub size_bytes: u64,
}

impl CsvFileRow {
    pub fn minimal_for_test(input: MinimalFileRowInput<'_>) -> Self {
        let parts = crate::paths::split_relative_path(input.relative_path);

        Self {
            schema_version: "1".to_string(),
            source_name: input.source_name.to_string(),
            hostname: "test-host".to_string(),
            os: "linux".to_string(),
            scanner_version: env!("CARGO_PKG_VERSION").to_string(),
            scan_started_at: "2026-05-30T00:00:00Z".to_string(),
            scan_finished_at: "2026-05-30T00:00:01Z".to_string(),
            root_label: input.root_label.to_string(),
            root_path_seen: "/data/root".to_string(),
            sha256: input.sha256.to_string(),
            size_bytes: input.size_bytes,
            absolute_path: input.absolute_path.to_string(),
            relative_path: input.relative_path.to_string(),
            parent_relative_path: parts.parent_relative_path,
            basename: parts.basename,
            created_at_fs: String::new(),
            modified_at_fs: String::new(),
            mime_type: "application/octet-stream".to_string(),
            ownership_permissions_json: "{}".to_string(),
            exif_json: "{}".to_string(),
            metadata_json: "{}".to_string(),
        }
    }
}
