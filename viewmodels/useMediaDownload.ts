"use client";

import { toast } from "@nocoo/basalt/components/toast";
import { useRef, useState } from "react";
import type { XMedia } from "@/cli/src/connector/core";

export function useMediaDownload(media: XMedia) {
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const download = async () => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    try {
      const response = await fetch(media.url);
      if (!response.ok) throw new Error("Media download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const extension = new URL(media.url, window.location.href).pathname.split(".").pop();
      anchor.href = url;
      anchor.download = `x-${media.id}.${extension && /^[a-z0-9]{1,5}$/i.test(extension) ? extension : media.type === "PHOTO" ? "jpg" : "mp4"}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("下载失败，请稍后重试");
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  return { pending, download };
}
