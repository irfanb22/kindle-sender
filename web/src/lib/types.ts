export type Article = {
  id: string;
  url: string;
  title: string | null;
  author: string | null;
  description: string | null;
  content: string | null;
  read_time_minutes: number | null;
  status: string;
  created_at: string;
  sent_at: string | null;
};

export type Settings = {
  kindle_email: string | null;
  sender_email: string | null;
  smtp_password: string | null;
  auto_send_threshold: number | null;
  schedule_day: string | null;
  schedule_time: string | null;
};

export type SendHistory = {
  id: string;
  article_count: number;
  status: string;
  error_message: string | null;
  sent_at: string;
};
