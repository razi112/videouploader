import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Play, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSessionAdmin } from "@/lib/media";

export function SiteHeader() {
  const { session, isAdmin } = useSessionAdmin();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isOwner = session?.user?.email === "razi61293697@gmail.com";

  return (
    <header className="sticky top-0 z-20 w-full border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-md transition-transform group-hover:scale-105">
            <Play className="h-4 w-4 fill-primary-foreground text-primary-foreground" />
          </span>
          <span className="text-lg font-bold tracking-tight">Reel</span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {session ? (
            <>
              {isOwner && isAdmin && pathname !== "/upload" && (
                <Button asChild size="sm" className="gap-1.5">
                  <Link to="/upload">
                    <Upload className="h-3.5 w-3.5" />
                    Dashboard
                  </Link>
                </Button>
              )}
              {isOwner && isAdmin && pathname === "/upload" && (
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link to="/">
                    <Play className="h-3.5 w-3.5" />
                    Public site
                  </Link>
                </Button>
              )}
              {isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate({ to: "/", replace: true });
                  }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              )}
            </>
          ) : (
            /* Hidden admin entry — only visible as a subtle link, not shown to public */
            <Link
              to="/admin"
              className="rounded px-2 py-1 text-xs text-transparent transition-colors hover:text-muted-foreground select-none"
              aria-hidden="true"
              tabIndex={-1}
            >
              ·
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
