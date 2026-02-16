export type Article = {
  id: string;
  url: string;
  title: string | null;
  author: string | null;
  description: string | null;
  content: string | null;
  read_time_minutes: number | null;
  published_at: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
};

export type Settings = {
  kindle_email: string | null;
  sender_email: string | null;
  smtp_password: string | null;
  min_article_count: number | null;
  schedule_days: string[] | null;
  schedule_time: string | null;
  timezone: string | null;
  epub_font: string | null;
  epub_include_images: boolean | null;
  epub_show_author: boolean | null;
  epub_show_read_time: boolean | null;
  epub_show_published_date: boolean | null;
};

export type SendHistory = {
  id: string;
  article_count: number;
  issue_number: number | null;
  status: string;
  error_message: string | null;
  sent_at: string;
};

export type EpubPreferences = {
  font: string;
  includeImages: boolean;
  showAuthor: boolean;
  showReadTime: boolean;
  showPublishedDate: boolean;
};
