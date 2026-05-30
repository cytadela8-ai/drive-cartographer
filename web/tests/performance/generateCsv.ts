import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

export type SyntheticCsvOptions = {
  fileCount: number;
  duplicateEvery: number;
  outputPath: string;
  parentCount: number;
};

const HEADER = [
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

export function writeSyntheticCsv(options: SyntheticCsvOptions): void {
  const rows = [HEADER.join(",")];

  for (let index = 0; index < options.fileCount; index += 1) {
    const duplicateBucket = Math.floor(index / options.duplicateEvery);
    const parent = `dir-${index % options.parentCount}`;
    const basename = `file-${index}.txt`;
    const relativePath = `${parent}/${basename}`;
    const hash = createHash("sha256").update(`content-${duplicateBucket}`).digest("hex");

    rows.push(
      [
        "1",
        "perf-source",
        "perf-host",
        "linux",
        "0.1.0",
        "2026-05-30T00:00:00Z",
        "2026-05-30T00:00:01Z",
        "main",
        "/perf/root",
        hash,
        "12",
        `/perf/root/${relativePath}`,
        relativePath,
        parent,
        basename,
        "",
        "2026-05-30T00:00:00Z",
        "text/plain",
        "{}",
        "{}",
        "{}",
      ].join(","),
    );
  }

  writeFileSync(options.outputPath, `${rows.join("\n")}\n`);
}
