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
- Add real MIME detection through libmagic in the scanner.
- Add normalized EXIF extraction for common image files.
- Improve scanner progress output with user-facing terminal progress bars for
  enumeration, processing, finalization, and upload.
- Add scanner config documentation for roots, source names, cache path, server
  URL, and exclude patterns.
- Add a worker runtime entrypoint that continuously claims pending import jobs
  instead of only exposing `runNextImportJob`.
- Add end-to-end smoke coverage for scanner CSV output -> admin/server import ->
  explorer query.
- Decide the integration flow for the GitHub repo default branch. The current
  GitHub default branch is `design/central-file-management` because the repo was
  created from this branch.
