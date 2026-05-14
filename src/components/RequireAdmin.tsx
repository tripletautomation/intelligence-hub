import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useAdmin";
import { Shield } from "lucide-react";

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS === 'true';

export const RequireAdmin = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  if (DEV_BYPASS) return <>{children}</>;

  if (loading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">טוען...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="surface-card max-w-sm w-full p-8 text-center space-y-4">
          <Shield className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-primary">גישה מוגבלת</h1>
          <p className="text-sm text-muted-foreground">דף זה מיועד לאדמינים בלבד.</p>
          <a href="/" className="text-accent hover:underline text-sm">חזור לדף הראשי</a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};
