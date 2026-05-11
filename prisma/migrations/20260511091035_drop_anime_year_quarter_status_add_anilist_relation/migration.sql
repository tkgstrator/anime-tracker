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
    "anilist_id" INTEGER NOT NULL,
    "badge" TEXT,
    "next_episode_date" DATETIME,
    "expired_at" DATETIME,
    "expiring_season" INTEGER,
    "scheduled" BOOLEAN NOT NULL DEFAULT false,
    "recorded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "anime_anilist_id_fkey" FOREIGN KEY ("anilist_id") REFERENCES "anilist_media" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_anime" ("anilist_id", "badge", "content_id", "created_at", "description", "entity_type", "expired_at", "expiring_season", "id", "image_url", "maturity_rating", "next_episode_date", "provider", "recorded", "scheduled", "title", "updated_at") SELECT "anilist_id", "badge", "content_id", "created_at", "description", "entity_type", "expired_at", "expiring_season", "id", "image_url", "maturity_rating", "next_episode_date", "provider", "recorded", "scheduled", "title", "updated_at" FROM "anime";
DROP TABLE "anime";
ALTER TABLE "new_anime" RENAME TO "anime";
CREATE INDEX "anime_title_idx" ON "anime"("title");
CREATE INDEX "anime_provider_idx" ON "anime"("provider");
CREATE INDEX "anime_anilist_id_idx" ON "anime"("anilist_id");
CREATE UNIQUE INDEX "anime_provider_content_id_key" ON "anime"("provider", "content_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "anilist_media_season_season_year_idx" ON "anilist_media"("season", "season_year");

-- CreateIndex
CREATE INDEX "anilist_media_status_idx" ON "anilist_media"("status");

