-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RewrittenResume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sourceTemplateId" TEXT,
    CONSTRAINT "RewrittenResume_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RewrittenResume_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "MasterTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RewrittenResume" ("content", "createdAt", "id", "profileId", "title", "updatedAt") SELECT "content", "createdAt", "id", "profileId", "title", "updatedAt" FROM "RewrittenResume";
DROP TABLE "RewrittenResume";
ALTER TABLE "new_RewrittenResume" RENAME TO "RewrittenResume";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
