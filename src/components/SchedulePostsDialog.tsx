import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PLATFORM_META, type SchedulablePlatform } from "@/lib/platforms";

export interface SchedulableItem {
  platform: SchedulablePlatform;
  content: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draftId: string;
  items: SchedulableItem[];
}

// Local datetime-local string for `now + minutes`, e.g. "2026-06-21T14:30"
function defaultScheduleValue(minutesAhead = 60): string {
  const d = new Date(Date.now() + minutesAhead * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SchedulePostsDialog = ({ open, onOpenChange, draftId, items }: Props) => {
  const nav = useNavigate();
  const available = useMemo(() => items.filter((i) => i.content?.trim()), [items]);
  const [selected, setSelected] = useState<Set<SchedulablePlatform>>(new Set());
  const [when, setWhen] = useState<string>(defaultScheduleValue());
  const [saving, setSaving] = useState(false);

  // Initialize selection to all available when the dialog opens
  const initSelection = () => setSelected(new Set(available.map((i) => i.platform)));

  const toggle = (p: SchedulablePlatform) =>
    setSelected((prev) => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });

  const handleSchedule = async () => {
    const chosen = available.filter((i) => selected.has(i.platform));
    if (!chosen.length) { toast.error("בחר לפחות פלטפורמה אחת"); return; }
    const t = new Date(when).getTime();
    if (Number.isNaN(t)) { toast.error("בחר תאריך ושעה תקינים"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("schedule-post", {
        body: {
          draft_id: draftId,
          items: chosen.map((i) => ({
            platform: i.platform,
            content: i.content,
            scheduled_at: new Date(t).toISOString(),
          })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${chosen.length} פוסטים נוספו לתור הפרסום`);
      onOpenChange(false);
      nav("/queue");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בתזמון");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (o) initSelection(); onOpenChange(o); }}
    >
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-accent" />
            תזמן לרשתות
          </DialogTitle>
        </DialogHeader>

        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            אין עדיין תוכן לתזמון. צור קודם פוסטים לרשתות.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">בחר פלטפורמות</Label>
              <div className="space-y-1.5">
                {available.map((i) => {
                  const meta = PLATFORM_META[i.platform];
                  return (
                    <label
                      key={i.platform}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors",
                        selected.has(i.platform) ? "border-accent bg-accent/5" : "border-border hover:border-accent/30"
                      )}
                    >
                      <Checkbox
                        checked={selected.has(i.platform)}
                        onCheckedChange={() => toggle(i.platform)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className={cn("text-sm font-medium", meta.color)}>{meta.label}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2" dir={meta.dir}>
                          {i.content.slice(0, 120)}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="schedule-when" className="text-xs text-muted-foreground">מתי לפרסם</Label>
              <Input
                id="schedule-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="w-full"
              />
              <p className="text-[11px] text-muted-foreground">
                בזמן שתבחר תקבל מייל עם התוכן מוכן להדבקה וקישור ישיר לפלטפורמה.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>ביטול</Button>
          <Button onClick={handleSchedule} disabled={saving || available.length === 0} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            תזמן {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
