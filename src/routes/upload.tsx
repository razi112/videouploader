import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { BUCKET, captureThumbnail, useSessionAdmin } from "@/lib/media";

export const Route = createFileRoute("/upload")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Upload video — Reel" },
      { name: "description", content: "Upload a new video." },
      { property: "og:title", content: "Upload video — Reel" },
      { property: "og:description", content: "Upload a new video." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const { session, isAdmin, loading } = useSessionAdmin();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    try {
      setProgress(10);
      setStep("Creating thumbnail…");
      const thumb = await captureThumbnail(file);
      const base = crypto.randomUUID();
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const videoPath = `videos/${base}.${ext}`;
      let thumbPath: string | null = null;
      if (thumb) {
        setProgress(25);
        thumbPath = `thumbnails/${base}.jpg`;
        const { error } = await supabase.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: "image/jpeg" });
        if (error) thumbPath = null;
      }
      setProgress(40);
      setStep("Uploading video…");
      const { error: vErr } = await supabase.storage
        .from(BUCKET)
        .upload(videoPath, file, { contentType: file.type || "video/mp4" });
      if (vErr) throw vErr;
      setProgress(90);
      setStep("Saving…");
      const { data, error } = await supabase
        .from("videos")
        .insert({ title: title.trim(), video_path: videoPath, thumbnail_path: thumbPath })
        .select("id")
        .single();
      if (error) throw error;
      setProgress(100);
      toast.success("Video uploaded");
      qc.invalidateQueries({ queryKey: ["videos"] });
      navigate({ to: "/watch/$id", params: { id: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setStep(null);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-10">
        {loading ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        ) : !session ? (
          <div className="text-center">
            <p className="text-muted-foreground">Please sign in as admin to upload.</p>
            <Button asChild className="mt-4"><Link to="/admin">Admin sign in</Link></Button>
          </div>
        ) : !isAdmin ? (
          <p className="text-center text-muted-foreground">Only the admin can upload videos.</p>
        ) : (
          <>
            <h1 className="text-3xl font-bold">Upload video</h1>
            <form onSubmit={submit} className="mt-8 space-y-6">
              <label
                htmlFor="file"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-4 py-12 text-center transition-colors hover:border-primary"
              >
                <UploadCloud className="h-10 w-10 text-primary" />
                <span className="font-medium">{file ? file.name : "Choose a video from your device"}</span>
                <span className="text-sm text-muted-foreground">
                  {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "MP4, MOV or WebM · up to 500 MB"}
                </span>
                <input
                  id="file"
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                  }}
                />
              </label>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
              </div>
              {step && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground">{step}</p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={!file || !title.trim() || !!step}>
                {step ? "Uploading…" : "Upload"}
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
