-- CreateIndex
CREATE INDEX "anime_title_idx" ON "anime"("title");

-- CreateIndex
CREATE INDEX "anime_provider_idx" ON "anime"("provider");

-- CreateIndex
CREATE INDEX "anime_year_quarter_idx" ON "anime"("year", "quarter");

-- CreateIndex
CREATE INDEX "anime_status_idx" ON "anime"("status");
