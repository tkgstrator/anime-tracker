-- CreateTable
CREATE TABLE "abema_key_archives" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episode_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "content_key_hex" TEXT NOT NULL,
    "iv_hex" TEXT NOT NULL,
    "variant_url" TEXT NOT NULL,
    "variant_resolution" TEXT NOT NULL,
    "variant_bandwidth" INTEGER NOT NULL,
    "segment_urls" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "abema_key_archives_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "abema_key_archives_episode_id_key" ON "abema_key_archives"("episode_id");

-- CreateIndex
CREATE INDEX "abema_key_archives_program_id_idx" ON "abema_key_archives"("program_id");

