import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createPrismaClient } from "../../src/server/db";
import { importArtifact } from "../../src/server/importer";

const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgresql://drive:drive@localhost:5432/drive_cartographer";
const prisma = createPrismaClient(databaseUrl);
const fixturePath = resolve("../fixtures/scans/simple-scan.csv");

describe("importArtifact", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("imports one artifact into normalized scan tables", async () => {
    const artifact = await createArtifact(fixturePath);

    const result = await importArtifact(prisma, artifact.id);

    expect(result.fileCount).toBe(2);
    expect(result.uniqueHashCount).toBe(1);
    await expect(prisma.source.count()).resolves.toBe(1);
    await expect(prisma.root.count()).resolves.toBe(1);
    await expect(prisma.scan.count()).resolves.toBe(1);
    await expect(prisma.fileHash.count()).resolves.toBe(1);
    await expect(prisma.fileLocation.count()).resolves.toBe(2);
  });

  it("imports file locations into the root named by each CSV row", async () => {
    const artifact = await createArtifact(writeMultiRootCsv());

    const result = await importArtifact(prisma, artifact.id);

    const roots = await prisma.root.findMany({
      orderBy: {
        label: "asc",
      },
    });
    const scanRoots = await prisma.scanRoot.findMany();
    const locations = await prisma.fileLocation.findMany({
      include: {
        root: true,
      },
      orderBy: {
        absolutePath: "asc",
      },
    });

    expect(result.fileCount).toBe(2);
    expect(roots.map((root) => root.label)).toEqual(["backup", "main"]);
    expect(scanRoots).toHaveLength(2);
    expect(locations.map((location) => location.root.label)).toEqual(["backup", "main"]);
  });

  it("rejects importing the same artifact as a second completed scan", async () => {
    const artifact = await createArtifact(fixturePath);

    await importArtifact(prisma, artifact.id);

    await expect(importArtifact(prisma, artifact.id)).rejects.toThrow(
      "already has a completed scan",
    );
  });

  it("marks malformed CSV jobs failed with a readable error", async () => {
    const artifact = await prisma.scanArtifact.create({
      data: {
        storagePath: resolve("../fixtures/scans/missing.csv"),
        originalFilename: "missing.csv",
        sizeBytes: 0,
        sha256: "missing-file-artifact",
        submissionMethod: "admin_upload",
        status: "SAVED",
        importJobs: {
          create: {
            status: "PENDING",
          },
        },
      },
      include: {
        importJobs: true,
      },
    });

    await expect(importArtifact(prisma, artifact.id)).rejects.toThrow("read artifact");
    const job = await prisma.importJob.findFirstOrThrow({
      where: {
        artifactId: artifact.id,
      },
    });
    expect(job.status).toBe("FAILED");
    expect(job.lastError).toContain("read artifact");
  });
});

async function createArtifact(storagePath: string) {
  const bytes = readFileSync(storagePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return prisma.scanArtifact.create({
    data: {
      storagePath,
      originalFilename: "simple-scan.csv",
      sizeBytes: bytes.length,
      sha256,
      submissionMethod: "admin_upload",
      status: "SAVED",
      importJobs: {
        create: {
          status: "PENDING",
        },
      },
    },
  });
}

function writeMultiRootCsv(): string {
  const directory = mkdtempSync(`${tmpdir()}/drive-cartographer-`);
  const path = `${directory}/multi-root.csv`;
  writeFileSync(path, `${CSV_HEADER}\n${csvRow("main")}\n${csvRow("backup")}\n`);
  return path;
}

function csvRow(rootLabel: string): string {
  const rootPath = `/data/${rootLabel}`;
  const basename = `${rootLabel}.txt`;
  return [
    "1",
    "test-source",
    "test-host",
    "linux",
    "0.1.0",
    "2026-05-30T00:00:00Z",
    "2026-05-30T00:00:01Z",
    rootLabel,
    rootPath,
    `${rootLabel}-hash`,
    "5",
    `${rootPath}/${basename}`,
    basename,
    "",
    basename,
    "",
    "2026-05-30T00:00:00Z",
    "text/plain",
    "{}",
    "{}",
    "{}",
  ].join(",");
}

const CSV_HEADER = [
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
].join(",");

async function cleanDatabase() {
  await prisma.fileLocation.deleteMany();
  await prisma.scanRoot.deleteMany();
  await prisma.scan.deleteMany();
  await prisma.fileHash.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.scanArtifact.deleteMany();
  await prisma.root.deleteMany();
  await prisma.source.deleteMany();
}
