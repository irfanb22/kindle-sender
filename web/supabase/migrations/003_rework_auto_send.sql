-- Migration 003: Rework auto-send into unified delivery system
-- - schedule_day (single text) → schedule_days (text array)
-- - auto_send_threshold → min_article_count (semantic rename)
-- - Add timezone column

-- 1. Add new columns
ALTER TABLE settings ADD COLUMN schedule_days text[];
ALTER TABLE settings ADD COLUMN timezone text;

-- 2. Migrate existing schedule_day data into schedule_days array
UPDATE settings
SET schedule_days = ARRAY[schedule_day]
WHERE schedule_day IS NOT NULL;

-- 3. Rename auto_send_threshold to min_article_count
ALTER TABLE settings RENAME COLUMN auto_send_threshold TO min_article_count;

-- 4. Drop the old schedule_day column (also drops the buggy CHECK constraint
--    that used full day names while the app stored abbreviations)
ALTER TABLE settings DROP COLUMN schedule_day;

-- 5. Update min_article_count check constraint (now 1-50 instead of 2-50,
--    since it's a minimum gate rather than a trigger threshold)
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_auto_send_threshold_check;
ALTER TABLE settings ADD CONSTRAINT settings_min_article_count_check
  CHECK (min_article_count IS NULL OR (min_article_count >= 1 AND min_article_count <= 50));
