import type { EpubPreferences } from "./types";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const epubModule = require("epub-gen-memory");
const generateEpub = epubModule.default ?? epubModule;

export const FONT_MAP: Record<string, string> = {
  bookerly: 'Bookerly, Georgia, "Times New Roman", serif',
  georgia: 'Georgia, "Times New Roman", serif',
  palatino: '"Palatino Linotype", Palatino, Georgia, serif',
  helvetica: "Helvetica, Arial, sans-serif",
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function stripImages(html: string): string {
  return html
    .replace(/<picture[^>]*>[\s\S]*?<\/picture>/gi, "")
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, "")
    .replace(/<img[^>]*>/gi, "");
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function buildCoverHtml(options: {
  issueNumber: number | null;
  date: string;
  articleCount: number;
  totalReadTime: number;
}): string {
  const { issueNumber, date, articleCount, totalReadTime } = options;

  const formattedDate = new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const issueLine = issueNumber
    ? `<h1 class="issue">Issue #${issueNumber}</h1>`
    : "";

  return `<div class="cover">
  <p class="brand">Kindle Sender</p>
  ${issueLine}
  <p class="date">${escapeHtml(formattedDate)}</p>
  <div class="divider"></div>
  <div class="stats">
    <p>${articleCount} article${articleCount !== 1 ? "s" : ""}</p>
    <p>~${totalReadTime} min total read time</p>
  </div>
</div>`;
}

function buildCss(fontFamily: string): string {
  return `body { font-family: ${fontFamily}; line-height: 1.7; margin: 1em; color: #1a1a1a; }
h1 { font-size: 1.35em; margin: 0 0 0.3em; }
.meta { color: #666; font-size: 0.82em; margin-bottom: 1.8em; }
p { margin: 0 0 0.75em; text-indent: 0; }
.cover { text-align: center; padding: 3em 1em; }
.cover .brand { font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.2em; color: #999; margin-bottom: 2em; }
.cover .issue { font-size: 1.8em; margin: 0 0 0.2em; }
.cover .date { font-size: 0.95em; color: #555; margin-bottom: 1.5em; }
.cover .divider { width: 40px; height: 1px; background: #ccc; margin: 0 auto 1.5em; }
.cover .stats { font-size: 0.85em; color: #777; }
.cover .stats p { margin: 0.2em 0; }`;
}

export type EpubArticle = {
  title?: string | null;
  url: string;
  author?: string | null;
  content: string;
  read_time_minutes?: number | null;
  published_at?: string | null;
};

export async function generateKindleEpub(options: {
  articles: EpubArticle[];
  preferences: EpubPreferences;
  issueNumber: number | null;
}): Promise<{ buffer: Buffer; title: string; filename: string }> {
  const { articles, preferences, issueNumber } = options;
  const dateStr = new Date().toISOString().split("T")[0];
  const fontFamily = FONT_MAP[preferences.font] || FONT_MAP.bookerly;

  // Calculate total read time for cover
  const totalReadTime = articles.reduce(
    (sum, a) => sum + (a.read_time_minutes || 0),
    0
  );

  // Build cover page chapter
  const coverChapter = {
    title: "Cover",
    content: buildCoverHtml({
      issueNumber,
      date: dateStr,
      articleCount: articles.length,
      totalReadTime,
    }),
    filename: "cover.xhtml",
  };

  // Build article chapters
  const articleChapters = articles.map((article, i) => {
    const titleText = article.title || extractDomain(article.url);
    const readTime = article.read_time_minutes
      ? `${article.read_time_minutes} min`
      : "";
    const tocTitle = [titleText, readTime].filter(Boolean).join(" · ");

    // Build metadata parts based on preferences
    const metaParts: string[] = [];
    if (preferences.showAuthor) {
      const authorDisplay = article.author || extractDomain(article.url);
      metaParts.push(authorDisplay);
    }
    if (preferences.showReadTime && readTime) {
      metaParts.push(`${readTime} read`);
    }
    if (preferences.showPublishedDate && article.published_at) {
      const formattedDate = formatDate(article.published_at);
      if (formattedDate) {
        metaParts.push(formattedDate);
      }
    }

    const metaLine =
      metaParts.length > 0
        ? `<p class="meta">${escapeHtml(metaParts.join(" · "))}</p>\n`
        : "";

    // Optionally strip images
    let articleContent = article.content;
    if (!preferences.includeImages) {
      articleContent = stripImages(articleContent);
    }

    return {
      title: tocTitle,
      content: `${metaLine}${articleContent}`,
      filename: `article_${i}.xhtml`,
    };
  });

  const chapters = [coverChapter, ...articleChapters];
  const title = `ReadLater - ${dateStr}`;

  const rawResult = await generateEpub(
    {
      title,
      author: "Kindle Sender",
      css: buildCss(fontFamily),
      ignoreFailedDownloads: true,
      fetchTimeout: 10000,
      verbose: false,
    },
    chapters
  );

  let buffer: Buffer;
  if (Buffer.isBuffer(rawResult)) {
    buffer = rawResult;
  } else if (rawResult instanceof Uint8Array) {
    buffer = Buffer.from(rawResult);
  } else {
    throw new Error(
      `Unexpected epub result type: ${rawResult?.constructor?.name}`
    );
  }

  return {
    buffer,
    title,
    filename: `ReadLater-${dateStr}.epub`,
  };
}
