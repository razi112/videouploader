import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { BUCKET, signPaths, useSessionAdmin, type VideoRow } from "@/lib/media";

export const Route = createFileRoute("/watch/$id")({
  head: () => ({
    meta: [
      { title: "Watch — Reel" },
      { name: "description", content: "Watch this video on Reel." },
      { property: "og:title", content: "Watch — Reel" },
      { property: "og:description", content: "Watch this video on Reel." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Watch,
});

function Watch() {
  const { id } = Route.useParams();
  const { isAdmin } = useSessionAdmin();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["video", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("videos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const v = data as VideoRow;
      const urls = await signPaths([v.video_path, v.thumbnail_path ?? ""]);
      return { ...v, videoUrl: urls[v.video_path], thumbUrl: v.thumbnail_path ? urls[v.thumbnail_path] : undefined };
    },
  });

  const remove = async () => {
    if (!data || !confirm("Delete this video?")) return;
    await supabase.storage.from(BUCKET).remove([data.video_path, data.thumbnail_path ?? ""].filter(Boolean));
    const { error } = await supabase.from("videos").delete().eq("id", data.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Video deleted");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All videos
        </Link>
        {isLoading && <div className="aspect-video animate-pulse rounded-xl bg-muted" />}
        {!isLoading && !data && <p className="text-muted-foreground">Video not found.</p>}
        {data && (
          <>
            <video
              key={data.videoUrl}
              src={data.videoUrl}
              poster={data.thumbUrl}
              controls
              playsInline
              className="aspect-video w-full rounded-xl bg-foreground"
            />
            <div className="mt-4 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">{data.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(data.created_at).toLocaleDateString()}
                </p>
              </div>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={remove}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
