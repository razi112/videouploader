import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin sign in — Reel" },
      { name: "description", content: "Admin sign in to upload videos." },
      { property: "og:title", content: "Admin sign in — Reel" },
      { property: "og:description", content: "Admin sign in to upload videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAuth,
});

function AdminAuth() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return toast.error(error.message);
      navigate({ to: "/upload" });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/upload` },
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      if (data.session) navigate({ to: "/upload" });
      else toast.success("Check your email to confirm your account.");
    }
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-3xl font-bold">{mode === "in" ? "Admin sign in" : "Create admin account"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "in" ? "Sign in to upload videos." : "The first account created becomes the admin."}
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {mode === "in" ? "First time? Create the admin account" : "Already have an account? Sign in"}
        </button>
      </main>
    </div>
  );
}
