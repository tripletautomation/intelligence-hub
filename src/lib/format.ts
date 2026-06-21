const heDate = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "short", year: "numeric" });
const heDateTime = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const heRel = new Intl.RelativeTimeFormat("he", { numeric: "auto" });

export const formatHeDate = (iso?: string | null) => (iso ? heDate.format(new Date(iso)) : "");
export const formatHeDateTime = (iso?: string | null) => (iso ? heDateTime.format(new Date(iso)) : "");

export const formatHeRelative = (iso?: string | null) => {
  if (!iso) return "";
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 60) return heRel.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return heRel.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  return heRel.format(diffDay, "day");
};

// Relative for recent items (< 7 days), absolute date for older ones — so a
// card always communicates *when* something was published at a glance.
export const formatHeSmartDate = (iso?: string | null) => {
  if (!iso) return "ללא תאריך";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "ללא תאריך";
  const days = Math.abs(Date.now() - t) / 86_400_000;
  return days < 7 ? formatHeRelative(iso) : formatHeDate(iso);
};
