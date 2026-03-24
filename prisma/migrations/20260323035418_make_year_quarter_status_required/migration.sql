/*
  Warnings:

  - Made the column `quarter` on table `anime` required. This step will fail if there are existing NULL values in that column.
  - Made the column `year` on table `anime` required. This step will fail if there are existing NULL values in that column.

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
    "image_url" TEXT,
    "benefit_id" TEXT,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "is_identified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "tmdb_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_anime" ("benefit_id", "content_id", "created_at", "description", "entity_type", "id", "image_url", "is_identified", "maturity_rating", "provider", "quarter", "status", "title", "tmdb_id", "updated_at", "year") SELECT "benefit_id", "content_id", "created_at", "description", "entity_type", "id", "image_url", "is_identified", "maturity_rating", "provider", "quarter", coalesce("status", 'UNKNOWN') AS "status", "title", "tmdb_id", "updated_at", "year" FROM "anime";
DROP TABLE "anime";
ALTER TABLE "new_anime" RENAME TO "anime";
CREATE UNIQUE INDEX "anime_provider_content_id_key" ON "anime"("provider", "content_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
