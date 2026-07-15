-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_anilist_media" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title_native" TEXT,
    "title_romaji" TEXT,
    "title_english" TEXT,
    "season" TEXT,
    "season_year" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "start_year" INTEGER,
    "start_month" INTEGER,
    "country_of_origin" TEXT NOT NULL DEFAULT 'JP',
    "native_norm" TEXT,
    "romaji_norm" TEXT,
    "english_norm" TEXT,
    "synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_anilist_media" ("english_norm", "id", "native_norm", "romaji_norm", "season", "season_year", "start_month", "start_year", "status", "synced_at", "title_english", "title_native", "title_romaji") SELECT "english_norm", "id", "native_norm", "romaji_norm", "season", "season_year", "start_month", "start_year", "status", "synced_at", "title_english", "title_native", "title_romaji" FROM "anilist_media";
DROP TABLE "anilist_media";
ALTER TABLE "new_anilist_media" RENAME TO "anilist_media";
CREATE INDEX "anilist_media_native_norm_idx" ON "anilist_media"("native_norm");
CREATE INDEX "anilist_media_romaji_norm_idx" ON "anilist_media"("romaji_norm");
CREATE INDEX "anilist_media_english_norm_idx" ON "anilist_media"("english_norm");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

