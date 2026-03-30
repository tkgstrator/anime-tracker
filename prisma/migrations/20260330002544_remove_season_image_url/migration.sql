/*
  Warnings:

  - You are about to drop the column `image_url` on the `seasons` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_seasons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anime_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "season_number" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seasons_anime_id_fkey" FOREIGN KEY ("anime_id") REFERENCES "anime" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_seasons" ("anime_id", "created_at", "display_name", "id", "season_id", "season_number") SELECT "anime_id", "created_at", "display_name", "id", "season_id", "season_number" FROM "seasons";
DROP TABLE "seasons";
ALTER TABLE "new_seasons" RENAME TO "seasons";
CREATE UNIQUE INDEX "seasons_anime_id_season_id_key" ON "seasons"("anime_id", "season_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
