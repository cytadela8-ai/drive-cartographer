use drive_cartographer_scanner::csv_schema::{CSV_HEADER, CsvFileRow, MinimalFileRowInput};
use drive_cartographer_scanner::paths::split_relative_path;

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
