import { useState, FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const Auth = () => {
  const { user, loading, signIn, signUp } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === "up" && firstName.trim().length < 1) {
      toast.error("נא להזין שם פרטי");
      return;
    }
    setBusy(true);
    if (mode === "in") {
      const { error } = await signIn(email, password);
      setBusy(false);
      if (error) {
        toast.error(error);
      } else {
        toast.success("ברוך שובך");
        nav("/");
      }
    } else {
      const { error } = await signUp(email, password, firstName);
      if (error) {
        setBusy(false);
        toast.error(error);
        return;
      }
      // Auto sign-in after signup
      const { error: signInErr } = await signIn(email, password);
      setBusy(false);
      if (signInErr) {
        toast.success("החשבון נוצר. אנא התחבר/י");
        setMode("in");
      } else {
        toast.success("החשבון נוצר");
        nav("/");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="surface-card w-full max-w-md p-8 animate-fade-in">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-accent font-semibold">Triple T</div>
          <h1 className="text-2xl mt-1">מרכז המודיעין הפנימי</h1>
          <p className="text-muted-foreground text-sm mt-2">
            {mode === "in" ? "התחברות בשביל להמשיך" : "פתיחת חשבון פנימי חדש"}
          </p>
        </div>
        <form onSubmit={handle} className="space-y-4">
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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">סיסמה</Label>
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
        <button
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="text-sm text-accent hover:underline mt-6 block w-full text-center"
        >
          {mode === "in" ? "אין לך חשבון? צור עכשיו" : "כבר יש חשבון? התחבר"}
        </button>
      </div>
    </div>
  );
};

export default Auth;
