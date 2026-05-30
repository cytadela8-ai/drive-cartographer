# TODO

Remaining gaps before Drive Cartographer is a complete usable MVP:

- Add the HTTP route layer for the web service:
  - artifact upload endpoint
  - import job listing and retry endpoints
  - source/root/scan listing endpoints
  - explorer children, duplicate counts, and hash locations endpoints
- Wire the admin upload UI to the artifact upload and import job APIs.
- Replace the scanner upload stub with real HTTP upload behavior and upload
  progress.
- Populate real `scan_started_at` and `scan_finished_at` values in scanner CSV
  output. The importer requires these timestamps, so scanner-produced CSVs are
  not yet importable without this fix.
- Add real MIME detection through libmagic in the scanner.
- Add normalized EXIF extraction for common image files.
- Improve scanner progress output with user-facing terminal progress bars for
  enumeration, processing, finalization, and upload.
- Add scanner config documentation for roots, source names, cache path, server
  URL, and exclude patterns.
- Apply configured scanner exclude patterns during both enumeration and
  processing.
- Add platform file identity to scanner cache keys where available, not only
  path, size, and modification timestamp.
- Complete ownership and permission metadata collection for Windows and macOS,
  including ACL summaries where practical.
- Support multi-root scan artifacts in the importer. Current import logic uses
  the first row's root for the whole artifact.
- Add a worker runtime entrypoint that continuously claims pending import jobs
  instead of only exposing `runNextImportJob`.
- Make import job claiming concurrency-safe with database row locking or an
  equivalent atomic status transition.
- Add retry behavior that resets failed import jobs cleanly without creating a
  second completed scan for the same artifact.
- Add end-to-end smoke coverage for scanner CSV output -> admin/server import ->
  explorer query.
- Configure a Bun-compatible dependency security scan. `bun pm scan` currently
  requires an explicit scanner package configuration.
