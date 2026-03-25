-- Convert release_date from ISO 8601 JST string to UTC datetime
-- Step 1: Normalize to UTC by subtracting 9 hours from JST (+09:00) timestamps
-- Step 2: Recreate table with DATETIME column type

-- First, convert existing data to UTC format in-place (while still STRING type)
UPDATE episodes
SET release_date = STRFTIME(
  '%Y-%m-%dT%H:%M:%S.000Z',
  DATETIME(
    SUBSTR(release_date, 1, 19),
    '-9 hours'
  )
)
WHERE release_date LIKE '____-__-__T__:__:__+09:00';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_episodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "season_id" TEXT NOT NULL,
    "episode_number" INTEGER NOT NULL,
    "episode_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "release_date" DATETIME NOT NULL,
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
INSERT INTO "new_episodes" ("benefit_id", "created_at", "description", "duration", "episode_id", "episode_number", "has_dub", "has_subtitles", "id", "image_url", "maturity_rating", "recorded", "release_date", "season_id", "title") SELECT "benefit_id", "created_at", "description", "duration", "episode_id", "episode_number", "has_dub", "has_subtitles", "id", "image_url", "maturity_rating", "recorded", "release_date", "season_id", "title" FROM "episodes";
DROP TABLE "episodes";
ALTER TABLE "new_episodes" RENAME TO "episodes";
CREATE UNIQUE INDEX "episodes_season_id_episode_number_key" ON "episodes"("season_id", "episode_number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
