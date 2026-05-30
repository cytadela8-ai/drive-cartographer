# TODO

Remaining gaps before Drive Cartographer is a complete usable MVP:

- Add real MIME detection through libmagic in the scanner.
- Add normalized EXIF extraction for common image files.
- Improve scanner progress output with user-facing terminal progress bars for
  enumeration, processing, finalization, and upload.
- Add platform file identity to scanner cache keys where available, not only
  path, size, and modification timestamp.
- Complete ownership and permission metadata collection for Windows and macOS,
  including ACL summaries where practical.
- Add end-to-end smoke coverage for scanner CSV output -> admin/server import ->
  explorer query.
- Configure a Bun-compatible dependency security scan. `bun pm scan` currently
  requires an explicit scanner package configuration.
