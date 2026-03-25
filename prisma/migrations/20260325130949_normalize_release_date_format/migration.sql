-- Normalize release_date format from "YYYY/MM/DD HH:MM:SS" to ISO 8601 "YYYY-MM-DDTHH:MM:SS+09:00"
UPDATE episodes
SET release_date =
  SUBSTR(release_date, 1, 4) || '-' ||
  SUBSTR(release_date, 6, 2) || '-' ||
  SUBSTR(release_date, 9, 2) || 'T' ||
  SUBSTR(release_date, 12, 8) || '+09:00'
WHERE release_date LIKE '____/__/__ __:__:__';
