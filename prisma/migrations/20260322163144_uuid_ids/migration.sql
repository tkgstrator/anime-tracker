/*
  Warnings:

  - The primary key for the `anime` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `episodes` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `seasons` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_anime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL DEFAULT 'TV Show',
    "maturity_rating" INTEGER,
    "image_url" TEXT,
    "year" INTEGER,
    "quarter" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_anime" ("content_id", "created_at", "entity_type", "id", "image_url", "maturity_rating", "provider", "quarter", "title", "updated_at", "year") SELECT "content_id", "created_at", "entity_type", "id", "image_url", "maturity_rating", "provider", "quarter", "title", "updated_at", "year" FROM "anime";
DROP TABLE "anime";
ALTER TABLE "new_anime" RENAME TO "anime";
CREATE UNIQUE INDEX "anime_provider_content_id_key" ON "anime"("provider", "content_id");
CREATE TABLE "new_episodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "season_id" TEXT NOT NULL,
    "episode_number" INTEGER NOT NULL,
    "title_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_prime" BOOLEAN NOT NULL DEFAULT false,
    "release_date" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "maturity_rating" INTEGER,
    "image_url" TEXT,
    "has_subtitles" BOOLEAN NOT NULL DEFAULT false,
    "recorded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "episodes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_episodes" ("created_at", "description", "duration", "episode_number", "has_subtitles", "id", "image_url", "is_prime", "maturity_rating", "recorded", "release_date", "season_id", "title", "title_id") SELECT "created_at", "description", "duration", "episode_number", "has_subtitles", "id", "image_url", "is_prime", "maturity_rating", "recorded", "release_date", "season_id", "title", "title_id" FROM "episodes";
DROP TABLE "episodes";
ALTER TABLE "new_episodes" RENAME TO "episodes";
CREATE UNIQUE INDEX "episodes_season_id_episode_number_key" ON "episodes"("season_id", "episode_number");
CREATE TABLE "new_seasons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anime_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seasons_anime_id_fkey" FOREIGN KEY ("anime_id") REFERENCES "anime" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_seasons" ("anime_id", "created_at", "display_name", "id", "season_id", "sequence_number") SELECT "anime_id", "created_at", "display_name", "id", "season_id", "sequence_number" FROM "seasons";
DROP TABLE "seasons";
ALTER TABLE "new_seasons" RENAME TO "seasons";
CREATE UNIQUE INDEX "seasons_anime_id_season_id_key" ON "seasons"("anime_id", "season_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
