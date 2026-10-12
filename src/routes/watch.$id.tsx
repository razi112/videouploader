import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Clock,
  Gauge,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Pause,
  PictureInPicture2,
  Play,
  Share2,
  ThumbsUp,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
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

/* ─── helpers ───────────────────────────────────────────────────────────── */
function fmtTime(s: number) {
  if (!isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) > 1 ? "s" : ""} ago`;
}

/** Map native video height to a quality label */
function heightToLabel(h: number): string {
  if (h >= 2160) return "4K (2160p)";
  if (h >= 1440) return "2K (1440p)";
  if (h >= 1080) return "1080p HD";
  if (h >= 720)  return "720p HD";
  if (h >= 480)  return "480p";
  if (h >= 360)  return "360p";
  if (h >= 240)  return "240p";
  return `${h}p`;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

type SettingsTab = "main" | "speed" | "quality";
type VideoWithThumb = VideoRow & { videoUrl: string; thumbUrl?: string | undefined };

/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOM PLAYER
═══════════════════════════════════════════════════════════════════════════ */
function VideoPlayer({ src, poster }: { src: string; poster?: string | undefined }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing,      setPlaying]      = useState(false);
  const [current,      setCurrent]      = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [buffered,     setBuffered]     = useState(0);
  const [volume,       setVolume]       = useState(1);
  const [muted,        setMuted]        = useState(false);
  const [speed,        setSpeed]        = useState(1);
  const [fullscreen,   setFullscreen]   = useState(false);
  const [showCtrl,     setShowCtrl]     = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab,  setSettingsTab]  = useState<SettingsTab>("main");

  /* quality — detected from the video's native resolution */
  const [nativeWidth,  setNativeWidth]  = useState(0);
  const [nativeHeight, setNativeHeight] = useState(0);
  const [qualityLabel, setQualityLabel] = useState("Auto");

  /* ── control visibility ── */
  const revealControls = useCallback(() => {
    setShowCtrl(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setShowCtrl(false), 3000);
  }, [playing]);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  /* ── fullscreen listener ── */
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  /* ── keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowRight": e.preventDefault(); v.currentTime = Math.min(v.currentTime + 5, v.duration); break;
        case "ArrowLeft":  e.preventDefault(); v.currentTime = Math.max(v.currentTime - 5, 0); break;
        case "ArrowUp":    e.preventDefault(); v.volume = Math.min(v.volume + 0.1, 1); setVolume(v.volume); break;
        case "ArrowDown":  e.preventDefault(); v.volume = Math.max(v.volume - 0.1, 0); setVolume(v.volume); break;
        case "m": setMuted((m) => { if (v) v.muted = !m; return !m; }); break;
        case "f": toggleFullscreen(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); }
    else          { v.pause(); setShowCtrl(true); }
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !muted;
    setMuted(!muted);
  }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }

  function togglePiP() {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else v.requestPictureInPicture().catch(() => toast.error("PiP not supported in this browser"));
  }

  function applySpeed(s: number) {
    const v = videoRef.current;
    if (v) v.playbackRate = s;
    setSpeed(s);
    setSettingsOpen(false);
    setSettingsTab("main");
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const nativeLabel = nativeHeight > 0 ? heightToLabel(nativeHeight) : "Auto";

  /* ── CtrlBtn helper (defined inside so it closes over state) ── */
  function CtrlBtn({
    children, onClick, label, active,
  }: {
    children: React.ReactNode;
    onClick: (e: React.MouseEvent) => void;
    label: string;
    active?: boolean;
  }) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/20 ${active ? "bg-white/20" : ""}`}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`group relative w-full overflow-hidden bg-black ${fullscreen ? "" : "rounded-2xl"}`}
      style={{ aspectRatio: "16/9" }}
      onMouseMove={revealControls}
      onMouseLeave={() => playing && setShowCtrl(false)}
      onClick={() => { togglePlay(); revealControls(); }}
    >
      {/* ── Video ── */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        className="h-full w-full"
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setCurrent(v.currentTime);
          if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
        }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration);
          setNativeWidth(v.videoWidth);
          setNativeHeight(v.videoHeight);
          setQualityLabel(heightToLabel(v.videoHeight));
        }}
        onPlay={() => { setPlaying(true); revealControls(); }}
        onPause={() => { setPlaying(false); setShowCtrl(true); }}
        onEnded={() => { setPlaying(false); setShowCtrl(true); }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
      />

      {/* ── Centre play icon (paused state) ── */}
      <div className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${!playing && showCtrl ? "opacity-100" : "opacity-0"}`}>
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
          <Play className="h-7 w-7 fill-white text-white" />
        </span>
      </div>

      {/* ── Settings menu ── */}
      {settingsOpen && (
        <div
          className="absolute bottom-16 right-3 z-30 w-56 overflow-hidden rounded-xl bg-black/95 py-1 text-white shadow-2xl backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Main menu ── */}
          {settingsTab === "main" && (
            <>
              <p className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                Settings
              </p>

              {/* Playback speed */}
              <button
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-white/10"
                onClick={() => setSettingsTab("speed")}
              >
                <span className="flex items-center gap-2.5">
                  <Gauge className="h-4 w-4 text-white/70" />
                  Playback speed
                </span>
                <span className="flex items-center gap-1 text-xs text-white/50">
                  {speed === 1 ? "Normal" : `${speed}×`}
                  <ChevronRight className="h-3 w-3" />
                </span>
              </button>

              {/* Quality */}
              <button
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-white/10"
                onClick={() => setSettingsTab("quality")}
              >
                <span className="flex items-center gap-2.5">
                  <MonitorPlay className="h-4 w-4 text-white/70" />
                  Quality
                </span>
                <span className="flex items-center gap-1 text-xs text-white/50">
                  {qualityLabel}
                  <ChevronRight className="h-3 w-3" />
                </span>
              </button>

              {/* Picture-in-Picture */}
              <button
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/10"
                onClick={(e) => { e.stopPropagation(); togglePiP(); setSettingsOpen(false); }}
              >
                <PictureInPicture2 className="h-4 w-4 text-white/70" />
                Picture-in-Picture
              </button>
            </>
          )}

          {/* ── Speed submenu ── */}
          {settingsTab === "speed" && (
            <>
              <button
                className="flex w-full items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs font-semibold text-white/50 hover:bg-white/10"
                onClick={() => setSettingsTab("main")}
              >
                <ArrowLeft className="h-3 w-3" />
                Playback speed
              </button>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`flex w-full items-center justify-between px-5 py-2 text-sm hover:bg-white/10 ${speed === s ? "text-primary font-medium" : ""}`}
                  onClick={() => applySpeed(s)}
                >
                  {s === 1 ? "Normal" : `${s}×`}
                  {speed === s && <span className="text-primary text-base leading-none">✓</span>}
                </button>
              ))}
            </>
          )}

          {/* ── Quality submenu ── */}
          {settingsTab === "quality" && (
            <>
              <button
                className="flex w-full items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs font-semibold text-white/50 hover:bg-white/10"
                onClick={() => setSettingsTab("main")}
              >
                <ArrowLeft className="h-3 w-3" />
                Quality
              </button>

              {/* Native resolution info */}
              {nativeHeight > 0 && (
                <div className="border-b border-white/10 px-4 py-2">
                  <p className="text-xs text-white/40">Native resolution</p>
                  <p className="text-xs font-medium text-white/80">
                    {nativeWidth} × {nativeHeight} px
                  </p>
                </div>
              )}

              {/* Auto (always selected — single-file video) */}
              <button
                className="flex w-full items-center justify-between px-5 py-2.5 text-sm text-primary font-medium hover:bg-white/10"
              >
                <span className="flex flex-col items-start">
                  <span>Auto</span>
                  {nativeHeight > 0 && (
                    <span className="text-xs text-white/40">
                      {heightToLabel(nativeHeight)}
                    </span>
                  )}
                </span>
                <span className="text-primary text-base leading-none">✓</span>
              </button>

              {/* Info note */}
              <div className="border-t border-white/10 px-4 py-2.5">
                <p className="text-xs leading-relaxed text-white/40">
                  This video is served as a single file. Quality is set by the original upload resolution.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Control bar ── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-3 pt-12 transition-opacity duration-300 ${showCtrl ? "opacity-100" : "opacity-0"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Seek bar */}
        <div className="group/seek relative mb-3 flex h-4 cursor-pointer items-center">
          {/* Track background */}
          <div className="absolute inset-x-0 h-1 rounded-full bg-white/20 transition-all group-hover/seek:h-1.5">
            {/* Buffered */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/35"
              style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }}
            />
            {/* Played */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Thumb */}
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow-md opacity-0 transition-opacity group-hover/seek:opacity-100"
            style={{ left: `${progress}%` }}
          />
          {/* Invisible range input on top */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={current}
            onChange={(e) => {
              const v = videoRef.current;
              const val = Number(e.target.value);
              if (v) v.currentTime = val;
              setCurrent(val);
            }}
            className="absolute inset-x-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-0.5">
          {/* Play/Pause */}
          <CtrlBtn onClick={(e) => { e.stopPropagation(); togglePlay(); }} label={playing ? "Pause" : "Play"}>
            {playing
              ? <Pause className="h-5 w-5 fill-current" />
              : <Play  className="h-5 w-5 fill-current" />
            }
          </CtrlBtn>

          {/* Mute */}
          <CtrlBtn onClick={(e) => { e.stopPropagation(); toggleMute(); }} label={muted ? "Unmute" : "Mute"}>
            {muted || volume === 0
              ? <VolumeX className="h-5 w-5" />
              : <Volume2 className="h-5 w-5" />
            }
          </CtrlBtn>

          {/* Volume slider */}
          <input
            type="range" min={0} max={1} step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = videoRef.current;
              const val = Number(e.target.value);
              if (v) { v.volume = val; v.muted = val === 0; }
              setVolume(val);
              setMuted(val === 0);
            }}
            className="mx-1 h-1 w-16 cursor-pointer accent-primary sm:w-20"
          />

          {/* Time */}
          <span className="ml-1 text-xs text-white/80 tabular-nums">
            {fmtTime(current)} / {fmtTime(duration)}
          </span>

          {/* Speed badge */}
          {speed !== 1 && (
            <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
              {speed}×
            </span>
          )}

          {/* Quality badge */}
          {nativeHeight > 0 && (
            <span className="ml-1 rounded border border-white/30 px-1.5 py-0.5 text-xs text-white/70">
              {nativeHeight}p
            </span>
          )}

          <div className="flex-1" />

          {/* Settings (gear) */}
          <CtrlBtn
            onClick={(e) => { e.stopPropagation(); setSettingsOpen((o) => !o); setSettingsTab("main"); }}
            label="Settings"
            active={settingsOpen}
          >
            <Gauge style={{ width: 18, height: 18 }} />
          </CtrlBtn>

          {/* PiP */}
          <CtrlBtn onClick={(e) => { e.stopPropagation(); togglePiP(); }} label="Picture-in-Picture">
            <PictureInPicture2 className="h-4 w-4" />
          </CtrlBtn>

          {/* Fullscreen */}
          <CtrlBtn onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} label={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </CtrlBtn>
        </div>
      </div>

      {/* ── Keyboard hint ── */}
      <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/50 px-2 py-1 text-xs text-white/50 opacity-0 transition-opacity group-hover:opacity-100">
        Space · K = play &nbsp;·&nbsp; F = fullscreen &nbsp;·&nbsp; M = mute &nbsp;·&nbsp; ← → = seek 5s
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WATCH PAGE
═══════════════════════════════════════════════════════════════════════════ */
async function fetchAllVideos() {
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

function Watch() {
  const { id } = Route.useParams();
  const { isAdmin } = useSessionAdmin();
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["video", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("videos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const v = data as VideoRow;
      const urls = await signPaths([v.video_path, v.thumbnail_path ?? ""]);
      return {
        ...v,
        videoUrl: urls[v.video_path],
        thumbUrl: v.thumbnail_path ? urls[v.thumbnail_path] : undefined,
      } as VideoWithThumb;
    },
  });

  const { data: allVideos } = useQuery({
    queryKey: ["videos"],
    queryFn: fetchAllVideos,
  });

  const related = allVideos?.filter((v) => v.id !== id).slice(0, 12) ?? [];

  const remove = async () => {
    if (!data || !confirm("Delete this video?")) return;
    await supabase.storage.from(BUCKET).remove([data.video_path, data.thumbnail_path ?? ""].filter(Boolean));
    const { error } = await supabase.from("videos").delete().eq("id", data.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Video deleted");
    navigate({ to: "/" });
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied!");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        {/* Back */}
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        {/* Loading */}
        {isLoading && (
          <div className="flex gap-6">
            <div className="flex-1 space-y-4">
              <div className="aspect-video animate-pulse rounded-2xl bg-muted" />
              <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          </div>
        )}

        {/* Not found */}
        {!isLoading && !data && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Play className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium text-muted-foreground">Video not found.</p>
            <Link to="/" className="text-sm text-primary hover:underline">Back to home</Link>
          </div>
        )}

        {data && (
          /* YouTube-style two-column layout */
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

            {/* ── Left: player + info ── */}
            <div className="min-w-0 flex-1">
              {/* Custom player */}
              <VideoPlayer src={data.videoUrl} poster={data.thumbUrl} />

              {/* Title */}
              <h1 className="mt-4 text-xl font-bold leading-snug sm:text-2xl">
                {data.title}
              </h1>

              {/* Meta + actions row */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(data.created_at).toLocaleDateString("en-US", {
                      year: "numeric", month: "long", day: "numeric",
                    })}
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {timeAgo(data.created_at)}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {/* Like */}
                  <button
                    onClick={() => setLiked((l) => !l)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      liked
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                    }`}
                  >
                    <ThumbsUp className={`h-4 w-4 ${liked ? "fill-primary" : ""}`} />
                    Like
                  </button>

                  {/* Share */}
                  <button
                    onClick={share}
                    className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </button>

                  {/* Delete (admin only) */}
                  {isAdmin && (
                    <button
                      onClick={remove}
                      className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Description card */}
              <div className="mt-4 rounded-xl bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">R</span>
                  Reel Channel
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Uploaded on {new Date(data.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
                {data.description && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                    {data.description}
                  </p>
                )}
              </div>
            </div>

            {/* ── Right: related videos ── */}
            <aside className="w-full shrink-0 lg:w-[360px]">
              <h2 className="mb-3 text-base font-semibold">Up next</h2>

              {related.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No other videos yet.
                </p>
              )}

              <div className="space-y-3">
                {related.map((v) => (
                  <Link
                    key={v.id}
                    to="/watch/$id"
                    params={{ id: v.id }}
                    className="group flex gap-3"
                  >
                    {/* Thumb */}
                    <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {v.thumbUrl ? (
                        <img
                          src={v.thumbUrl}
                          alt={v.title}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Play className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-5 w-5 fill-white text-white" />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                        {v.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Reel Channel</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(v.created_at)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
