import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createPrismaClient } from "../../src/server/db";
import { importArtifact } from "../../src/server/importer";
import { writeSyntheticCsv } from "./generateCsv";

const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgresql://drive:drive@localhost:5432/drive_cartographer";
const prisma = createPrismaClient(databaseUrl);

describe("import performance guardrail", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("imports a generated 1000 row scan within the local threshold", async () => {
    const dir = mkdtempSync(join(tmpdir(), "drive-cartographer-"));
    const csvPath = join(dir, "perf.csv");
    writeSyntheticCsv({
      fileCount: 1000,
      duplicateEvery: 10,
      outputPath: csvPath,
      parentCount: 20,
    });
    const artifact = await createArtifact(csvPath);

    const startedAt = performance.now();
    const result = await importArtifact(prisma, artifact.id);
    const durationMs = performance.now() - startedAt;

    expect(result.fileCount).toBe(1000);
    expect(result.uniqueHashCount).toBe(100);
    expect(durationMs).toBeLessThan(10_000);
  });
});

async function createArtifact(storagePath: string) {
  const bytes = readFileSync(storagePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return prisma.scanArtifact.create({
    data: {
      storagePath,
      originalFilename: "perf.csv",
      sizeBytes: bytes.length,
      sha256,
      submissionMethod: "performance_test",
      status: "SAVED",
      importJobs: {
        create: {
          status: "PENDING",
        },
      },
    },
  });
}

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
