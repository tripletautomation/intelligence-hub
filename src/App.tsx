import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { RequireAuth } from "@/components/RequireAuth";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Archive from "./pages/Archive";
import Events from "./pages/Events";
import Discover from "./pages/Discover";
import Saved from "./pages/Saved";
import Preferences from "./pages/Preferences";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/archive" element={<RequireAuth><Archive /></RequireAuth>} />
            <Route path="/events" element={<RequireAuth><Events /></RequireAuth>} />
            <Route path="/discover" element={<RequireAuth><Discover /></RequireAuth>} />
            <Route path="/saved" element={<RequireAuth><Saved /></RequireAuth>} />
            <Route path="/preferences" element={<RequireAuth><Preferences /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
