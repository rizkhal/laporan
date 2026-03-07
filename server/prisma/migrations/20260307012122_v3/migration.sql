/*
  Warnings:

  - Added the required column `settingId` to the `Commit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sha` to the `Commit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Commit` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Commit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "email" TEXT,
    "date" DATETIME NOT NULL,
    "week" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "url" TEXT,
    "settingId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Commit_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "Setting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Commit" ("author", "date", "id", "message", "week", "year") SELECT "author", "date", "id", "message", "week", "year" FROM "Commit";
DROP TABLE "Commit";
ALTER TABLE "new_Commit" RENAME TO "Commit";
CREATE UNIQUE INDEX "Commit_sha_key" ON "Commit"("sha");
CREATE INDEX "Commit_year_week_idx" ON "Commit"("year", "week");
CREATE INDEX "Commit_date_idx" ON "Commit"("date");
CREATE INDEX "Commit_settingId_idx" ON "Commit"("settingId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
