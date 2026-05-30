import { beforeEach, describe, expect, it } from "vitest";

import { createPrismaClient } from "../../src/server/db";
import { claimNextImportJob, runImportWorker } from "../../src/server/worker";

const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgresql://drive:drive@localhost:5432/drive_cartographer";
const prisma = createPrismaClient(databaseUrl);

describe("worker queue", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("atomically claims distinct pending jobs", async () => {
    await createPendingArtifact("first.csv", "first-artifact");
    await createPendingArtifact("second.csv", "second-artifact");

    const claims = await Promise.all([
      claimNextImportJob(prisma),
      claimNextImportJob(prisma),
    ]);
    const jobs = await prisma.importJob.findMany({
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(new Set(claims.map((claim) => claim?.jobId)).size).toBe(2);
    expect(jobs.map((job) => job.status)).toEqual(["RUNNING", "RUNNING"]);
    expect(jobs.map((job) => job.attempts)).toEqual([1, 1]);
  });

  it("returns null when no pending jobs exist", async () => {
    await expect(claimNextImportJob(prisma)).resolves.toBeNull();
  });

  it("continues polling after an idle queue until stopped", async () => {
    const controller = new AbortController();
    let calls = 0;
    const processNext = async () => {
      calls += 1;
      return false;
    };
    const sleep = async (milliseconds: number) => {
      expect(milliseconds).toBe(25);
      if (calls >= 2) {
        controller.abort();
      }
    };

    await runImportWorker({
      pollIntervalMs: 25,
      processNext,
      sleep,
      stopSignal: controller.signal,
    });

    expect(calls).toBe(2);
  });
});

async function createPendingArtifact(originalFilename: string, sha256: string) {
  return prisma.scanArtifact.create({
    data: {
      originalFilename,
      sha256,
      sizeBytes: 1,
      status: "SAVED",
      storagePath: `/tmp/${originalFilename}`,
      submissionMethod: "test",
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
