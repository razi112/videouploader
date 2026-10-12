import { Link, useNavigate } from "@tanstack/react-router";
import { Play, Upload, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSessionAdmin } from "@/lib/media";

export function SiteHeader() {
  const { session, isAdmin } = useSessionAdmin();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Play className="h-4 w-4 fill-current" />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">Reel</span>
        </Link>
        {session && (
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button asChild size="sm">
                <Link to="/upload">
                  <Upload className="h-4 w-4" /> Upload
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/", replace: true });
              }}
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
