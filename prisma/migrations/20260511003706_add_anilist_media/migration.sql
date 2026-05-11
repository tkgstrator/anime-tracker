-- CreateTable
CREATE TABLE "anilist_media" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title_native" TEXT,
    "title_romaji" TEXT,
    "title_english" TEXT,
    "season" TEXT,
    "season_year" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "start_year" INTEGER,
    "start_month" INTEGER,
    "native_norm" TEXT,
    "romaji_norm" TEXT,
    "english_norm" TEXT,
    "synced_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "anilist_media_native_norm_idx" ON "anilist_media"("native_norm");

-- CreateIndex
CREATE INDEX "anilist_media_romaji_norm_idx" ON "anilist_media"("romaji_norm");

-- CreateIndex
CREATE INDEX "anilist_media_english_norm_idx" ON "anilist_media"("english_norm");

