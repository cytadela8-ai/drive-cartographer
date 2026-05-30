import type { PrismaClient } from "../generated/prisma/client";

import { loadConfig } from "./config";
import { createPrismaClient } from "./db";
import { importArtifact } from "./importer";

export type ClaimedImportJob = {
  jobId: string;
  artifactId: string;
};

export type ImportWorkerOptions = {
  pollIntervalMs?: number;
  processNext?: () => Promise<boolean>;
  sleep?: (milliseconds: number) => Promise<void>;
  stopSignal?: AbortSignal;
};

export async function runNextImportJob(): Promise<boolean> {
  const config = loadConfig();
  const prisma = createPrismaClient(config.databaseUrl);
  const job = await claimNextImportJob(prisma);

  if (job === null) {
    await prisma.$disconnect();
    return false;
  }

  await importArtifact(prisma, job.artifactId, {
    claimedJobId: job.jobId,
  });
  await prisma.$disconnect();
  return true;
}

export async function claimNextImportJob(
  prisma: PrismaClient,
): Promise<ClaimedImportJob | null> {
  const rows = await prisma.$queryRaw<ClaimedImportJob[]>`
    UPDATE "ImportJob"
    SET
      "status" = 'RUNNING'::"ImportJobStatus",
      "attempts" = "attempts" + 1,
      "startedAt" = NOW(),
      "completedAt" = NULL,
      "lastError" = NULL,
      "updatedAt" = NOW()
    WHERE "id" = (
      SELECT "id"
      FROM "ImportJob"
      WHERE "status" = 'PENDING'::"ImportJobStatus"
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id" AS "jobId", "artifactId"
  `;

  return rows[0] ?? null;
}

export async function runImportWorker(options: ImportWorkerOptions = {}): Promise<void> {
  const processNext = options.processNext ?? runNextImportJob;
  const sleep = options.sleep ?? sleepMilliseconds;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;

  while (options.stopSignal?.aborted !== true) {
    const processed = await processNext();
    if (!processed) {
      await sleep(pollIntervalMs);
    }
  }
}

function sleepMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

if ((import.meta as ImportMeta & { main?: boolean }).main === true) {
  await runImportWorker();
}
