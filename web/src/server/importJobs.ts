import type { PrismaClient } from "../generated/prisma/client";

export async function markJobRunning(prisma: PrismaClient, artifactId: string): Promise<string> {
  const job = await prisma.importJob.findFirstOrThrow({
    where: {
      artifactId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  await prisma.importJob.update({
    where: {
      id: job.id,
    },
    data: {
      status: "RUNNING",
      attempts: {
        increment: 1,
      },
      startedAt: new Date(),
      lastError: null,
    },
  });

  return job.id;
}

export async function markJobCompleted(prisma: PrismaClient, jobId: string): Promise<void> {
  await prisma.importJob.update({
    where: {
      id: jobId,
    },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
}

export async function markJobFailed(
  prisma: PrismaClient,
  jobId: string,
  message: string,
): Promise<void> {
  await prisma.importJob.update({
    where: {
      id: jobId,
    },
    data: {
      status: "FAILED",
      lastError: message,
      completedAt: new Date(),
    },
  });
}
