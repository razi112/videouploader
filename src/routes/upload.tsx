import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Film,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  Pencil,
  Play,
  Save,
  Trash2,
  TrendingUp,
  UploadCloud,
  Video,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { BUCKET, captureThumbnail, uploadFile, signPaths, useSessionAdmin, type VideoRow } from "@/lib/media";

export const Route = createFileRoute("/upload")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Reel" },
      { name: "description", content: "Admin dashboard to upload and manage videos." },
      { property: "og:title", content: "Admin Dashboard — Reel" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UploadPage,
});

/* ─── data ─────────────────────────────────────────────────────────────── */
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

/* ─── tab type ──────────────────────────────────────────────────────────── */
type Tab = "upload" | "history";

/* ─── page ──────────────────────────────────────────────────────────────── */
function UploadPage() {
  const { session, isAdmin, loading } = useSessionAdmin();
  const [tab, setTab] = useState<Tab>("upload");
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <Film className="h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">Admin access required</h1>
        <p className="text-muted-foreground">Please sign in to access the dashboard.</p>
        <Button asChild>
          <Link to="/admin">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="text-muted-foreground">Only the admin can access this page.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar ── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Play className="h-4 w-4 fill-current" />
            </span>
            <span className="text-lg font-bold tracking-tight">Reel</span>
          </Link>
          <Badge variant="secondary" className="ml-auto text-xs">Admin</Badge>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 p-3">
          <SidebarItem
            icon={<UploadCloud className="h-4 w-4" />}
            label="Upload Video"
            active={tab === "upload"}
            onClick={() => setTab("upload")}
          />
          <SidebarItem
            icon={<LayoutDashboard className="h-4 w-4" />}
            label="Upload History"
            active={tab === "history"}
            onClick={() => setTab("history")}
          />
          <div className="pt-1">
            <div className="my-2 border-t border-border" />
          </div>
          <SidebarItem
            icon={<Video className="h-4 w-4" />}
            label="View Public Site"
            onClick={() => navigate({ to: "/" })}
          />
        </nav>

        {/* Sign out */}
        <div className="border-t border-border p-3">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/", replace: true });
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
          <div>
            <h1 className="text-lg font-semibold">
              {tab === "upload" ? "Upload Video" : "Upload History"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {tab === "upload" ? "Add a new video to your channel" : "Manage your uploaded content"}
            </p>
          </div>
          {/* Mobile tabs */}
          <div className="flex gap-2 lg:hidden">
            <Button
              size="sm"
              variant={tab === "upload" ? "default" : "outline"}
              onClick={() => setTab("upload")}
            >
              <UploadCloud className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={tab === "history" ? "default" : "outline"}
              onClick={() => setTab("history")}
            >
              <LayoutDashboard className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {tab === "upload" ? <UploadTab /> : <HistoryTab />}
        </main>
      </div>
    </div>
  );
}

/* ─── Sidebar item ──────────────────────────────────────────────────────── */
function SidebarItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ─── Upload Tab ─────────────────────────────────────────────────────────── */
function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtEta(secs: number) {
  if (!isFinite(secs) || secs <= 0) return "";
  if (secs < 60) return `${Math.ceil(secs)}s left`;
  if (secs < 3600) return `${Math.ceil(secs / 60)}m left`;
  return `${(secs / 3600).toFixed(1)}h left`;
}

function UploadTab() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [speedBps, setSpeedBps] = useState(0);
  const [etaSecs, setEtaSecs] = useState(0);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleThumbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbFile(f);
    setThumbPreview(f ? URL.createObjectURL(f) : null);
  };

  const removeThumb = () => {
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbFile(null);
    setThumbPreview(null);
  };

  const reset = () => {
    setTitle("");
    setDescription("");
    setFile(null);
    removeThumb();
    setStep(null);
    setProgress(0);
    setUploadedBytes(0);
    setTotalBytes(0);
    setSpeedBps(0);
    setEtaSecs(0);
    setDone(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setDone(false);

    try {
      /* ── Step 1: thumbnail ── */
      setProgress(5);
      setStep("Preparing thumbnail…");
      const thumbBlob: Blob | null = thumbFile ?? (await captureThumbnail(file));

      const base = crypto.randomUUID();
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const videoPath = `videos/${base}.${ext}`;
      let thumbPath: string | null = null;

      if (thumbBlob) {
        setProgress(10);
        thumbPath = `thumbnails/${base}.jpg`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(thumbPath, thumbBlob, { contentType: "image/jpeg" });
        if (error) thumbPath = null;
      }

      /* ── Step 2: fast chunked video upload ── */
      setStep("Uploading video…");
      setTotalBytes(file.size);

      await uploadFile(
        videoPath,
        file,
        file.type || "video/mp4",
        ({ percent, uploadedBytes: ub, speedBps: sp, etaSeconds: eta }) => {
          // Map 0–100% of video upload into 15–90% of overall progress
          setProgress(15 + Math.round(percent * 0.75));
          setUploadedBytes(ub);
          setSpeedBps(sp);
          setEtaSecs(eta);
        },
      );

      /* ── Step 3: save metadata ── */
      setProgress(95);
      setStep("Saving metadata…");
      setSpeedBps(0);
      setEtaSecs(0);

      const { data, error } = await supabase
        .from("videos")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          video_path: videoPath,
          thumbnail_path: thumbPath,
        })
        .select("id")
        .single();
      if (error) throw error;

      setProgress(100);
      setStep("Done!");
      setDone(true);
      toast.success("Video uploaded successfully");
      qc.invalidateQueries({ queryKey: ["videos"] });

      setTimeout(() => {
        navigate({ to: "/watch/$id", params: { id: data.id } });
      }, 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setStep(null);
      setProgress(0);
      setUploadedBytes(0);
      setSpeedBps(0);
      setEtaSecs(0);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* ── Success state ── */}
      {done && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Upload complete! Redirecting to watch page…</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card shadow-sm">
        {/* Card header */}
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold">New upload</h2>
          <p className="text-xs text-muted-foreground mt-0.5">MP4, MOV or WebM · up to 5 GB</p>
        </div>

        <form onSubmit={submit} className="space-y-6 p-6">
          {/* ── Two column: video + thumbnail ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Video picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Video file <span className="text-destructive">*</span></Label>
              <label
                htmlFor="file"
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-all ${
                  file
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/30 hover:border-primary hover:bg-primary/5"
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${file ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium truncate max-w-[160px]">
                    {file ? file.name : "Choose video"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {file ? `${(file.size / 1024 / 1024 / 1024).toFixed(2)} GB` : "MP4, MOV, WebM"}
                  </p>
                </div>
                <input
                  id="file"
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 5 * 1024 * 1024 * 1024) {
                      toast.error("File exceeds 5 GB limit.");
                      return;
                    }
                    setFile(f);
                    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                  }}
                />
              </label>
            </div>

            {/* Thumbnail picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Thumbnail
                <span className="ml-1.5 text-xs text-muted-foreground font-normal">(optional — auto if empty)</span>
              </Label>
              {thumbPreview ? (
                <div className="relative overflow-hidden rounded-xl border border-border">
                  <img src={thumbPreview} alt="Preview" className="aspect-video w-full object-cover" />
                  <button
                    type="button"
                    onClick={removeThumb}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white text-xs hover:bg-black/80"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="thumb"
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-all hover:border-primary hover:bg-primary/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <ImagePlus className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Choose image</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG or WebP</p>
                  </div>
                  <input id="thumb" type="file" accept="image/*" className="sr-only" onChange={handleThumbChange} />
                </label>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="Enter a title for this video…"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              className="h-10"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">
              Description
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Tell viewers about this video…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={4}
              className="resize-none text-sm"
            />
            <p className="text-right text-xs text-muted-foreground">
              {description.length} / 5000
            </p>
          </div>

          {/* Progress */}
          {step && (
            <div className="space-y-3 rounded-xl bg-muted/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Zap className="h-4 w-4 text-primary animate-pulse" />
                  {step}
                </div>
                <span className="text-sm font-semibold tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2.5" />
              {/* Speed / bytes / ETA row */}
              {totalBytes > 0 && step === "Uploading video…" && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {fmt(uploadedBytes)} / {fmt(totalBytes)}
                  </span>
                  <div className="flex items-center gap-3">
                    {speedBps > 0 && (
                      <span className="font-medium text-primary tabular-nums">
                        ↑ {fmt(speedBps)}/s
                      </span>
                    )}
                    {etaSecs > 0 && (
                      <span className="tabular-nums">{fmtEta(etaSecs)}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button type="submit" className="flex-1" disabled={!file || !title.trim() || !!step}>
              <UploadCloud className="h-4 w-4" />
              {step ? "Uploading…" : "Upload video"}
            </Button>
            {!step && (file || title) && (
              <Button type="button" variant="outline" onClick={reset}>
                Reset
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── History Tab ────────────────────────────────────────────────────────── */
type VideoWithThumb = VideoRow & { thumbUrl?: string | undefined };

function HistoryTab() {
  const qc = useQueryClient();
  const { data: history, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: fetchVideos,
  });

  const [editingVideo, setEditingVideo] = useState<VideoWithThumb | null>(null);

  const deleteVideo = async (v: VideoRow) => {
    if (!confirm(`Delete "${v.title}"?`)) return;
    await supabase.storage
      .from(BUCKET)
      .remove([v.video_path, v.thumbnail_path ?? ""].filter(Boolean));
    const { error } = await supabase.from("videos").delete().eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Video deleted");
    qc.invalidateQueries({ queryKey: ["videos"] });
  };

  const total = history?.length ?? 0;
  const thisMonth = history?.filter((v) => {
    const d = new Date(v.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length ?? 0;
  const withThumb = history?.filter((v) => v.thumbnail_path).length ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Stat cards ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Film className="h-5 w-5" />} label="Total videos" value={total} color="blue" />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="This month" value={thisMonth} color="green" />
        <StatCard icon={<ImagePlus className="h-5 w-5" />} label="With thumbnail" value={withThumb} color="purple" />
      </div>

      {/* ── Video grid ── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-semibold">All videos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Edit, watch, or delete your videos</p>
          </div>
          {total > 0 && (
            <Badge variant="secondary">{total} video{total !== 1 ? "s" : ""}</Badge>
          )}
        </div>

        <div className="p-6">
          {/* Loading skeletons */}
          {isLoading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="aspect-video rounded-xl bg-muted" />
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && total === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Video className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium text-muted-foreground">No videos yet</p>
              <p className="text-sm text-muted-foreground">Upload your first video to see it here.</p>
            </div>
          )}

          {/* Video grid */}
          {!isLoading && total > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {history!.map((v) => (
                <div key={v.id} className="group relative overflow-hidden rounded-xl border border-border bg-background transition-shadow hover:shadow-md">
                  {/* Thumbnail */}
                  <Link to="/watch/$id" params={{ id: v.id }}>
                    <div className="relative aspect-video overflow-hidden bg-muted">
                      {v.thumbUrl ? (
                        <img
                          src={v.thumbUrl}
                          alt={v.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Play className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
                          <Play className="h-5 w-5 fill-current" />
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* Info row */}
                  <div className="flex items-start gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <Link to="/watch/$id" params={{ id: v.id }}>
                        <p className="line-clamp-1 text-sm font-medium hover:underline">{v.title}</p>
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleDateString("en-US", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </p>
                    </div>
                    {/* Action buttons — visible on hover */}
                    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => setEditingVideo(v)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                        aria-label="Edit video"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteVideo(v)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete video"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Edit modal ── */}
      {editingVideo && (
        <EditModal
          video={editingVideo}
          onClose={() => setEditingVideo(null)}
          onSaved={() => {
            setEditingVideo(null);
            qc.invalidateQueries({ queryKey: ["videos"] });
            qc.invalidateQueries({ queryKey: ["video", editingVideo.id] });
          }}
        />
      )}
    </div>
  );
}

/* ─── Edit Modal ─────────────────────────────────────────────────────────── */
function EditModal({
  video,
  onClose,
  onSaved,
}: {
  video: VideoWithThumb;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description ?? "");
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(video.thumbUrl ?? null);
  const [saving, setSaving] = useState(false);

  const handleThumbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    if (thumbPreview && thumbPreview !== video.thumbUrl) URL.revokeObjectURL(thumbPreview);
    setThumbFile(f);
    setThumbPreview(URL.createObjectURL(f));
  };

  const removeThumb = () => {
    if (thumbPreview && thumbPreview !== video.thumbUrl) URL.revokeObjectURL(thumbPreview);
    setThumbFile(null);
    setThumbPreview(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      let thumbPath = video.thumbnail_path;

      /* Upload new thumbnail if chosen */
      if (thumbFile) {
        const base = video.id;
        const newThumbPath = `thumbnails/${base}.jpg`;
        /* Remove old thumbnail first if it exists */
        if (video.thumbnail_path) {
          await supabase.storage.from(BUCKET).remove([video.thumbnail_path]);
        }
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(newThumbPath, thumbFile, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw upErr;
        thumbPath = newThumbPath;
      } else if (thumbPreview === null && video.thumbnail_path) {
        /* User cleared the thumbnail */
        await supabase.storage.from(BUCKET).remove([video.thumbnail_path]);
        thumbPath = null;
      }

      const { error } = await supabase
        .from("videos")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          thumbnail_path: thumbPath,
        })
        .eq("id", video.id);

      if (error) throw error;
      toast.success("Video updated");
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-semibold">Edit video</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Update title, description or thumbnail</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={save} className="space-y-5 p-6">
          {/* Current thumbnail + replace */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Thumbnail</Label>
            {thumbPreview ? (
              <div className="relative overflow-hidden rounded-xl border border-border">
                <img src={thumbPreview} alt="Thumbnail" className="aspect-video w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-3 py-2 backdrop-blur-sm">
                  <label
                    htmlFor="edit-thumb"
                    className="cursor-pointer rounded-lg bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30"
                  >
                    Replace
                    <input
                      id="edit-thumb"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleThumbChange}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={removeThumb}
                    className="rounded-lg bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-destructive/70"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label
                htmlFor="edit-thumb"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-center transition-all hover:border-primary hover:bg-primary/5"
              >
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Choose new thumbnail</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG or WebP</p>
                </div>
                <input
                  id="edit-thumb"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleThumbChange}
                />
              </label>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-title" className="text-sm font-medium">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              className="h-10"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-desc" className="text-sm font-medium">
              Description
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="edit-desc"
              placeholder="Tell viewers about this video…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
              rows={4}
              className="resize-none text-sm"
            />
            <p className="text-right text-xs text-muted-foreground">{description.length} / 5000</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button type="submit" className="flex-1 gap-1.5" disabled={!title.trim() || saving}>
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Stat card ──────────────────────────────────────────────────────────── */
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "blue" | "green" | "purple";
}) {
  const colors = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]}`}>
          {icon}
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}
