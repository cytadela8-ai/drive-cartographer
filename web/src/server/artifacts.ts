import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";

import type { PrismaClient } from "../generated/prisma/client";

export type SaveArtifactInput = {
  sourcePath: string;
  archiveDir: string;
  submissionMethod: string;
};

export type SaveUploadedArtifactInput = {
  file: File;
  archiveDir: string;
  submissionMethod: string;
};

export async function saveArtifact(
  prisma: PrismaClient,
  input: SaveArtifactInput,
) {
  await mkdir(input.archiveDir, { recursive: true });
  const hash = createHash("sha256");
  const filename = basename(input.sourcePath);
  const storagePath = join(input.archiveDir, `${Date.now()}-${filename}`);
  let sizeBytes = 0;

  const reader = createReadStream(input.sourcePath);
  reader.on("data", (chunk: Buffer) => {
    sizeBytes += chunk.length;
    hash.update(chunk);
  });

  await pipeline(reader, createWriteStream(storagePath));
  const sha256 = hash.digest("hex");

  return prisma.scanArtifact.create({
    data: {
      storagePath,
      originalFilename: filename,
      sizeBytes,
      sha256,
      submissionMethod: input.submissionMethod,
      importJobs: {
        create: {
          status: "PENDING",
        },
      },
    },
  });
}

export async function saveUploadedArtifact(
  prisma: PrismaClient,
  input: SaveUploadedArtifactInput,
) {
  await mkdir(input.archiveDir, { recursive: true });
  const hash = createHash("sha256");
  const filename = input.file.name;
  const storagePath = join(input.archiveDir, `${Date.now()}-${filename}`);
  const writer = createWriteStream(storagePath);
  let sizeBytes = 0;

  try {
    for await (const chunk of input.file.stream()) {
      const buffer = Buffer.from(chunk);
      sizeBytes += buffer.length;
      hash.update(buffer);
      if (!writer.write(buffer)) {
        await once(writer, "drain");
      }
    }
    writer.end();
    await once(writer, "finish");
  } catch (error) {
    writer.destroy();
    throw error;
  }

  const sha256 = hash.digest("hex");
  return prisma.scanArtifact.create({
    data: {
      storagePath,
      originalFilename: filename,
      sizeBytes,
      sha256,
      submissionMethod: input.submissionMethod,
      importJobs: {
        create: {
          status: "PENDING",
        },
      },
    },
  });
}
