-- AlterTable
ALTER TABLE "Job" ADD COLUMN "atsScore" INTEGER;
ALTER TABLE "Job" ADD COLUMN "atsScoreData" TEXT;

-- CreateTable
CREATE TABLE "JobKeyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'extracted',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobKeyword_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "JobKeyword_jobId_idx" ON "JobKeyword"("jobId");
