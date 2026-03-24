/*
  Warnings:

  - You are about to drop the column `tmdb_id` on the `anime` table. All the data in the column will be lost.
  - Made the column `anilist_id` on table `anime` required. This step will fail if there are existing NULL values in that column.
  - Made the column `image_url` on table `anime` required. This step will fail if there are existing NULL values in that column.
  - Made the column `image_url` on table `seasons` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_anime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL DEFAULT 'tv',
    "maturity_rating" INTEGER,
    "image_url" TEXT NOT NULL,
    "benefit_id" TEXT,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "is_identified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "anilist_id" INTEGER NOT NULL,
    "scheduled" BOOLEAN NOT NULL DEFAULT false,
    "recorded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_anime" ("anilist_id", "benefit_id", "content_id", "created_at", "description", "entity_type", "id", "image_url", "is_identified", "maturity_rating", "provider", "quarter", "recorded", "scheduled", "status", "title", "updated_at", "year") SELECT "anilist_id", "benefit_id", "content_id", "created_at", "description", "entity_type", "id", "image_url", "is_identified", "maturity_rating", "provider", "quarter", "recorded", "scheduled", "status", "title", "updated_at", "year" FROM "anime";
DROP TABLE "anime";
ALTER TABLE "new_anime" RENAME TO "anime";
CREATE INDEX "anime_title_idx" ON "anime"("title");
CREATE INDEX "anime_provider_idx" ON "anime"("provider");
CREATE INDEX "anime_year_quarter_idx" ON "anime"("year", "quarter");
CREATE INDEX "anime_status_idx" ON "anime"("status");
CREATE UNIQUE INDEX "anime_provider_content_id_key" ON "anime"("provider", "content_id");
CREATE TABLE "new_seasons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anime_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "season_number" INTEGER NOT NULL,
    "image_url" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seasons_anime_id_fkey" FOREIGN KEY ("anime_id") REFERENCES "anime" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_seasons" ("anime_id", "created_at", "display_name", "id", "image_url", "season_id", "season_number") SELECT "anime_id", "created_at", "display_name", "id", "image_url", "season_id", "season_number" FROM "seasons";
DROP TABLE "seasons";
ALTER TABLE "new_seasons" RENAME TO "seasons";
CREATE UNIQUE INDEX "seasons_anime_id_season_id_key" ON "seasons"("anime_id", "season_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
