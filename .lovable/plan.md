

## הבעיה
המשתמשת לא מצליחה למצוא את האפשרות "Connect project" ל־Supabase ב־UI של Lovable, גם אחרי שהארגון מחובר ברמת ה־workspace. ניסינו Cmd+K, סרגל עליון, ותפריט … — ללא הצלחה. אני (Lovable AI) לא יכול ליצור פרויקט Supabase חיצוני עבורה.

## שתי דרכים להתקדם

### מסלול A — Lovable Cloud (מומלץ, מהיר)
Lovable Cloud **הוא Supabase מתחת למכסה** — אותו Postgres, אותו Auth (email/password, Google, Apple, Phone, SSO), אותו Storage, אותן Edge Functions, אותו RLS, אותו SQL. ההבדל היחיד: אין צורך לנהל פרויקט נפרד או לחפש כפתורי חיבור — Lovable מקצה ומחבר אוטומטית.

מה שאקבל מיד אחרי הפעלה:
- 4 טבלאות: `sources`, `items`, `user_item_actions`, `user_preferences`
- RLS מלא לפי התוכנית המאושרת
- Auth עם email/password + auto-confirm
- Seed data בעברית (5 מקורות, 8 פריטים)
- מוכן לבנייה של ה־UI מיד

מגבלה: GitHub/Facebook/Discord OAuth לא נתמכים native (לא רלוונטי לפרויקט הזה — משתמש פנימי יחיד).

### מסלול B — Supabase חיצוני ידני
את יוצרת פרויקט ב־supabase.com בעצמך (2 דקות), ואז מחברת ל־Lovable:
1. כנסי ל־https://supabase.com/dashboard
2. **New project** → שם: `triple-t-intel-hub`, region: `eu-central-1` (Frankfurt), הגדירי DB password
3. חזרי ל־Lovable, נסי שוב Cmd+K → "Supabase" — עכשיו שיש פרויקט בארגון, האפשרות אמורה להופיע
4. אם עדיין לא — פתחי תמיכה של Lovable (אייקון ?) — זו תקלת UI

אחרי החיבור: אריץ את אותו schema בדיוק.

## המלצה
לכי על **מסלול A (Lovable Cloud)**. זה Supabase, רק בלי החיכוך. תמיד אפשר לייצא את ה־DB אם תרצי בעתיד לעבור לפרויקט Supabase עצמאי.

## תזכורת אבטחה דחופה
ה־Secret Key ששלחת בצ'אט מוקדם יותר עדיין חשוף. כנסי **עכשיו** ל־Supabase Dashboard → Project Settings → API → **Roll secret key**.

## מה אעשה ברגע שתאשרי מסלול
- A: אפעיל Lovable Cloud, אריץ migration ל־4 הטבלאות + RLS + seed, ואחזור עם אישור.
- B: אמתין שתיצרי את הפרויקט ותחברי, ואז אריץ את אותו migration.

