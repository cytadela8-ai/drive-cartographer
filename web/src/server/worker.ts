import { loadConfig } from "./config";
import { createPrismaClient } from "./db";
import { importArtifact } from "./importer";

export async function runNextImportJob(): Promise<boolean> {
  const config = loadConfig();
  const prisma = createPrismaClient(config.databaseUrl);
  const job = await prisma.importJob.findFirst({
    where: {
      status: "PENDING",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (job === null) {
    await prisma.$disconnect();
    return false;
  }

  await importArtifact(prisma, job.artifactId);
  await prisma.$disconnect();
  return true;
}
