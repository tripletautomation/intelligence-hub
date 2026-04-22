import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Search, Settings, Shield, ChevronDown, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  search?: string;
  onSearchChange?: (v: string) => void;
}

const tabs = [
  { to: "/", label: "ראשי", end: true },
  { to: "/events", label: "אירועים" },
  { to: "/discover", label: "חיפוש אירועים" },
  { to: "/saved", label: "השמורים שלי" },
  { to: "/archive", label: "ארכיון" },
];

export const AppLayout = ({ children, search, onSearchChange }: Props) => {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { data: isAdmin } = useIsAdmin();
  const greetingName = profile?.first_name?.trim() || user?.email?.split("@")[0] || "";
  const nav = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    nav("/auth");
  };

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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <span className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground">
                  {greetingName ? greetingName.charAt(0).toUpperCase() : <User className="h-3.5 w-3.5" />}
                </span>
                <span className="hidden sm:inline text-sm">
                  שלום, <span className="text-foreground font-medium">{greetingName || "אורח"}</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                {user?.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav("/preferences")} className="gap-2 cursor-pointer">
                <Settings className="h-4 w-4" /> העדפות
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem onClick={() => nav("/admin")} className="gap-2 cursor-pointer">
                  <Shield className="h-4 w-4" /> ניהול
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" /> יציאה
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
