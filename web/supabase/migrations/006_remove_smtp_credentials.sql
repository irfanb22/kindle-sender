-- Migration 006: Remove user SMTP credentials
-- Email delivery now uses app-owned Amazon SES instead of user-provided Gmail SMTP.
-- Users only need to provide their Kindle email address.

ALTER TABLE settings DROP COLUMN IF EXISTS sender_email;
ALTER TABLE settings DROP COLUMN IF EXISTS smtp_password;
