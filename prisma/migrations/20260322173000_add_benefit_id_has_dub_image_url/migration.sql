-- AlterTable
ALTER TABLE "seasons" ADD COLUMN "image_url" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_anime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL DEFAULT 'tv',
    "maturity_rating" INTEGER,
    "image_url" TEXT,
    "benefit_id" TEXT,
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
    "description" TEXT NOT NULL,
    "release_date" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "maturity_rating" INTEGER,
    "image_url" TEXT NOT NULL,
    "has_subtitles" BOOLEAN NOT NULL DEFAULT false,
    "has_dub" BOOLEAN NOT NULL DEFAULT false,
    "benefit_id" TEXT,
    "recorded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "episodes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_episodes" ("created_at", "description", "duration", "episode_number", "has_subtitles", "id", "image_url", "maturity_rating", "recorded", "release_date", "season_id", "title", "title_id") SELECT "created_at", "description", "duration", "episode_number", "has_subtitles", "id", "image_url", "maturity_rating", "recorded", "release_date", "season_id", "title", "title_id" FROM "episodes";
DROP TABLE "episodes";
ALTER TABLE "new_episodes" RENAME TO "episodes";
CREATE UNIQUE INDEX "episodes_season_id_episode_number_key" ON "episodes"("season_id", "episode_number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

