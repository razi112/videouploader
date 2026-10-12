import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
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
  return rows.map((r) => ({ ...r, thumbUrl: r.thumbnail_path ? thumbs[r.thumbnail_path] : undefined }));
}

function Index() {
  const { data, isLoading, error } = useQuery({ queryKey: ["videos"], queryFn: fetchVideos });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold sm:text-4xl">Videos</h1>
        {isLoading && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        )}
        {error && <p className="text-destructive">Couldn't load videos. Please refresh.</p>}
        {data && data.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-20 text-center text-muted-foreground">
            No videos yet.
          </div>
        )}
        {data && data.length > 0 && (
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((v) => (
              <Link key={v.id} to="/watch/$id" params={{ id: v.id }} className="group block">
                <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                  {v.thumbUrl ? (
                    <img
                      src={v.thumbUrl}
                      alt={v.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Play className="h-10 w-10" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                      <Play className="h-6 w-6 fill-current" />
                    </span>
                  </div>
                </div>
                <h2 className="mt-3 line-clamp-2 text-base font-semibold leading-snug">{v.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
