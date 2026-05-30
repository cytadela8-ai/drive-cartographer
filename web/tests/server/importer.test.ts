import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
