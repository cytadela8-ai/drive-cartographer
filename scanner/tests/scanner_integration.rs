use drive_cartographer_scanner::cache::{CacheLookup, HashCache};
use drive_cartographer_scanner::config::{RootConfig, ScannerConfig};
use drive_cartographer_scanner::csv_schema::{CSV_HEADER, CsvFileRow, MinimalFileRowInput};
use drive_cartographer_scanner::metadata::collect_metadata;
use drive_cartographer_scanner::paths::split_relative_path;
use drive_cartographer_scanner::scanner::{ScanOptions, run_scan};
use drive_cartographer_scanner::upload::upload_artifact;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc::{Receiver, channel};
use std::thread;
use std::time::{Duration, Instant};

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
fn metadata_uses_libmagic_for_mime_detection() {
    let temp = tempfile::tempdir().expect("create tempdir");
    let path = temp.path().join("alpha.txt");
    fs::write(&path, b"plain text\n").expect("write text file");

    let metadata = collect_metadata(&path).expect("collect metadata");

    assert_eq!(metadata.mime_type, "text/plain");
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
fn scan_applies_exclude_patterns_during_enumeration_and_processing() {
    let temp = tempfile::tempdir().expect("create tempdir");
    let root = temp.path().join("root");
    fs::create_dir(&root).expect("create root");
    fs::create_dir(root.join("ignored")).expect("create ignored dir");
    fs::write(root.join("keep.txt"), b"keep").expect("write keep");
    fs::write(root.join("skip.tmp"), b"skip").expect("write skip");
    fs::write(root.join("ignored").join("nested.txt"), b"nested").expect("write nested");

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
        exclude_patterns: vec!["*.tmp".to_string(), "ignored/**".to_string()],
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
    assert_eq!(summary.files_discovered, 1);
    assert_eq!(summary.files_written, 1);
    assert!(csv.contains("keep.txt"));
    assert!(!csv.contains("skip.tmp"));
    assert!(!csv.contains("nested.txt"));
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

#[test]
fn hash_cache_uses_platform_identity_when_file_path_changes() {
    let temp = tempfile::tempdir().expect("create tempdir");
    let cache = HashCache::open(&temp.path().join("cache.sqlite")).expect("open cache");
    let original = CacheLookup {
        source_name: "source-a",
        root_label: "main",
        absolute_path: "/data/root/a.txt",
        platform_file_id: Some("unix:1:99"),
        size_bytes: 5,
        modified_at_fs: "2026-05-30T00:00:00Z",
    };
    let moved = CacheLookup {
        source_name: "source-a",
        root_label: "main",
        absolute_path: "/data/root/moved/a.txt",
        platform_file_id: Some("unix:1:99"),
        size_bytes: 5,
        modified_at_fs: "2026-05-30T00:00:00Z",
    };

    cache.put(&original, "abc123").expect("store cache entry");

    assert_eq!(
        cache.get(&moved).expect("read moved entry"),
        Some("abc123".to_string())
    );
}

#[test]
fn hash_cache_rejects_same_path_when_platform_identity_changes() {
    let temp = tempfile::tempdir().expect("create tempdir");
    let cache = HashCache::open(&temp.path().join("cache.sqlite")).expect("open cache");
    let original = CacheLookup {
        source_name: "source-a",
        root_label: "main",
        absolute_path: "/data/root/a.txt",
        platform_file_id: Some("unix:1:99"),
        size_bytes: 5,
        modified_at_fs: "2026-05-30T00:00:00Z",
    };
    let replaced = CacheLookup {
        source_name: "source-a",
        root_label: "main",
        absolute_path: "/data/root/a.txt",
        platform_file_id: Some("unix:1:100"),
        size_bytes: 5,
        modified_at_fs: "2026-05-30T00:00:00Z",
    };

    cache.put(&original, "abc123").expect("store cache entry");

    assert_eq!(cache.get(&replaced).expect("read replaced entry"), None);
}

#[test]
fn upload_artifact_posts_csv_as_artifact_multipart_field() {
    let temp = tempfile::tempdir().expect("create tempdir");
    let artifact = temp.path().join("scan.csv");
    fs::write(&artifact, b"schema_version\n1\n").expect("write artifact");
    let (server_url, received) = start_capture_server();

    upload_artifact(&artifact, Some(&server_url)).expect("upload succeeds");

    let request = received
        .recv_timeout(Duration::from_secs(2))
        .expect("server receives upload request")
        .expect("server captures request");
    assert!(request.starts_with("POST /api/artifacts/upload HTTP/1.1"));
    assert!(
        request
            .to_lowercase()
            .contains("content-type: multipart/form-data; boundary=")
    );
    assert!(request.contains(r#"name="artifact"; filename="scan.csv""#));
    assert!(request.contains("schema_version\n1\n"));
}

fn assert_importable_timestamp(value: &str) {
    assert!(!value.is_empty());
    assert!(value.contains('T'));
    assert!(value.ends_with('Z'));
}

fn start_capture_server() -> (String, Receiver<Result<String, String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
    listener
        .set_nonblocking(true)
        .expect("configure nonblocking listener");
    let address = listener.local_addr().expect("server address");
    let (sender, receiver) = channel();

    thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(2);
        let result = loop {
            match listener.accept() {
                Ok((mut stream, _)) => break capture_http_request(&mut stream),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        break Err("timed out waiting for upload request".to_string());
                    }
                    thread::sleep(Duration::from_millis(10));
                }
                Err(error) => break Err(error.to_string()),
            }
        };
        sender.send(result).expect("send captured request");
    });

    (format!("http://{address}"), receiver)
}

fn capture_http_request(stream: &mut std::net::TcpStream) -> Result<String, String> {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 1024];
    loop {
        let read = stream
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("client closed before headers completed".to_string());
        }
        bytes.extend_from_slice(&buffer[..read]);
        if header_end_index(&bytes).is_some() {
            break;
        }
    }

    let header_end = header_end_index(&bytes).expect("headers exist");
    let headers = String::from_utf8_lossy(&bytes[..header_end]).to_string();
    let content_length = content_length(&headers)?;
    while bytes.len() < header_end + 4 + content_length {
        let read = stream
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read]);
    }
    stream
        .write_all(b"HTTP/1.1 201 Created\r\nContent-Length: 2\r\n\r\n{}")
        .map_err(|error| error.to_string())?;

    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn header_end_index(bytes: &[u8]) -> Option<usize> {
    bytes.windows(4).position(|window| window == b"\r\n\r\n")
}

fn content_length(headers: &str) -> Result<usize, String> {
    for line in headers.lines() {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.eq_ignore_ascii_case("content-length") {
            return value
                .trim()
                .parse::<usize>()
                .map_err(|error| error.to_string());
        }
    }
    Err("missing content-length header".to_string())
}
