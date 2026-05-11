-- 既存の NULL benefit_id を anime.provider から埋める
UPDATE "episodes"
SET "benefit_id" = LOWER((
  SELECT a."provider"
  FROM "anime" a
  JOIN "seasons" s ON s."anime_id" = a."id"
  WHERE s."id" = "episodes"."season_id"
))
WHERE "benefit_id" IS NULL;

-- RedefineTables (benefit_id を NOT NULL に)
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
    "benefit_id" TEXT NOT NULL,
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
