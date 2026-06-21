// Shared metadata for publishable social/content platforms.
// Used by the scheduling dialog and the content queue.

export type SchedulablePlatform =
  | "linkedin_he"
  | "linkedin_en"
  | "instagram"
  | "facebook"
  | "blog"
  | "newsletter";

export interface PlatformMeta {
  id: SchedulablePlatform;
  label: string;
  dir: "rtl" | "ltr";
  /** Where to open the platform's composer for one-click paste. null = no web composer. */
  composerUrl: string | null;
  /** Tailwind text color for the badge. */
  color: string;
}

export const PLATFORM_META: Record<SchedulablePlatform, PlatformMeta> = {
  linkedin_he: { id: "linkedin_he", label: "LinkedIn — עברית", dir: "rtl", composerUrl: "https://www.linkedin.com/feed/?shareActive=true", color: "text-blue-600" },
  linkedin_en: { id: "linkedin_en", label: "LinkedIn — English", dir: "ltr", composerUrl: "https://www.linkedin.com/feed/?shareActive=true", color: "text-blue-700" },
  instagram:   { id: "instagram",   label: "Instagram",          dir: "rtl", composerUrl: "https://www.instagram.com/", color: "text-pink-600" },
  facebook:    { id: "facebook",    label: "Facebook",           dir: "rtl", composerUrl: "https://www.facebook.com/", color: "text-blue-800" },
  blog:        { id: "blog",        label: "בלוג",               dir: "rtl", composerUrl: null, color: "text-emerald-600" },
  newsletter:  { id: "newsletter",  label: "Newsletter",         dir: "rtl", composerUrl: null, color: "text-amber-600" },
};

export const PLATFORM_LIST = Object.values(PLATFORM_META);

export function platformLabel(id: string): string {
  return (PLATFORM_META as Record<string, PlatformMeta>)[id]?.label ?? id;
}
