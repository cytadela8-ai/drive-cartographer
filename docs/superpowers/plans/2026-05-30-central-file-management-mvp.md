# Central File Management MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working end-to-end MVP with a Rust scanner that writes/upload CSV artifacts, a Bun/Postgres service that archives and imports them asynchronously, and a virtualized tree-first frontend for exploring files, duplicates, and previous-scan context.

**Architecture:** Keep the MVP normalized and Postgres-first. The scanner streams CSV output with bounded memory; the server saves artifacts before import; the worker imports into normalized tables; the frontend issues scoped indexed queries instead of relying on speculative read models.

**Tech Stack:** Rust 2024 edition, Cargo, SQLite scanner cache, libmagic-backed MIME detection, Bun, TypeScript ESM, Prisma, PostgreSQL, TanStack Router/Query/Virtual, React, shadcn-style local components, Docker Compose, Vitest, Playwright, cargo test/clippy/fmt.

---

## File Structure

Create this repository layout:

```text
scanner/
  Cargo.toml
  src/
    main.rs
    cli.rs
    config.rs
    csv_schema.rs
    errors.rs
    metadata.rs
    paths.rs
    progress.rs
    scanner.rs
    upload.rs
    cache.rs
  tests/
    scanner_integration.rs
  fixtures/
    tiny.jpg
web/
  package.json
  bun.lock
  tsconfig.json
  vite.config.ts
  vitest.config.ts
  playwright.config.ts
  prisma/
    schema.prisma
    migrations/
  src/
    server/
      app.ts
      config.ts
      db.ts
      index.ts
      worker.ts
      artifacts.ts
      importJobs.ts
      importer.ts
      csv.ts
      explorer.ts
      hashes.ts
      errors.ts
    client/
      main.tsx
      routes.tsx
      api.ts
      styles.css
      components/
        AppShell.tsx
        ImportsView.tsx
        ScansView.tsx
        ExplorerView.tsx
        FileDetailDrawer.tsx
        ui/
  tests/
    server/
      importer.test.ts
      explorer.test.ts
      artifacts.test.ts
    client/
      explorer.test.tsx
    performance/
      generateCsv.ts
      import.perf.test.ts
      queryPlans.test.ts
docker-compose.yml
.env.example
README.md
DEV.md
fixtures/
  scans/
    simple-scan.csv
```

Responsibilities:

- `scanner/src/scanner.rs`: orchestration for enumerate, process, finalize, upload.
- `scanner/src/csv_schema.rs`: one canonical CSV header and row serializer.
- `scanner/src/cache.rs`: SQLite cache reads/writes.
- `scanner/src/paths.rs`: source/root relative path normalization.
- `web/src/server/importer.ts`: artifact-to-database transaction.
- `web/src/server/explorer.ts`: indexed tree and history queries.
- `web/src/client/ExplorerView.tsx`: virtualized tree-first UI.

## Task 1: Repository Foundation

**Files:**
- Create: `README.md`
- Create: `DEV.md`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Write repository docs and config skeleton**

Create `README.md`:

```markdown
# Drive Cartographer

Drive Cartographer scans file trees, archives scan CSVs, imports them into
PostgreSQL, and provides a local web UI for exploring file locations,
duplicates, and previous-scan context.

## MVP Components

- `scanner/`: Rust CLI that scans configured roots and writes CSV artifacts.
- `web/`: Bun TypeScript service, worker, and frontend.
- `fixtures/`: small test scan artifacts.

## Development

```bash
docker compose up -d postgres
```

Implementation is tracked in `DEV.md`.
```

Create `DEV.md`:

```markdown
# Development Notes

## Architecture

The scanner produces durable CSV artifacts. The web service archives artifacts
before import. The worker imports artifacts into normalized PostgreSQL tables.
The frontend uses scoped indexed queries for tree browsing and duplicate
inspection.

## Planned Modules

- `scanner/src/scanner.rs`: scan orchestration.
- `scanner/src/csv_schema.rs`: CSV header and row encoding.
- `scanner/src/cache.rs`: SQLite hash cache.
- `web/src/server/importer.ts`: CSV validation and database import.
- `web/src/server/explorer.ts`: directory, duplicate, and history queries.
- `web/src/client/ExplorerView.tsx`: virtualized file explorer.
```

Create `.env.example`:

```dotenv
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer
ARTIFACT_ARCHIVE_DIR=./data/artifacts
WEB_PORT=3000
```

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: drive_cartographer
      POSTGRES_USER: drive
      POSTGRES_PASSWORD: drive
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

Update `.gitignore`:

```gitignore
.superpowers/
.env
data/
node_modules/
target/
dist/
coverage/
```

- [ ] **Step 2: Validate Docker Compose syntax**

Run:

```bash
docker compose config
```

Expected: command exits 0 and prints a normalized Compose config.

- [ ] **Step 3: Commit**

```bash
git add README.md DEV.md .env.example docker-compose.yml .gitignore
git commit -m "Add repository foundation"
```

## Task 2: Rust Scanner Skeleton And CSV Schema

**Files:**
- Create: `scanner/Cargo.toml`
- Create: `scanner/src/main.rs`
- Create: `scanner/src/cli.rs`
- Create: `scanner/src/csv_schema.rs`
- Create: `scanner/src/errors.rs`
- Create: `scanner/src/paths.rs`
- Create: `scanner/tests/scanner_integration.rs`

- [ ] **Step 1: Check current crate versions**

Run:

```bash
cargo search clap --limit 1
cargo search csv --limit 1
cargo search serde --limit 1
cargo search thiserror --limit 1
```

Expected: each command returns the current latest crate version. Use exact
versions in `scanner/Cargo.toml`.

- [ ] **Step 2: Write failing CSV schema tests**

Create `scanner/tests/scanner_integration.rs`:

```rust
use drive_cartographer_scanner::csv_schema::{CsvFileRow, CSV_HEADER};
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
    let row = CsvFileRow::minimal_for_test(
        "source-a",
        "root-a",
        "/data/root/file.txt",
        "file.txt",
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        0,
    );

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
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cargo test --manifest-path scanner/Cargo.toml
```

Expected: FAIL because the scanner crate and modules do not exist yet.

- [ ] **Step 4: Create minimal scanner crate**

Create `scanner/Cargo.toml` with exact versions found in Step 1:

```toml
[package]
name = "drive-cartographer-scanner"
version = "0.1.0"
edition = "2024"

[lib]
name = "drive_cartographer_scanner"
path = "src/lib.rs"

[[bin]]
name = "drive-cartographer-scan"
path = "src/main.rs"

[dependencies]
clap = { version = "4.6.1", features = ["derive"] }
csv = "1.4.0"
serde = { version = "1.0.228", features = ["derive"] }
thiserror = "2.0.18"
```

Create `scanner/src/lib.rs`:

```rust
pub mod cli;
pub mod csv_schema;
pub mod errors;
pub mod paths;
```

Create `scanner/src/main.rs`:

```rust
use drive_cartographer_scanner::cli::Cli;

fn main() {
    let _cli = Cli::parse_args();
}
```

Create `scanner/src/cli.rs`:

```rust
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(name = "drive-cartographer-scan")]
#[command(about = "Scan file roots and produce Drive Cartographer CSV artifacts")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Scan {
        #[arg(long)]
        config: PathBuf,
        #[arg(long)]
        full_rehash: bool,
    },
    Upload {
        #[arg(long)]
        artifact: PathBuf,
        #[arg(long)]
        server_url: String,
    },
}

impl Cli {
    pub fn parse_args() -> Self {
        Self::parse()
    }
}
```

Create `scanner/src/errors.rs`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ScannerError {
    #[error("invalid relative path: {path}")]
    InvalidRelativePath { path: String },
}
```

Create `scanner/src/paths.rs`:

```rust
#[derive(Debug, Eq, PartialEq)]
pub struct RelativePathParts {
    pub parent_relative_path: String,
    pub basename: String,
}

pub fn split_relative_path(relative_path: &str) -> RelativePathParts {
    let normalized = relative_path.replace('\\', "/");
    let trimmed = normalized.trim_matches('/');

    match trimmed.rsplit_once('/') {
        Some((parent, basename)) => RelativePathParts {
            parent_relative_path: parent.to_string(),
            basename: basename.to_string(),
        },
        None => RelativePathParts {
            parent_relative_path: String::new(),
            basename: trimmed.to_string(),
        },
    }
}
```

Create `scanner/src/csv_schema.rs`:

```rust
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

impl CsvFileRow {
    pub fn minimal_for_test(
        source_name: &str,
        root_label: &str,
        absolute_path: &str,
        relative_path: &str,
        sha256: &str,
        size_bytes: u64,
    ) -> Self {
        let parts = crate::paths::split_relative_path(relative_path);

        Self {
            schema_version: "1".to_string(),
            source_name: source_name.to_string(),
            hostname: "test-host".to_string(),
            os: "linux".to_string(),
            scanner_version: env!("CARGO_PKG_VERSION").to_string(),
            scan_started_at: "2026-05-30T00:00:00Z".to_string(),
            scan_finished_at: "2026-05-30T00:00:01Z".to_string(),
            root_label: root_label.to_string(),
            root_path_seen: "/data/root".to_string(),
            sha256: sha256.to_string(),
            size_bytes,
            absolute_path: absolute_path.to_string(),
            relative_path: relative_path.to_string(),
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
```

- [ ] **Step 5: Run scanner tests**

Run:

```bash
cargo test --manifest-path scanner/Cargo.toml
cargo fmt --manifest-path scanner/Cargo.toml -- --check
cargo clippy --manifest-path scanner/Cargo.toml --all-targets -- -D warnings
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add scanner
git commit -m "Add scanner CSV schema"
```

## Task 3: Scanner Streaming Scan, Cache, And Upload

**Files:**
- Create: `scanner/src/config.rs`
- Create: `scanner/src/cache.rs`
- Create: `scanner/src/metadata.rs`
- Create: `scanner/src/progress.rs`
- Create: `scanner/src/scanner.rs`
- Create: `scanner/src/upload.rs`
- Modify: `scanner/src/lib.rs`
- Modify: `scanner/src/main.rs`
- Modify: `scanner/Cargo.toml`
- Modify: `scanner/tests/scanner_integration.rs`

- [ ] **Step 1: Check current crate versions**

Run:

```bash
cargo search sha2 --limit 1
cargo search rusqlite --limit 1
cargo search walkdir --limit 1
cargo search indicatif --limit 1
cargo search reqwest --limit 1
cargo search serde_json --limit 1
cargo search toml --limit 1
```

Expected: each command returns the current latest crate version. Add exact
versions to `scanner/Cargo.toml`.

- [ ] **Step 2: Add integration tests for streaming scan output**

Append to `scanner/tests/scanner_integration.rs`:

```rust
use drive_cartographer_scanner::config::{RootConfig, ScannerConfig};
use drive_cartographer_scanner::scanner::{run_scan, ScanOptions};
use std::fs;

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
            path: root.clone(),
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
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cargo test --manifest-path scanner/Cargo.toml scan_streams_csv_rows_for_files_in_configured_root
```

Expected: FAIL because config and scanner modules do not exist.

- [ ] **Step 4: Create the streaming scanner modules**

Create modules with these public entry points:

- `ScannerConfig` and `RootConfig` in `scanner/src/config.rs`.
- `run_scan` in `scanner/src/scanner.rs`.
- `HashCache` in `scanner/src/cache.rs`.
- `collect_metadata` in `scanner/src/metadata.rs`.
- `upload_artifact` stub returning a clear error when HTTP upload is not yet wired.
- progress helpers in `scanner/src/progress.rs`.

Rules for the module bodies:

- Enumeration counts files and bytes without storing all paths.
- Processing walks again and writes each row immediately with `csv::Writer`.
- Hashing reads with a fixed buffer.
- Per-file metadata failures increment error counters and continue.
- Invalid roots fail before processing.

- [ ] **Step 5: Run scanner verification**

Run:

```bash
cargo test --manifest-path scanner/Cargo.toml
cargo fmt --manifest-path scanner/Cargo.toml -- --check
cargo clippy --manifest-path scanner/Cargo.toml --all-targets -- -D warnings
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add scanner
git commit -m "Implement streaming scanner"
```

## Task 4: Web Project, Prisma Schema, And Database Indexes

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/vitest.config.ts`
- Create: `web/prisma/schema.prisma`
- Create: `web/src/server/db.ts`
- Create: `web/src/server/config.ts`
- Create: `web/tests/server/schema.test.ts`

- [ ] **Step 1: Check current package versions**

Run:

```bash
npm view @prisma/client version
npm view prisma version
npm view typescript version
npm view vitest version
npm view vite version
npm view react version
npm view react-dom version
npm view @vitejs/plugin-react version
npm view @tanstack/react-query version
npm view @tanstack/react-router version
npm view @tanstack/react-virtual version
```

Expected: each command prints a version. Pin exact versions in
`web/package.json`.

- [ ] **Step 2: Create web package**

Create `web/package.json` using exact versions from Step 1:

```json
{
  "name": "drive-cartographer-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "server": "bun run src/server/index.ts",
    "worker": "bun run src/server/worker.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "@prisma/client": "7.8.0",
    "@tanstack/react-query": "5.100.14",
    "@tanstack/react-router": "1.170.10",
    "@tanstack/react-virtual": "3.13.26",
    "react": "19.2.6",
    "react-dom": "19.2.6"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "6.0.2",
    "prisma": "7.8.0",
    "typescript": "6.0.3",
    "vite": "8.0.14",
    "vitest": "4.1.7"
  }
}
```

Create strict `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Add Prisma schema**

Create `web/prisma/schema.prisma` with models matching the approved design:
`Source`, `Root`, `ScanArtifact`, `ImportJob`, `Scan`, `ScanRoot`,
`FileHash`, and `FileLocation`.

Required indexes:

```prisma
@@index([scanId, rootId, parentRelativePath])
@@unique([scanId, rootId, relativePath])
@@index([hashId])
@@index([rootId, relativePath, scanId])
```

- [ ] **Step 4: Generate Prisma client**

Run:

```bash
cd web
bun install
bunx prisma generate
bun run typecheck
```

Expected: install, Prisma generation, and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "Add web database schema"
```

## Task 5: Artifact Upload, Queue, And Import Worker

**Files:**
- Create: `web/src/server/artifacts.ts`
- Create: `web/src/server/csv.ts`
- Create: `web/src/server/importJobs.ts`
- Create: `web/src/server/importer.ts`
- Create: `web/src/server/worker.ts`
- Create: `web/src/server/index.ts`
- Create: `web/tests/server/importer.test.ts`
- Create: `fixtures/scans/simple-scan.csv`

- [ ] **Step 1: Write importer behavior tests**

Create `fixtures/scans/simple-scan.csv` with the CSV header from the spec and
two file rows sharing one hash.

Create `web/tests/server/importer.test.ts` with tests for:

- importing one artifact creates source, root, scan, hashes, and locations
- importing the same artifact checksum twice is rejected
- malformed CSV marks the job failed with a readable error

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd web
bun test tests/server/importer.test.ts
```

Expected: FAIL because importer modules do not exist.

- [ ] **Step 3: Create artifact archive and importer modules**

Create modules with these behaviors:

- artifact saving with streaming checksum calculation
- `ImportJob` creation
- CSV header validation
- staging parser that validates required fields
- transactional import into normalized tables
- failed job error capture
- duplicate artifact checksum rejection

- [ ] **Step 4: Run backend verification**

Run:

```bash
cd web
bun test tests/server/importer.test.ts
bun run typecheck
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add web fixtures
git commit -m "Implement artifact import worker"
```

## Task 6: Explorer API

**Files:**
- Create: `web/src/server/explorer.ts`
- Create: `web/src/server/hashes.ts`
- Create: `web/tests/server/explorer.test.ts`

- [ ] **Step 1: Write explorer query tests**

Create tests that seed:

- two scans for the same source/root
- one file present in both scans
- one file present only in the previous scan
- one hash with duplicate current locations

Assert:

- child listing returns only immediate children for a parent
- `include_previous=true` includes previous-only entries for same source/root
- duplicate counts are batched by hash id
- hash locations include historical rows only when requested

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd web
bun test tests/server/explorer.test.ts
```

Expected: FAIL because explorer query modules do not exist.

- [ ] **Step 3: Create explorer and hash query functions**

Create scoped Prisma queries for:

- directory children by `scan_id`, `root_id`, `parent_relative_path`
- previous entries by same `root_id` and `relative_path` from older scans
- duplicate counts grouped by hash id for supplied visible hash ids
- hash locations filtered to current scan by default

- [ ] **Step 4: Run backend verification**

Run:

```bash
cd web
bun test tests/server/explorer.test.ts
bun run typecheck
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "Add explorer queries"
```

## Task 7: Frontend MVP

**Files:**
- Create: `web/index.html`
- Create: `web/src/client/main.tsx`
- Create: `web/src/client/routes.tsx`
- Create: `web/src/client/api.ts`
- Create: `web/src/client/styles.css`
- Create: `web/src/client/components/AppShell.tsx`
- Create: `web/src/client/components/ImportsView.tsx`
- Create: `web/src/client/components/ScansView.tsx`
- Create: `web/src/client/components/ExplorerView.tsx`
- Create: `web/src/client/components/FileDetailDrawer.tsx`
- Create: `web/tests/client/explorer.test.tsx`

- [ ] **Step 1: Write frontend behavior tests**

Create tests for:

- Explorer renders source/root/scan selectors.
- Explorer requests children for selected scan/root.
- Toggling history adds `include_previous=true`.
- Large child arrays render through virtualization without mounting every row.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd web
bun test tests/client/explorer.test.tsx
```

Expected: FAIL because frontend modules do not exist.

- [ ] **Step 3: Create frontend screens and components**

Create:

- app shell with Imports, Scans, Explorer tabs
- API client wrappers
- Imports upload/job table
- Scans list
- Explorer virtualized directory rows
- duplicate count batching for visible file rows
- detail drawer for hash locations
- cartography-inspired CSS with compact operational layout

- [ ] **Step 4: Run frontend verification**

Run:

```bash
cd web
bun test tests/client/explorer.test.tsx
bun run typecheck
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "Add frontend explorer MVP"
```

## Task 8: Performance And Query Plan Tests

**Files:**
- Create: `web/tests/performance/generateCsv.ts`
- Create: `web/tests/performance/import.perf.test.ts`
- Create: `web/tests/performance/queryPlans.test.ts`
- Modify: `DEV.md`

- [ ] **Step 1: Write synthetic data generator**

Create a deterministic generator that writes CSV rows with configurable:

- number of roots
- directory fanout
- files per directory
- duplicate ratio
- scan count

- [ ] **Step 2: Write performance tests**

Add tests that:

- import at least 100k generated rows in CI/local perf mode
- run `EXPLAIN (FORMAT JSON)` for explorer child listing and hash lookup
- fail when scoped explorer queries use sequential scans on `file_locations`
- verify frontend virtualization does not mount all rows for a 10k-row directory

- [ ] **Step 3: Run performance tests**

Run:

```bash
cd web
bun test tests/performance
```

Expected: performance tests pass locally with documented thresholds.

- [ ] **Step 4: Document thresholds**

Update `DEV.md` with:

- how to generate synthetic scans
- how to run import performance tests
- which query plans are expected to use indexes

- [ ] **Step 5: Commit**

```bash
git add web DEV.md
git commit -m "Add performance guardrails"
```

## Task 9: End-To-End Verification And Docs

**Files:**
- Modify: `README.md`
- Modify: `DEV.md`
- Modify: `.env.example`

- [ ] **Step 1: Run full relevant verification**

Run:

```bash
cargo test --manifest-path scanner/Cargo.toml
cargo fmt --manifest-path scanner/Cargo.toml -- --check
cargo clippy --manifest-path scanner/Cargo.toml --all-targets -- -D warnings
cd web
bun test
bun run typecheck
docker compose config
```

Expected: all commands pass with no warnings.

- [ ] **Step 2: Smoke test scanner to importer flow**

Run:

```bash
cargo run --manifest-path scanner/Cargo.toml -- scan --config scanner/fixtures/example-config.toml
docker compose up -d postgres
cd web
bun run prisma:migrate
bun run server
```

Expected:

- scanner writes a CSV artifact
- upload or admin import saves the artifact
- worker imports it
- Explorer shows rows from the scan

- [ ] **Step 3: Update docs**

README must include:

- scanner config example
- running a scan
- starting Postgres and web service
- importing CSV from admin UI
- opening the explorer

DEV must include:

- module map
- database schema overview
- scanner memory model
- performance test workflow

- [ ] **Step 4: Commit**

```bash
git add README.md DEV.md .env.example
git commit -m "Document MVP usage"
```

## Self-Review Checklist

- Spec coverage:
  - Scanner CSV, cache, progress, streaming memory policy: Tasks 2 and 3.
  - Artifact archive, async import, queue: Task 5.
  - Normalized schema and indexes: Task 4.
  - Explorer tree, duplicates, history overlay: Tasks 6 and 7.
  - Performance guardrails: Task 8.
  - README and DEV updates: Tasks 1 and 9.
- Placeholder scan:
  - Dependency versions are pinned from `cargo search` and `npm view` results
    checked on 2026-05-30.
  - Tasks name concrete files and expected behaviors.
- Type consistency:
  - CSV column names match the design spec.
  - API concepts match frontend and backend task names.
