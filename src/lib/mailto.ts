import { formatHeDateTime } from "@/lib/format";

const INTRO_EVENT_OR_ARTICLE = "אני חושב שזה עשוי לעניין אותך";
const INTRO_GENERATED_ARTICLE = "אני חושב שזה עשוי לעניין אותך";

export interface MailItemInput {
  kind: "event" | "article" | "generated_article";
  title: string;
  date?: string | null; // ISO string
  location?: string | null;
  isOnline?: boolean | null;
  summary?: string | null;
  whyItMatters?: string | null;
  url?: string | null;
  sourceName?: string | null;
}

function safeDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  try {
    return formatHeDateTime(iso);
  } catch {
    return d.toLocaleString("he-IL");
  }
}

function buildBody(input: MailItemInput): string {
  const lines: string[] = [];
  const intro =
    input.kind === "generated_article" ? INTRO_GENERATED_ARTICLE : INTRO_EVENT_OR_ARTICLE;
  lines.push(intro, "");

  lines.push(input.title, "");

  const date = safeDate(input.date);
  if (date) lines.push(`מתי: ${date}`);

  if (input.kind === "event") {
    const where = input.isOnline ? "אונליין" : input.location?.trim();
    if (where) lines.push(`איפה: ${where}`);
  }

  if (input.sourceName) lines.push(`מקור: ${input.sourceName}`);

  if (date || input.location || input.isOnline || input.sourceName) lines.push("");

  if (input.summary?.trim()) {
    lines.push(input.summary.trim(), "");
  }

  if (input.whyItMatters?.trim()) {
    lines.push("למה זה חשוב:", input.whyItMatters.trim(), "");
  }

  if (input.url) {
    lines.push("קישור:", input.url);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildMailtoUrl(input: MailItemInput): string {
  const subject = encodeURIComponent(input.title);
  const body = encodeURIComponent(buildBody(input));
  return `mailto:?subject=${subject}&body=${body}`;
}