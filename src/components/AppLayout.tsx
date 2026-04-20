import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  search?: string;
  onSearchChange?: (v: string) => void;
}

const tabs = [
  { to: "/", label: "היום", end: true },
  { to: "/archive", label: "ארכיון" },
  { to: "/events", label: "אירועים" },
  { to: "/preferences", label: "העדפות" },
  { to: "/admin", label: "ניהול" },
];

export const AppLayout = ({ children, search, onSearchChange }: Props) => {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const greetingName = profile?.first_name?.trim() || user?.email?.split("@")[0] || "";
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-6">
          <div className="flex flex-col">
            <div className="text-[10px] uppercase tracking-widest text-accent font-semibold">Triple T</div>
            <h1 className="text-base font-bold text-primary leading-tight">Intelligence Hub</h1>
          </div>

          <div className="flex-1 max-w-xl mx-auto relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="חיפוש בכותרות, סיכומים ותגים..."
              className="pr-10 bg-background"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span dir="ltr">{user?.email}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                nav("/auth");
              }}
              className="gap-1.5"
            >
              <LogOut className="h-4 w-4" /> יציאה
            </Button>
          </div>
        </div>

        <nav className="max-w-7xl mx-auto px-6 flex gap-1 border-t border-border">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-accent text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
};
