# Central File Management MVP Design

Date: 2026-05-30

## Purpose

Build an end-to-end MVP for understanding where files exist across machines,
drives, backups, and NAS mounts. The first version focuses on a single central
service with complete source/root snapshots, duplicate visibility, and historical
context for paths that existed in prior scans.

The MVP is read-only. It helps answer:

- Which files are duplicated?
- Where does each duplicate live now?
- What used to be present in this directory in previous scans?
- Where did this file hash appear before?

The MVP does not include authentication, automated deletion jobs, or type-based
file browsing.

## Architecture

The system has three runtime pieces.

1. Rust scanner
   - Scans complete configured root sets.
   - Computes SHA-256 hashes with a local cache.
   - Collects file metadata.
   - Writes a CSV artifact.
   - Uploads the CSV when a server is configured and reachable.

2. Bun web service and worker
   - Accepts scanner uploads and admin UI uploads.
   - Saves every submitted CSV to disk before database import.
   - Creates a database-backed import job.
   - Imports asynchronously in a worker thread or worker process.

3. Postgres and web frontend
   - Stores normalized scan facts.
   - Serves indexed, scoped explorer queries.
   - Provides a tree-first UI for current files, duplicates, and optional
     previous-scan context.

Deployment target is Docker Compose with Postgres, the Bun application, a worker,
and a bind-mounted artifact archive directory.

## Scope Decisions

- Target scale: 1-5 million file locations.
- Scan semantics: each scan is a complete snapshot for one source and one or
  more declared roots.
- Source identity: scanner defaults to hostname but allows a configured stable
  source name.
- Path identity: store exact absolute paths and normalized root-relative paths.
- History overlay: compare previous scans only for the same source and root.
- Operating systems: Linux, macOS, and Windows from day one.
- File type browsing: out of MVP.
- Optimization policy: start with normalized Postgres tables and concrete
  indexes. Do not add materialized views or derived read tables until
  performance tests or query plans show a specific need.

## Database Model

### `sources`

Logical machine or storage source.

Fields:

- `id`
- `name`
- `hostname`
- `os`
- `created_at`
- `updated_at`

`name` is stable user-facing identity. It may default to hostname.

### `roots`

Logical roots under a source.

Fields:

- `id`
- `source_id`
- `label`
- `absolute_path`
- `filesystem_metadata_json`
- `created_at`
- `updated_at`

Unique key: `(source_id, label)`.

### `scan_artifacts`

Original CSV files saved on the server before import.

Fields:

- `id`
- `storage_path`
- `original_filename`
- `size_bytes`
- `sha256`
- `submission_method`
- `status`
- `created_at`
- `updated_at`

`submission_method` distinguishes scanner upload, admin upload, and server-side
requeue from an already archived artifact.

### `import_jobs`

Simple database-backed task queue.

Fields:

- `id`
- `artifact_id`
- `status`
- `attempts`
- `last_error`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

Workers claim pending jobs with row locking.

### `scans`

Completed or failed scan import records.

Fields:

- `id`
- `source_id`
- `artifact_id`
- `scanner_version`
- `started_at`
- `finished_at`
- `import_status`
- `file_count`
- `unique_hash_count`
- `error_count`
- `created_at`
- `updated_at`

Only completed scans are visible in the explorer by default.

### `scan_roots`

Roots included in a scan.

Fields:

- `scan_id`
- `root_id`
- `root_path_seen`
- `file_count`
- `error_count`
- `status`

Primary key: `(scan_id, root_id)`.

### `file_hashes`

Content identity.

Fields:

- `id`
- `sha256`
- `size_bytes`
- `mime_type`
- `exif_json`
- `first_seen_at`
- `last_seen_at`

Unique key: `sha256`.

The importer rejects or flags rows where the same SHA-256 appears with a
different size.

### `file_locations`

One observed file path in one scan root.

Fields:

- `id`
- `scan_id`
- `root_id`
- `hash_id`
- `absolute_path`
- `relative_path`
- `parent_relative_path`
- `basename`
- `created_at_fs`
- `modified_at_fs`
- `ownership_permissions_json`
- `metadata_json`
- `created_at`

Unique key: `(scan_id, root_id, relative_path)`.

### Initial Indexes

Indexes are tied to known MVP queries:

- `(scan_id, root_id, parent_relative_path)` for directory child listing.
- `(scan_id, root_id, relative_path)` for scan path lookup and uniqueness.
- `(hash_id)` for duplicate location lookup.
- `(root_id, relative_path, scan_id)` for same-root history checks.
- `(source_id, created_at)` on `scans` for recent scan listing.
- `(artifact_id)` on `import_jobs` and `scans`.

Avoid broad, speculative indexes. Add indexes after observing query plans.

## Scanner Design

The Rust scanner is a CLI with these modes:

- `scan`: scan configured roots, write a CSV artifact, and upload if possible.
- `upload`: upload an existing CSV artifact.
- `scan --full-rehash`: bypass cache and recompute hashes.

Configuration includes:

- optional `source_name`, defaulting to hostname
- roots with `label` and `path`
- optional server URL
- local cache path
- exclude patterns

### Scan Phases

1. Enumerate
   - Walk configured roots.
   - Count candidate files and apparent bytes.
   - Count skipped paths and immediate metadata errors.
   - Show progress with counters while totals are still unknown.

2. Process
   - Walk roots again.
   - Use cache when cheap metadata proves a file is unchanged.
   - Hash with buffered reads when needed.
   - Collect MIME type with libmagic.
   - Collect normalized EXIF summary for common image files.
   - Stream rows through a buffered CSV writer.
   - Show files processed, bytes processed, cache hits, errors, current root,
     and ETA when enough progress data exists.

3. Finalize
   - Write artifact manifest or metadata header.
   - Compute artifact checksum.
   - Print scan totals.

4. Upload
   - Upload with byte progress when server config is present.
   - On failure, leave the CSV artifact on disk and print the path for admin
     import.

### Memory Policy

The scanner must not accumulate all rows or full file lists in memory.

- Enumeration keeps counters and bounded diagnostics only.
- Processing streams one row at a time to a buffered CSV writer.
- Hashing uses buffered reads.
- Large diagnostics go to a sidecar log or manifest as they occur.
- EXIF parsing must stay bounded and avoid loading arbitrary large files into
  memory.

### Cache

Use a local SQLite cache keyed by source, root, absolute path, size, mtime, and
platform file identity where available.

A cache hit can reuse SHA-256 only when identity and cheap metadata match. A full
rehash mode bypasses the cache.

### Metadata

Per file row includes:

- SHA-256
- size bytes
- exact absolute path
- root label
- relative path
- creation timestamp when available
- modification timestamp
- ownership and permissions JSON
- MIME type from libmagic
- normalized EXIF summary JSON when available

Ownership and permission metadata use stable top-level JSON keys such as
`platform`, `owner`, `group`, `mode`, and `acl_summary`, with platform-specific
details nested below.

Per-file errors are recorded as diagnostics and do not abort the whole scan.
Invalid root config or unwritable output paths fail fast.

### CSV Artifact Schema

The CSV is self-contained so an offline artifact can be imported later without
needing scanner-local state.

Required columns:

- `schema_version`
- `source_name`
- `hostname`
- `os`
- `scanner_version`
- `scan_started_at`
- `scan_finished_at`
- `root_label`
- `root_path_seen`
- `sha256`
- `size_bytes`
- `absolute_path`
- `relative_path`
- `parent_relative_path`
- `basename`
- `created_at_fs`
- `modified_at_fs`
- `mime_type`
- `ownership_permissions_json`
- `exif_json`
- `metadata_json`

Timestamps use ISO 8601 UTC when available. Empty timestamp fields mean the
platform or filesystem did not provide the value. JSON fields contain valid JSON
objects; unavailable data is represented as `{}`.

## Ingestion And Worker

All ingestion begins by saving the original CSV artifact to disk.

Ingestion paths:

- Scanner upload.
- Admin UI upload.
- Admin requeue from an existing archived artifact.

Request handler responsibilities:

- Save upload to the archive directory.
- Compute artifact checksum and size while saving.
- Create `scan_artifacts`.
- Create `import_jobs`.
- Return job status quickly.

Worker responsibilities:

- Claim pending jobs with row locking.
- Validate artifact format and manifest.
- Create or update sources and roots.
- Create scans and scan roots.
- Bulk load rows into staging.
- Validate required fields and uniqueness.
- Upsert file hashes.
- Insert file locations.
- Commit scan visibility only after successful import.
- Record counts, duration, and errors.

Failure behavior:

- Invalid CSV marks the job failed with a clear message.
- Transient failures retry with capped attempts.
- Partial imports roll back.
- Reimporting the same artifact checksum is rejected by default. Admin requeue
  retries the same import job or creates a replacement job for a failed import;
  it does not create a second completed scan for the same artifact.

## Frontend Design

The frontend is a local admin/explorer app with no authentication.

Technology:

- Bun TypeScript application
- TanStack Router
- TanStack Query
- TanStack Virtual
- Prisma for database access
- shadcn-style component primitives customized for the app

Screens:

1. Imports
   - Upload CSV artifacts.
   - View queued, running, failed, and completed import jobs.
   - Retry failed jobs.
   - Show clear failure messages.

2. Scans
   - List sources, roots, scans, timestamps, scanner versions, artifact links,
     and summary counts.

3. Explorer
   - Select source, root, and scan.
   - Browse a virtualized directory tree.
   - Show current scan by default.
   - Optional previous entries overlay for the same source/root.
   - Visually distinguish previous-only entries.
   - Show duplicate count per file.
   - Open a detail drawer for all current locations of the same hash.
   - When history is enabled, also show prior locations of the same hash.

Performance behavior:

- Fetch immediate directory children by source/root/scan/parent path.
- Batch duplicate count lookups for visible rows.
- Paginate and sort server-side.
- Do not load whole trees into the browser.
- Use query-plan and frontend performance tests to decide whether
  materialized views or derived tables are justified.

Visual direction:

Use a playful file-map/cartography feel while staying compact and operational.
Avoid a landing page; the first screen should be usable.

## API Sketch

- `POST /api/artifacts/upload`
  - multipart CSV upload
  - returns artifact id and import job id
- `GET /api/import-jobs`
  - filters: `status`, `limit`, `cursor`
- `POST /api/import-jobs/:id/retry`
  - retries a failed import job
- `GET /api/sources`
  - lists sources with latest completed scan summary
- `GET /api/sources/:id/roots`
  - lists roots for a source
- `GET /api/roots/:id/scans`
  - lists completed scans for a root, newest first
- `GET /api/explorer/children`
  - query: `scan_id`, `root_id`, `parent_relative_path`, `limit`, `cursor`,
    `sort`
  - returns immediate directories and files
  - optional query: `include_previous=true`
- `POST /api/explorer/duplicate-counts`
  - body: `{ "hash_ids": [...] }`
  - returns current duplicate counts for visible hashes
- `GET /api/hashes/:hashId/locations`
  - query: `current_scan_id`, `include_history`
  - returns current locations and, when requested, historical locations

## Testing Strategy

Scanner tests:

- path normalization
- cache hit and miss behavior
- CSV formatting
- metadata error handling
- integration scans over temporary directories
- small image fixtures for EXIF behavior

Backend tests:

- upload persistence
- import job state transitions
- CSV validation failures
- transactional import rollback
- uniqueness constraints
- explorer query behavior
- duplicate count behavior
- history overlay behavior

Frontend tests:

- URL/query state
- source/root/scan selector behavior
- virtualized explorer rendering
- duplicate drawer behavior
- history overlay behavior

Performance tests:

- synthetic CSV generator
- large import timing
- key query plan checks that fail on full table scans for scoped explorer
  queries
- frontend virtualization test with large directory listings

## Repository Structure

Planned structure:

```text
scanner/
web/
docs/
fixtures/
docker-compose.yml
.env.example
README.md
DEV.md
```

`README.md` will document user-facing setup and usage. `DEV.md` will document
architecture, module structure, and development workflows once implementation
begins.

## Implementation Planning Inputs

The implementation plan should choose exact dependency versions after checking
current stable releases. It should also set numeric performance thresholds for
import timing, query plans, and frontend virtualization before implementation
starts.
