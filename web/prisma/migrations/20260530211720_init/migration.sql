-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('SAVED', 'IMPORTING', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScanImportStatus" AS ENUM ('IMPORTING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "os" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Root" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "absolutePath" TEXT NOT NULL,
    "filesystemMetadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Root_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanArtifact" (
    "id" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "submissionMethod" TEXT NOT NULL,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'SAVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "scannerVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "importStatus" "ScanImportStatus" NOT NULL DEFAULT 'IMPORTING',
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueHashCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanRoot" (
    "scanId" TEXT NOT NULL,
    "rootId" TEXT NOT NULL,
    "rootPathSeen" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',

    CONSTRAINT "ScanRoot_pkey" PRIMARY KEY ("scanId","rootId")
);

-- CreateTable
CREATE TABLE "FileHash" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "exifJson" JSONB NOT NULL DEFAULT '{}',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileHash_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileLocation" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "rootId" TEXT NOT NULL,
    "hashId" TEXT NOT NULL,
    "absolutePath" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "parentRelativePath" TEXT NOT NULL,
    "basename" TEXT NOT NULL,
    "createdAtFs" TIMESTAMP(3),
    "modifiedAtFs" TIMESTAMP(3) NOT NULL,
    "ownershipPermissionsJson" JSONB NOT NULL DEFAULT '{}',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_name_key" ON "Source"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Root_sourceId_label_key" ON "Root"("sourceId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "ScanArtifact_storagePath_key" ON "ScanArtifact"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "ScanArtifact_sha256_key" ON "ScanArtifact"("sha256");

-- CreateIndex
CREATE INDEX "ImportJob_artifactId_idx" ON "ImportJob"("artifactId");

-- CreateIndex
CREATE INDEX "ImportJob_status_createdAt_idx" ON "ImportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Scan_sourceId_createdAt_idx" ON "Scan"("sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "Scan_artifactId_idx" ON "Scan"("artifactId");

-- CreateIndex
CREATE INDEX "ScanRoot_rootId_idx" ON "ScanRoot"("rootId");

-- CreateIndex
CREATE UNIQUE INDEX "FileHash_sha256_key" ON "FileHash"("sha256");

-- CreateIndex
CREATE INDEX "FileLocation_scanId_rootId_parentRelativePath_idx" ON "FileLocation"("scanId", "rootId", "parentRelativePath");

-- CreateIndex
CREATE INDEX "FileLocation_hashId_idx" ON "FileLocation"("hashId");

-- CreateIndex
CREATE INDEX "FileLocation_rootId_relativePath_scanId_idx" ON "FileLocation"("rootId", "relativePath", "scanId");

-- CreateIndex
CREATE UNIQUE INDEX "FileLocation_scanId_rootId_relativePath_key" ON "FileLocation"("scanId", "rootId", "relativePath");

-- AddForeignKey
ALTER TABLE "Root" ADD CONSTRAINT "Root_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ScanArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scan" ADD CONSTRAINT "Scan_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ScanArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanRoot" ADD CONSTRAINT "ScanRoot_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanRoot" ADD CONSTRAINT "ScanRoot_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "Root"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileLocation" ADD CONSTRAINT "FileLocation_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileLocation" ADD CONSTRAINT "FileLocation_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "Root"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileLocation" ADD CONSTRAINT "FileLocation_hashId_fkey" FOREIGN KEY ("hashId") REFERENCES "FileHash"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
