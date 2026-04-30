import { useState, FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Lock, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "in" | "up" | "otp" | "reset";

const Auth = () => {
  const { user, loading, recoveryMode, signIn, signUp, signInWithOtp, resetPassword, updatePassword } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("in");
  const [otpSent, setOtpSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user && !recoveryMode) return <Navigate to="/" replace />;

  if (recoveryMode) {
    const handleNewPassword = async (e: FormEvent) => {
      e.preventDefault();
      if (newPassword.length < 6) { toast.error("הסיסמה חייבת להכיל לפחות 6 תווים"); return; }
      setBusy(true);
      const { error } = await updatePassword(newPassword);
      setBusy(false);
      if (error) { toast.error(error); return; }
      toast.success("הסיסמה עודכנה בהצלחה");
      nav("/");
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="surface-card w-full max-w-md p-8 animate-fade-in">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-widest text-accent font-semibold">Triple T</div>
            <h1 className="text-2xl mt-1">הגדר סיסמה חדשה</h1>
          </div>
          <form onSubmit={handleNewPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new_pw">סיסמה חדשה</Label>
              <Input
                id="new_pw"
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                dir="ltr"
                className="text-start"
                placeholder="לפחות 6 תווים"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "מעדכן..." : "עדכן סיסמה"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await resetPassword(email);
    setBusy(false);
    if (error) { toast.error(error); return; }
    setResetSent(true);
  };

  const handlePasswordAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "up" && firstName.trim().length < 1) {
      toast.error("נא להזין שם פרטי");
      return;
    }
    setBusy(true);
    if (mode === "in") {
      const { error } = await signIn(email, password);
      setBusy(false);
      if (error) { toast.error(error); return; }
      toast.success("ברוך שובך");
      nav("/");
    } else {
      const { error } = await signUp(email, password, firstName);
      if (error) { setBusy(false); toast.error(error); return; }
      const { error: signInErr } = await signIn(email, password);
      setBusy(false);
      if (signInErr) { toast.success("החשבון נוצר. אנא התחבר/י"); setMode("in"); }
      else { toast.success("החשבון נוצר"); nav("/"); }
    }
  };

  const handleOtp = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signInWithOtp(email);
    setBusy(false);
    if (error) { toast.error(error); return; }
    setOtpSent(true);
    toast.success("קישור נשלח למייל שלך");
  };

  const tabs: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: "in", label: "סיסמה", icon: <Lock className="h-3.5 w-3.5" /> },
    { id: "otp", label: "קישור במייל", icon: <Mail className="h-3.5 w-3.5" /> },
    { id: "up", label: "הרשמה", icon: <UserPlus className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="surface-card w-full max-w-md p-8 animate-fade-in">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-accent font-semibold">Triple T</div>
          <h1 className="text-2xl mt-1">מרכז המודיעין הפנימי</h1>
        </div>

        <div className="flex gap-1 mb-6 bg-muted/40 rounded-lg p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setMode(t.id); setOtpSent(false); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-colors",
                mode === t.id
                  ? "bg-background shadow-sm text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {mode === "reset" ? (
          resetSent ? (
            <div className="text-center space-y-4 py-4">
              <Mail className="h-12 w-12 text-accent mx-auto" />
              <h2 className="text-lg font-semibold text-primary">בדוק/י את תיבת המייל</h2>
              <p className="text-sm text-muted-foreground">
                שלחנו קישור לאיפוס סיסמה ל-<span className="font-medium text-foreground" dir="ltr">{email}</span>.
              </p>
              <button type="button" onClick={() => { setResetSent(false); setMode("in"); }} className="text-sm text-accent hover:underline">
                חזרה להתחברות
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset_email">דוא״ל</Label>
                <Input
                  id="reset_email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="text-start"
                  placeholder="your@email.com"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "שולח..." : "שלח קישור לאיפוס סיסמה"}
              </Button>
              <button type="button" onClick={() => setMode("in")} className="w-full text-sm text-muted-foreground hover:text-foreground text-center">
                חזרה להתחברות
              </button>
            </form>
          )
        ) : mode === "otp" ? (
          otpSent ? (
            <div className="text-center space-y-4 py-4">
              <Mail className="h-12 w-12 text-accent mx-auto" />
              <h2 className="text-lg font-semibold text-primary">בדוק/י את תיבת המייל</h2>
              <p className="text-sm text-muted-foreground">
                שלחנו קישור כניסה ל-<span className="font-medium text-foreground" dir="ltr">{email}</span>.
                לחץ על הקישור במייל כדי להתחבר.
              </p>
              <button
                type="button"
                onClick={() => setOtpSent(false)}
                className="text-sm text-accent hover:underline"
              >
                שלח שוב
              </button>
            </div>
          ) : (
            <form onSubmit={handleOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp_email">דוא״ל</Label>
                <Input
                  id="otp_email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="text-start"
                  placeholder="your@email.com"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "שולח..." : "שלח קישור כניסה"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                תקבל/י מייל עם קישור — ללא צורך בסיסמה
              </p>
            </form>
          )
        ) : (
          <form onSubmit={handlePasswordAuth} className="space-y-4">
            {mode === "up" && (
              <div className="space-y-2">
                <Label htmlFor="first_name">שם פרטי</Label>
                <Input
                  id="first_name"
                  type="text"
                  required
                  maxLength={60}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="שם פרטי"
                />
              </div>
            )}
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pw">סיסמה</Label>
                {mode === "in" && (
                  <button
                    type="button"
                    onClick={() => { setMode("reset"); setResetSent(false); }}
                    className="text-xs text-muted-foreground hover:text-accent transition-colors"
                  >
                    שכחתי סיסמה
                  </button>
                )}
              </div>
              <Input
                id="pw"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                className="text-start"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "..." : mode === "in" ? "התחברות" : "יצירת חשבון"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Auth;
