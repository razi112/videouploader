import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "media";
const EXPIRY = 60 * 60 * 6; // 6 hours

export type VideoRow = {
  id: string;
  title: string;
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
