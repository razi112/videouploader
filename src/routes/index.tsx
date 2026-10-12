import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Play, Search } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { signPaths, type VideoRow } from "@/lib/media";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reel — Watch videos" },
      { name: "description", content: "Browse and watch all uploaded videos." },
      { property: "og:title", content: "Reel — Watch videos" },
      { property: "og:description", content: "Browse and watch all uploaded videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

async function fetchVideos() {
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as VideoRow[];
  const thumbs = await signPaths(rows.map((r) => r.thumbnail_path ?? ""));
  return rows.map((r) => ({
    ...r,
    thumbUrl: r.thumbnail_path ? thumbs[r.thumbnail_path] : undefined,
  }));
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function Index() {
  const { data, isLoading, error } = useQuery({ queryKey: ["videos"], queryFn: fetchVideos });
  const [search, setSearch] = useState("");

  const filtered = data?.filter((v) =>
    v.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">

        {/* ── Toolbar ── */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">
            {search ? `Results for "${search}"` : "All videos"}
            {filtered && (
              <span className="ml-2 text-base font-normal text-muted-foreground">
                ({filtered.length})
              </span>
            )}
          </h1>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search videos…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-muted/50 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-background"
            />
          </div>
        </div>

        {/* ── Loading skeletons ── */}
        {isLoading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-3">
                <div className="aspect-video rounded-xl bg-muted" />
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center text-destructive">
            Couldn't load videos. Please refresh.
          </div>
        )}

        {/* ── Empty state ── */}
        {!isLoading && filtered?.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Play className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="font-medium text-muted-foreground">
              {search ? "No videos match your search." : "No videos yet."}
            </p>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-sm text-primary hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {/* ── Video grid ── */}
        {filtered && filtered.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((v) => (
              <VideoCard key={v.id} v={v} />
            ))}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="mt-16 border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-1 px-4">
          <div className="flex items-center gap-2">
            <Play className="h-3.5 w-3.5 fill-primary text-primary" />
            <span className="font-semibold text-foreground">Reel</span>
          </div>
          <p>A simple place to watch videos.</p>
        </div>
      </footer>
    </div>
  );
}

/* ─── Video card ─────────────────────────────────────────────────────────── */
type VideoWithThumb = VideoRow & { thumbUrl?: string | undefined };

function VideoCard({ v }: { v: VideoWithThumb }) {
  return (
    <Link to="/watch/$id" params={{ id: v.id }} className="group block">
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
        {v.thumbUrl ? (
          <img
            src={v.thumbUrl}
            alt={v.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Play className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="h-5 w-5 fill-black text-black" />
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className="mt-3 space-y-0.5">
        <h2 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
          {v.title}
        </h2>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {timeAgo(v.created_at)}
        </p>
      </div>
    </Link>
  );
}
