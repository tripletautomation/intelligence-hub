import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Shield, ShieldOff, ShieldAlert, UserPlus } from "lucide-react";
import { formatHeRelative } from "@/lib/format";

interface UserRow {
  user_id: string;
  email: string;
  first_name: string | null;
  roles: string[];
  created_at: string;
}

export const UserAccessManager = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: isAdmin = false, isLoading: roleLoading } = useIsAdmin();
  const [emailInput, setEmailInput] = useState("");
  const [granting, setGranting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    enabled: isAdmin,
    queryKey: ["admin_users_with_roles"],
    queryFn: async (): Promise<UserRow[]> => {
      const { data, error } = await (supabase as any).rpc("admin_list_users_with_roles");
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });

  const grantAdminByEmail = async () => {
    const email = emailInput.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("הזן אימייל תקין");
      return;
    }
    setGranting(true);
    try {
      const { data: uid, error: lookupErr } = await (supabase as any).rpc("get_user_id_by_email", { _email: email });
      if (lookupErr) throw lookupErr;
      if (!uid) {
        toast.error("לא נמצא משתמש עם אימייל זה. הוא צריך להירשם תחילה.");
        return;
      }
      const { error } = await (supabase as any)
        .from("user_roles")
        .insert({ user_id: uid, role: "admin" });
      if (error && !String(error.message).includes("duplicate")) throw error;
      toast.success(`הוקצה תפקיד admin ל-${email}`);
      setEmailInput("");
      qc.invalidateQueries({ queryKey: ["admin_users_with_roles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בהקצאת תפקיד");
    } finally {
      setGranting(false);
    }
  };

  const toggleAdmin = async (u: UserRow, makeAdmin: boolean) => {
    if (u.user_id === user?.id && !makeAdmin) {
      toast.error("לא ניתן להסיר admin מעצמך");
      return;
    }
    setBusyUserId(u.user_id);
    try {
      if (makeAdmin) {
        const { error } = await (supabase as any)
          .from("user_roles")
          .insert({ user_id: u.user_id, role: "admin" });
        if (error && !String(error.message).includes("duplicate")) throw error;
        toast.success(`${u.email} הוא עכשיו admin`);
      } else {
        const { error } = await (supabase as any)
          .from("user_roles")
          .delete()
          .eq("user_id", u.user_id)
          .eq("role", "admin");
        if (error) throw error;
        toast.success(`הוסרה הרשאת admin מ-${u.email}`);
      }
      qc.invalidateQueries({ queryKey: ["admin_users_with_roles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusyUserId(null);
    }
  };

  if (roleLoading) {
    return <div className="surface-card p-6 text-sm text-muted-foreground">טוען...</div>;
  }
  if (!isAdmin) {
    return (
      <div className="surface-card p-6 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h2 className="text-lg font-bold text-primary">ניהול הרשאות משתמשים</h2>
          <p className="text-sm text-muted-foreground mt-1">דרושות הרשאות אדמין.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-primary">ניהול הרשאות משתמשים</h2>
        <p className="text-sm text-muted-foreground">
          כל משתמש מאומת יכול להריץ ingestion. רק admin יכול לנהל מקורות והרשאות.
        </p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <Input
          dir="ltr"
          placeholder="user@example.com"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          className="flex-1 min-w-[220px]"
          onKeyDown={(e) => e.key === "Enter" && grantAdminByEmail()}
        />
        <Button onClick={grantAdminByEmail} disabled={granting || !emailInput.trim()} className="gap-1.5">
          {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          הקצה admin לפי אימייל
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">טוען משתמשים...</div>
      ) : users.length === 0 ? (
        <div className="text-sm text-muted-foreground">אין משתמשים עדיין</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const isUserAdmin = u.roles.includes("admin");
            const isMe = u.user_id === user?.id;
            const isBusy = busyUserId === u.user_id;
            return (
              <div key={u.user_id} className="p-3 rounded-md border border-border bg-background/50 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate" dir="ltr">{u.email}</span>
                    {u.first_name && <span className="text-xs text-muted-foreground">({u.first_name})</span>}
                    {isMe && <Badge variant="outline" className="text-xs">אתה</Badge>}
                    {isUserAdmin ? (
                      <Badge className="text-xs bg-primary/15 text-primary border-0 gap-1">
                        <Shield className="h-3 w-3" /> admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">משתמש רגיל</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">נרשם {formatHeRelative(u.created_at)}</div>
                </div>
                <Button
                  size="sm"
                  variant={isUserAdmin ? "outline" : "default"}
                  onClick={() => toggleAdmin(u, !isUserAdmin)}
                  disabled={isBusy || (isMe && isUserAdmin)}
                  className="gap-1.5 shrink-0"
                  title={isMe && isUserAdmin ? "לא ניתן להסיר admin מעצמך" : undefined}
                >
                  {isBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isUserAdmin ? (
                    <><ShieldOff className="h-3.5 w-3.5" /> הסר admin</>
                  ) : (
                    <><Shield className="h-3.5 w-3.5" /> הפוך ל-admin</>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
