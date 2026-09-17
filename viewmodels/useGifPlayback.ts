"use client";

import { useEffect, useRef } from "react";

/** Load GIF bytes only when visible, and stop animation in hidden cards/tabs. */
export function useGifPlayback(url: string | null, failed: boolean) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!url || !video || failed) return;
    let visible = false;
    const update = () => {
      if (visible && document.visibilityState === "visible") {
        if (!video.getAttribute("src")) video.src = url;
        void video.play().catch(() => {});
      } else video.pause();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        update();
      },
      { threshold: 0.01 },
    );
    observer.observe(video);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      video.pause();
    };
  }, [url, failed]);
  return ref;
}
