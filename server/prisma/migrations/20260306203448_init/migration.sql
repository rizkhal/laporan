-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lastSync" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Commit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "week" INTEGER NOT NULL,
    "year" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "Commit_year_week_idx" ON "Commit"("year", "week");

-- CreateIndex
CREATE INDEX "Commit_date_idx" ON "Commit"("date");
