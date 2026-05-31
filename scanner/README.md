# Scanner

The scanner is a Rust CLI that walks configured roots, hashes files, extracts
filesystem metadata, detects MIME types with `libmagic`, writes CSV rows to
disk through a buffered writer, and can optionally upload the finished artifact
to the web service.

## Prerequisites

Install the system library used for MIME detection:

```bash
sudo apt-get install libmagic-dev
```

Build or run with Cargo:

```bash
cargo test --manifest-path scanner/Cargo.toml
cargo run --manifest-path scanner/Cargo.toml -- --help
```

## Commands

Show global help:

```bash
cargo run --manifest-path scanner/Cargo.toml -- --help
```

Create a CSV artifact:

```bash
cargo run --manifest-path scanner/Cargo.toml -- \
  scan \
  --config scanner/fixtures/example-config.toml \
  --output /tmp/drive-cartographer-example.csv
```

Force rehashing instead of reusing cached hashes:

```bash
cargo run --manifest-path scanner/Cargo.toml -- \
  scan \
  --config scanner/fixtures/example-config.toml \
  --output /tmp/drive-cartographer-example.csv \
  --full-rehash
```

Scan and upload when the server is reachable:

```bash
cargo run --manifest-path scanner/Cargo.toml -- \
  scan \
  --config scanner/fixtures/example-config.toml \
  --output /tmp/drive-cartographer-example.csv \
  --upload
```

Upload an existing artifact explicitly:

```bash
cargo run --manifest-path scanner/Cargo.toml -- \
  upload \
  --artifact /tmp/drive-cartographer-example.csv \
  --server-url http://localhost:3000
```

## Config File

The scanner reads a TOML config file.

Example:

```toml
source_name = "laptop-a"
cache_path = "data/scanner-cache.sqlite"
server_url = "http://localhost:3000"
exclude_patterns = ["*.tmp", ".git/**"]

[[roots]]
label = "photos"
path = "/Volumes/Photos"

[[roots]]
label = "documents"
path = "/home/user/Documents"
```

Fields:

- `source_name`: optional machine or source label stored with the scan. If
  omitted, the scanner falls back to `HOSTNAME`, then `unknown-host`.
- `cache_path`: required SQLite cache path used for hash reuse across scans.
- `server_url`: optional base URL used by `scan --upload`.
- `exclude_patterns`: optional glob patterns matched against root-relative
  paths during both enumeration and processing.
- `roots`: required list of named roots to scan.

## Output

Each run writes one CSV artifact. The scanner does not retain the full file list
in memory. It performs:

1. A first pass to count files and bytes for progress totals.
2. A second pass to hash files and append CSV rows through a buffered writer.
3. A final pass to stamp the completed scan timestamp consistently.

The CLI prints terminal progress for enumeration, processing, finalization, and
upload.

## Upload Behavior

`scan --upload` writes the CSV locally first, then posts it as multipart field
`artifact` to `{server_url}/api/artifacts/upload`.

If direct network access is not available, run `scan` without `--upload` and
import the CSV later through the web app. In both paths the CSV artifact is
preserved on disk before database import.

## Checks

Run the scanner validation commands:

```bash
cargo fmt --manifest-path scanner/Cargo.toml --check
cargo clippy --manifest-path scanner/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path scanner/Cargo.toml
```
