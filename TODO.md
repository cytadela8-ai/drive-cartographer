# TODO

Remaining gaps before Drive Cartographer is a complete usable MVP:

- Add normalized EXIF extraction for common image files.
- Improve scanner progress output with user-facing terminal progress bars for
  enumeration, processing, finalization, and upload.
- Complete ownership and permission metadata collection for Windows and macOS,
  including ACL summaries where practical.
- Configure a Bun-compatible dependency security scan. `bun pm scan` currently
  requires an explicit scanner package configuration.
