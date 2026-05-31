# TODO

Remaining gaps before Drive Cartographer is a complete usable MVP:

- Make large home-directory scans practical with generated/cache directory
  presets, dry-run estimation, pause/resume support, and clear cancellation
  behavior that cleans up or records partial artifacts.
- Add a plain periodic stderr progress fallback for nonstandard terminals and
  log-capture environments where the current terminal progress renderer is not
  visible during long scans.
- Rework imports for large real scans with chunked transactions, bulk inserts,
  preloaded root/hash maps, and resumable job state.
- Add real tree navigation in Explorer, including enter-folder behavior,
  breadcrumb/up navigation, and requests for non-root `parentRelativePath`
  values.
- Implement the Scans view so it lists imported scans and useful scan details
  instead of always showing the placeholder empty state.
- Verify native Windows/macOS ACL summaries before adding platform-specific
  ownership APIs beyond the current standard-library metadata.
