import { useState, FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Shared internal password — not exposed to users
const OPEN_PASSWORD = "TripleT_Hub_Open_2026!";

const Auth = () => {
  const { user, loading, recoveryMode, signIn, signUp, updatePassword } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user && !recoveryMode) return <Navigate to="/" replace />;

  // Recovery mode (password reset link clicked) — keep this working
  if (recoveryMode) {
    const handleNewPassword = async (e: FormEvent) => {
      e.preventDefault();
      if (newPassword.length < 6) { toast.error("הסיסמה חייבת להכיל לפחות 6 תווים"); return; }
      setBusy(true);
      const { error } = await updatePassword(newPassword);
      setBusy(false);
      if (error) { toast.error(error); return; }
      toast.success("הסיסמה עודכנה");
      nav("/");
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="surface-card w-full max-w-md p-8 animate-fade-in">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-widest text-accent font-semibold">Triple T</div>
            <h1 className="text-2xl mt-1">עדכון סיסמה</h1>
          </div>
          <form onSubmit={handleNewPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new_pw">סיסמה חדשה</Label>
              <Input id="new_pw" type="password" required minLength={6} value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} dir="ltr" className="text-start" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "מעדכן..." : "עדכן"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("נא להזין שם"); return; }
    setBusy(true);
    try {
      // Ensure user exists and is confirmed (via service-role Edge Function)
      const { error: prepErr } = await supabase.functions.invoke("open-signin", {
        body: { email, password: OPEN_PASSWORD, name: name.trim() },
      });
      if (prepErr) { toast.error("שגיאת שרת — נסה שוב"); return; }

      // Sign in
      const { error: signInErr } = await signIn(email, OPEN_PASSWORD);
      if (signInErr) { toast.error("שגיאה בכניסה — נסה שוב"); return; }

      toast.success(`ברוך הבא, ${name.trim()}`);
      nav("/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="surface-card w-full max-w-sm p-8 animate-fade-in">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-accent font-semibold mb-1">Triple T</div>
          <h1 className="text-2xl font-bold text-primary">מרכז המודיעין הפנימי</h1>
          <p className="text-sm text-muted-foreground mt-1">הכנס שם ומייל כדי להיכנס</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">שם</Label>
            <Input
              id="name"
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם פרטי"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">דוא״ל</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="text-start"
              placeholder="your@email.com"
            />
          </div>
          <Button type="submit" className="w-full mt-2" disabled={busy}>
            {busy ? "כניסה..." : "כניסה"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Auth;
