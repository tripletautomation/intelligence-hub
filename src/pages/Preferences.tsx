import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { usePreferences, useSavePreferences, useSources, useItems } from "@/hooks/useIntelligence";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const Preferences = () => {
  const { data: prefs } = usePreferences();
  const { data: sources = [] } = useSources();
  const { data: items = [] } = useItems();
  const save = useSavePreferences();

  const [topics, setTopics] = useState<string[]>([]);
  const [srcs, setSrcs] = useState<string[]>([]);
  const [region, setRegion] = useState<"israel" | "global" | "balanced">("balanced");
  const [unreadFirst, setUnreadFirst] = useState(true);
  const [prioEvents, setPrioEvents] = useState(false);
  const [hideDisliked, setHideDisliked] = useState(true);

  useEffect(() => {
    if (!prefs) return;
    setTopics(prefs.preferred_topics);
    setSrcs(prefs.preferred_sources);
    setRegion(prefs.region_preference);
    setUnreadFirst(prefs.show_unread_first);
    setPrioEvents(prefs.prioritize_events);
    setHideDisliked(prefs.hide_disliked);
  }, [prefs]);

  const allTopics = Array.from(new Set(items.flatMap((i) => i.tags_ai))).sort();

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const onSave = async () => {
    await save.mutateAsync({
      preferred_topics: topics,
      preferred_sources: srcs,
      hidden_item_ids: prefs?.hidden_item_ids ?? [],
      region_preference: region,
      show_unread_first: unreadFirst,
      prioritize_events: prioEvents,
      hide_disliked: hideDisliked,
    });
    toast.success("ההעדפות נשמרו");
  };

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        <Section title="נושאים מועדפים" subtitle="פריטים בנושאים אלו יקבלו עדיפות גבוהה יותר">
          <div className="flex flex-wrap gap-2">
            {allTopics.length === 0 && <div className="text-muted-foreground text-sm">אין נושאים זמינים עדיין</div>}
            {allTopics.map((t) => (
              <Chip key={t} active={topics.includes(t)} onClick={() => setTopics(toggle(topics, t))}>#{t}</Chip>
            ))}
          </div>
        </Section>

        <Section title="מקורות מועדפים">
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <Chip key={s.id} active={srcs.includes(s.id)} onClick={() => setSrcs(toggle(srcs, s.id))}>{s.name}</Chip>
            ))}
          </div>
        </Section>

        <Section title="העדפת אזור">
          <div className="flex gap-2">
            {([
              { v: "israel", l: "ישראל" },
              { v: "global", l: "גלובלי" },
              { v: "balanced", l: "מאוזן" },
            ] as const).map((o) => (
              <Chip key={o.v} active={region === o.v} onClick={() => setRegion(o.v)}>{o.l}</Chip>
            ))}
          </div>
        </Section>

        <Section title="התנהגות תצוגה">
          <div className="space-y-3">
            <Toggle id="unread" label="הצג לא-נקראו תחילה" checked={unreadFirst} onCheckedChange={setUnreadFirst} />
            <Toggle id="ev" label="תעדף אירועים" checked={prioEvents} onCheckedChange={setPrioEvents} />
            <Toggle id="hd" label="הסתר פריטים שסומנו כלא מעניינים" checked={hideDisliked} onCheckedChange={setHideDisliked} />
          </div>
        </Section>

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={save.isPending}>
            {save.isPending ? "שומר..." : "שמור העדפות"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

const Section = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="surface-card p-6">
    <h3 className="text-base font-bold text-primary mb-1">{title}</h3>
    {subtitle && <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>}
    <div className={subtitle ? "" : "mt-3"}>{children}</div>
  </div>
);

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
      active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
    )}
  >
    {children}
  </button>
);

const Toggle = ({ id, label, checked, onCheckedChange }: { id: string; label: string; checked: boolean; onCheckedChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between gap-4">
    <Label htmlFor={id} className="text-sm font-normal cursor-pointer">{label}</Label>
    <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

export default Preferences;
