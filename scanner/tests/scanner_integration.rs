use drive_cartographer_scanner::config::{RootConfig, ScannerConfig};
use drive_cartographer_scanner::csv_schema::{CSV_HEADER, CsvFileRow, MinimalFileRowInput};
use drive_cartographer_scanner::paths::split_relative_path;
use drive_cartographer_scanner::scanner::{ScanOptions, run_scan};
use std::collections::HashMap;
use std::fs;

#[test]
fn csv_header_contains_required_columns_in_stable_order() {
    assert_eq!(
        CSV_HEADER,
        [
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
        ]
    );
}

#[test]
fn file_row_serializes_json_objects_for_missing_metadata() {
    let row = CsvFileRow::minimal_for_test(MinimalFileRowInput {
        source_name: "source-a",
        root_label: "root-a",
        absolute_path: "/data/root/file.txt",
        relative_path: "file.txt",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        size_bytes: 0,
    });

    assert_eq!(row.ownership_permissions_json, "{}");
    assert_eq!(row.exif_json, "{}");
    assert_eq!(row.metadata_json, "{}");
}

#[test]
fn relative_path_split_handles_nested_files() {
    let parts = split_relative_path("photos/2024/image.jpg");

    assert_eq!(parts.parent_relative_path, "photos/2024");
    assert_eq!(parts.basename, "image.jpg");
}

#[test]
fn scan_streams_csv_rows_for_files_in_configured_root() {
    let temp = tempfile::tempdir().expect("create tempdir");
    let root = temp.path().join("root");
    fs::create_dir(&root).expect("create root");
    fs::write(root.join("alpha.txt"), b"alpha").expect("write alpha");

    let output = temp.path().join("scan.csv");
    let cache = temp.path().join("cache.sqlite");
    let config = ScannerConfig {
        source_name: Some("test-source".to_string()),
        roots: vec![RootConfig {
            label: "main".to_string(),
            path: root,
        }],
        server_url: None,
        cache_path: cache,
        exclude_patterns: Vec::new(),
    };

    let summary = run_scan(
        &config,
        &ScanOptions {
            output_path: output.clone(),
            full_rehash: false,
            upload: false,
        },
    )
    .expect("scan succeeds");

    let csv = fs::read_to_string(output).expect("read csv");
    assert_eq!(summary.files_written, 1);
    assert!(csv.contains("alpha.txt"));
    assert!(csv.contains("test-source"));
}

#[test]
fn scan_csv_rows_include_importable_scan_timestamps() {
    let temp = tempfile::tempdir().expect("create tempdir");
    let root = temp.path().join("root");
    fs::create_dir(&root).expect("create root");
    fs::write(root.join("alpha.txt"), b"alpha").expect("write alpha");

    let output = temp.path().join("scan.csv");
    let cache = temp.path().join("cache.sqlite");
    let config = ScannerConfig {
        source_name: Some("test-source".to_string()),
        roots: vec![RootConfig {
            label: "main".to_string(),
            path: root,
        }],
        server_url: None,
        cache_path: cache,
        exclude_patterns: Vec::new(),
    };

    run_scan(
        &config,
        &ScanOptions {
            output_path: output.clone(),
            full_rehash: false,
            upload: false,
        },
    )
    .expect("scan succeeds");

    let mut reader = csv::Reader::from_path(output).expect("open csv");
    let row = reader
        .deserialize::<HashMap<String, String>>()
        .next()
        .expect("one row")
        .expect("valid row");

    assert_importable_timestamp(row.get("scan_started_at").expect("started timestamp"));
    assert_importable_timestamp(row.get("scan_finished_at").expect("finished timestamp"));
}

fn assert_importable_timestamp(value: &str) {
    assert!(!value.is_empty());
    assert!(value.contains('T'));
    assert!(value.ends_with('Z'));
}
