-- D1 で RedefineTables 経由の DROP TABLE は ON DELETE CASCADE を踏んで
-- 子テーブル (seasons → episodes → abema_key_archives) を巻き添えにするため、
-- ALTER TABLE DROP COLUMN で必要な変更だけを行う。FK 制約の追加はスキップする。

-- 参照中の index は DROP COLUMN より先に消す
DROP INDEX "anime_year_quarter_idx";
DROP INDEX "anime_status_idx";

ALTER TABLE "anime" DROP COLUMN "year";
ALTER TABLE "anime" DROP COLUMN "quarter";
ALTER TABLE "anime" DROP COLUMN "status";

CREATE INDEX "anime_anilist_id_idx" ON "anime"("anilist_id");
CREATE INDEX "anilist_media_season_season_year_idx" ON "anilist_media"("season", "season_year");
CREATE INDEX "anilist_media_status_idx" ON "anilist_media"("status");
