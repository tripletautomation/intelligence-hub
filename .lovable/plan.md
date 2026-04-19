
## Triple T Intelligence Hub — Plan

A private, RTL Hebrew internal intelligence dashboard for a data center / critical infrastructure company. Clean executive briefing aesthetic — white surfaces, navy headings, soft borders, generous spacing. Desktop-first, fully responsive.

### 1. Backend (Lovable Cloud / Supabase)

**Tables**
- `sources` — feed registry (name, category, type, region, priority, active flag)
- `items` — unified content store (news / event / research / vendor) with original + Hebrew fields, AI enrichment (`why_it_matters`, `tags_ai`, `relevance_score`), event fields, counters, flags
- `user_item_actions` — append-only log of view / read / save / like / dislike / open_source
- `user_preferences` — per-user regions, topics, sources, hidden lists, toggles

**Security (MVP, single internal user)**
- RLS enabled on all tables
- `sources` and `items`: readable by any authenticated user
- `user_item_actions` and `user_preferences`: row-owner only (`user_id = auth.uid()`)
- Auth: email/password, auto-confirm on, no email verification for internal use

**Seed data** (so the UI is never empty)
- ~5 sources (Data Center Dynamics, Uptime Institute, Calcalist Tech, Globes Infrastructure, AI Infra Summit)
- ~8 items: 3 global data center news, 3 Israel infrastructure news, 1 event, 1 research item — each with realistic Hebrew title, summary, why-it-matters, tags

### 2. Design system

- Background: light gray `#F6F7F9`; cards: pure white; borders: hairline `#E6E8EC`
- Headings: deep navy `#0B1E3F`; body: slate gray
- Accent: muted teal/blue for badges and links
- Typography: Heebo (Hebrew) + Inter fallback, generous line-height
- Cards: `rounded-2xl`, soft shadow, comfortable padding
- Full RTL: `<html dir="rtl" lang="he">`, all flex/spacing mirrored, icons on the correct side
- All tokens defined in `index.css` + `tailwind.config.ts` (HSL semantic tokens — no hardcoded colors in components)

### 3. App layout

- Top bar: app title "Triple T Intelligence Hub" (right side in RTL), global search (center), user/avatar (left)
- Tab navigation under header: **היום · ארכיון · אירועים · העדפות**
- Main content area with max-width container, generous side padding
- Item details opens as a right-side **drawer** (RTL → slides from left visually, anchored to start edge)

### 4. Pages

**Dashboard (היום)**
- 4 KPI summary cards: פריטים חדשים היום · לא נקראו · אירועים קרובים · מקורות פעילים
- Filter chip row: הכל / ישראל / עולם / אירועים / מחקר / לא נקראו / שמורים / אהבתי
- Vertical list of item cards (not a dense grid):
  - Top row: region badge · source badge · date
  - Title (navy, bold) · Hebrew summary
  - Highlighted "למה זה חשוב" block
  - Topic tag chips
  - Action row: פתח מקור · סמן כנקרא · שמור · 👍 · 👎

**Archive (ארכיון)**
- Search + advanced filter sidebar/panel: date range, source, region, item type, topic, read/unread, saved, liked/disliked
- Same list-card layout, paginated

**Events (אירועים)**
- Event-only list, sorted by `event_date` ascending
- Each row: title · date (formatted Hebrew) · location or "אונליין" · source · short summary · why it matters · "פרטים והרשמה" link
- Filters: אונליין/פיזי · ישראל/עולם · מקור

**Preferences (העדפות)**
- Multi-select chips for preferred topics
- Multi-select for preferred sources
- Region preference radio: ישראל / גלובלי / מאוזן
- Toggle switches: הצג לא-נקראו תחילה · תעדף אירועים · הסתר פריטים שסומנו כלא מעניינים
- Save button persists to `user_preferences`

**Item Details (drawer)**
- Full title, source link, date, full Hebrew summary, why it matters, all tags, all action buttons, view counter
- Logs `view` action on open

### 5. Behavior

- All user actions write to `user_item_actions` and increment counters on `items` (via simple client update or trigger)
- Read/unread state derived from latest `mark_read`/`mark_unread` per item per user
- Saved/liked filters use the same action log
- Search runs across `title_he`, `summary_he`, `tags_ai`

### 6. Out of scope (per MVP constraints)
- Multi-role admin, ingestion pipeline UI, analytics dashboard, recommendation engine — schema is ready for them but no UI yet
