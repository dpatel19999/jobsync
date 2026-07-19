-- CreateTable
CREATE TABLE "MasterTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MasterTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MasterTemplate_userId_slot_isCurrent_idx" ON "MasterTemplate"("userId", "slot", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "MasterTemplate_userId_slot_version_key" ON "MasterTemplate"("userId", "slot", "version");
