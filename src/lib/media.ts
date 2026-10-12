import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "media";
const EXPIRY = 60 * 60 * 6; // 6 hours

export type VideoRow = {
  id: string;
  title: string;
  description: string | null;
  video_path: string;
  thumbnail_path: string | null;
  created_at: string;
};

export async function signPaths(paths: string[]): Promise<Record<string, string>> {
  const clean = paths.filter(Boolean);
  if (!clean.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(clean, EXPIRY);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  return map;
}

export function useSessionAdmin() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async (s: Session | null) => {
      setSession(s);
      if (!s) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      const { data } = await supabase.rpc("has_role", { _user_id: s.user.id, _role: "admin" });
      setIsAdmin(Boolean(data));
      setLoading(false);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => check(s), 0);
    });
    supabase.auth.getSession().then(({ data }) => check(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, isAdmin, loading };
}

export function captureThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    const done = (b: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve(b);
    };
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 2) / 3);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      const w = 640;
      const ratio = video.videoHeight / video.videoWidth || 9 / 16;
      canvas.width = w;
      canvas.height = Math.round(w * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return done(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => done(b), "image/jpeg", 0.8);
    };
    video.onerror = () => done(null);
    setTimeout(() => done(null), 15000);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   FAST CHUNKED UPLOADER
   - Splits file into chunks and uploads up to PARALLEL_CHUNKS at a time
   - Reports byte-level progress for accurate speed / ETA display
   - Falls back to single upload for small files (< CHUNK_SIZE)
═══════════════════════════════════════════════════════════════════════════ */

const CHUNK_SIZE   = 6 * 1024 * 1024;  // 6 MB per chunk
const PARALLEL     = 3;                 // concurrent chunk uploads

export type UploadProgressCallback = (info: {
  percent: number;       // 0–100
  uploadedBytes: number;
  totalBytes: number;
  speedBps: number;      // bytes per second
  etaSeconds: number;
}) => void;

/**
 * Upload a file to Supabase Storage using parallel chunked uploads.
 * For files smaller than CHUNK_SIZE a single upload is used instead.
 */
export async function uploadFile(
  path: string,
  file: File,
  contentType: string,
  onProgress: UploadProgressCallback,
): Promise<void> {
  const totalBytes = file.size;

  /* ── Small file: single upload with XHR progress ── */
  if (totalBytes <= CHUNK_SIZE) {
    await xhrUpload(path, file, contentType, (loaded) => {
      onProgress({
        percent: Math.round((loaded / totalBytes) * 100),
        uploadedBytes: loaded,
        totalBytes,
        speedBps: 0,
        etaSeconds: 0,
      });
    });
    return;
  }

  /* ── Large file: chunked parallel upload ── */
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
  const uploaded    = new Array<number>(totalChunks).fill(0); // bytes uploaded per chunk
  const startTime   = Date.now();

  const getProgress = () => {
    const uploadedBytes = uploaded.reduce((a, b) => a + b, 0);
    const percent       = Math.round((uploadedBytes / totalBytes) * 100);
    const elapsed       = (Date.now() - startTime) / 1000;
    const speedBps      = elapsed > 0 ? uploadedBytes / elapsed : 0;
    const remaining     = totalBytes - uploadedBytes;
    const etaSeconds    = speedBps > 0 ? remaining / speedBps : 0;
    return { percent, uploadedBytes, totalBytes, speedBps, etaSeconds };
  };

  /* Upload chunks in batches of PARALLEL */
  for (let batch = 0; batch < totalChunks; batch += PARALLEL) {
    const batchIndices = Array.from(
      { length: Math.min(PARALLEL, totalChunks - batch) },
      (_, i) => batch + i,
    );

    await Promise.all(
      batchIndices.map(async (chunkIndex) => {
        const start = chunkIndex * CHUNK_SIZE;
        const end   = Math.min(start + CHUNK_SIZE, totalBytes);
        const chunk = file.slice(start, end);
        const chunkPath = `${path}.part${chunkIndex}`;

        await xhrUpload(chunkPath, chunk, contentType, (loaded) => {
          uploaded[chunkIndex] = loaded;
          onProgress(getProgress());
        });

        uploaded[chunkIndex] = end - start; // mark complete
        onProgress(getProgress());
      }),
    );
  }

  /* ── Reassemble: download all chunks and re-upload as one file ── */
  onProgress({ percent: 95, uploadedBytes: totalBytes, totalBytes, speedBps: 0, etaSeconds: 1 });

  const chunkPaths = Array.from({ length: totalChunks }, (_, i) => `${path}.part${i}`);

  /* Sign chunk URLs */
  const signedMap = await signPaths(chunkPaths);

  const chunkBuffers = await Promise.all(
    chunkPaths.map(async (cp) => {
      const url = signedMap[cp];
      if (!url) throw new Error(`Missing signed URL for chunk ${cp}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch chunk ${cp}`);
      return res.arrayBuffer();
    }),
  );

  const assembled = new Blob(chunkBuffers, { type: contentType });

  /* Upload assembled file */
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, assembled, { contentType, upsert: true });
  if (error) throw error;

  /* Clean up chunk files */
  await supabase.storage.from(BUCKET).remove(chunkPaths);

  onProgress({ percent: 100, uploadedBytes: totalBytes, totalBytes, speedBps: 0, etaSeconds: 0 });
}

/** XHR-based single upload with per-byte progress */
function xhrUpload(
  path: string,
  data: Blob,
  contentType: string,
  onLoaded: (bytes: number) => void,
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    /* Get a signed upload URL */
    const { data: signData, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (signError || !signData) {
      /* Fall back to supabase client upload if signed URL fails */
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, data, { contentType, upsert: true });
      if (error) reject(error);
      else { onLoaded(data.size); resolve(); }
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signData.signedUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onLoaded(e.loaded);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 10 * 60 * 1000; // 10 min timeout per chunk

    xhr.send(data);
  });
}
