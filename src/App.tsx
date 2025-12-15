import React, { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { Session, User } from "@supabase/supabase-js";
import ErrorBoundary from "./components/ErrorBoundary";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import PasswordResetPage from "./pages/PasswordResetPage";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Imprint from "./pages/Imprint";
import TermsOfService from "./pages/TermsOfService";
import { MedicationEffectsPage } from "./features/medication-effects/components/MedicationEffectsPage";
import { registerOfflineSupport } from "@/hooks/useOptimizedCache";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { initOfflineDB, syncPendingEntries } from "@/lib/offlineQueue";
import React from "react";

// Lazy load QA page (DEV only)
const QAPage = React.lazy(() => import("./pages/QAPage"));

// Create QueryClient with error recovery
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (mounted) {
          if (error && import.meta.env.DEV) {
            console.error('[AuthGuard] Error getting session:', error);
          }
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[AuthGuard] Session error:', error);
        }
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (mounted) {
          if (import.meta.env.DEV) {
            console.log('[AuthGuard] Auth state changed:', event, session?.user?.id ? 'user-id-present' : 'no-user');
          }
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      }
    );

    getInitialSession();

    // Register service worker for offline support
    registerOfflineSupport();

    // Initialize offline DB
    initOfflineDB();

    // Service Worker Message Listener for sync
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', async (event) => {
        if (event.data?.type === 'SYNC_PENDING_ENTRIES') {
          await syncPendingEntries();
        }
      });
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Migräne-App wird geladen...</p>
        </div>
      </div>
    );
  }

  return session ? <>{children}</> : <Navigate to="/auth" replace />;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider>
            <OfflineIndicator />
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/reset-password" element={<PasswordResetPage />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/imprint" element={<Imprint />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route 
                path="/" 
                element={
                  <AuthGuard>
                    <Index />
                  </AuthGuard>
                } 
              />
              <Route 
                path="/medication-effects" 
                element={
                  <AuthGuard>
                    <MedicationEffectsPage />
                  </AuthGuard>
                } 
              />
              {import.meta.env.DEV && (
                <Route path="/qa" element={
                  <React.Suspense fallback={<div className="p-8 text-center">Loading QA...</div>}>
                    <QAPage />
                  </React.Suspense>
                } />
              )}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Toaster />
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;