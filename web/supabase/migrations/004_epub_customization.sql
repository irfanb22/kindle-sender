-- Migration 004: EPUB customization
-- Adds EPUB preferences to settings, published_at to articles, issue_number to send_history

-- 1. EPUB preference columns on settings
ALTER TABLE settings ADD COLUMN epub_font text DEFAULT 'bookerly';
ALTER TABLE settings ADD COLUMN epub_include_images boolean DEFAULT true;
ALTER TABLE settings ADD COLUMN epub_show_author boolean DEFAULT true;
ALTER TABLE settings ADD COLUMN epub_show_read_time boolean DEFAULT true;
ALTER TABLE settings ADD COLUMN epub_show_published_date boolean DEFAULT true;

ALTER TABLE settings ADD CONSTRAINT settings_epub_font_check
  CHECK (epub_font IS NULL OR epub_font IN ('bookerly', 'georgia', 'palatino', 'helvetica'));

-- 2. Published date on articles (from article extractor)
ALTER TABLE articles ADD COLUMN published_at timestamptz;

-- 3. Issue number on send_history (auto-incremented per user in app logic)
ALTER TABLE send_history ADD COLUMN issue_number integer;
