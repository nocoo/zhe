import {
  ConnectorError,
  mediaUrl,
  videoFileSize,
  videoResolution,
  type XMedia,
  type XVideoAttempt,
  type XVideoVariant,
} from "./core.js";
import { downloadMedia, MediaTooLargeError } from "./download.js";
import type { DownloadedMedia, ReportProgress } from "./types.js";

export class VideoArchiveError extends ConnectorError {
  constructor(
    code: string,
    public attempts: XVideoAttempt[],
  ) {
    super(code);
  }
}

/** Keep the best available source, then 1080p and 720p. Never fall below 720p
 * after rejecting a larger source; originally smaller videos remain supported. */
export function videoCandidates(media: XMedia): XVideoVariant[] {
  const dimensions = /\/(\d+)x(\d+)\//.exec(media.url);
  const choices = (
    media.variants?.length
      ? media.variants
      : [
          {
            url: media.url,
            width: Number(dimensions?.[1]) || media.width || 0,
            height: Number(dimensions?.[2]) || media.height || 0,
            bitrate: 0,
          },
        ]
  )
    .filter((v) => mediaUrl(v.url, media.id, "video") && v.width > 0 && v.height > 0)
    .sort(
      (a, b) => Math.min(b.width, b.height) - Math.min(a.width, a.height) || b.bitrate - a.bitrate,
    );
  const top = choices[0];
  if (!top) return [];
  if (Math.min(top.width, top.height) < 720) return [top];
  const candidates = [2160, 1080, 720].flatMap((limit) => {
    const candidate = choices.find(
      (v) => Math.min(v.width, v.height) <= limit && Math.min(v.width, v.height) >= 720,
    );
    return candidate ? [candidate] : [];
  });
  return candidates.filter(
    (candidate, index) => candidates.findIndex((v) => v.url === candidate.url) === index,
  );
}

export async function downloadVideo(
  media: XMedia,
  directory: string,
  signal?: AbortSignal,
  onProgress?: Parameters<typeof downloadMedia>[3],
  report?: ReportProgress,
): Promise<DownloadedMedia> {
  const attempts: XVideoAttempt[] = [];
  const candidates = videoCandidates(media);
  if (!candidates.length) throw new VideoArchiveError("video_variant_unavailable", attempts);
  for (const candidate of candidates) {
    signal?.throwIfAborted();
    const label = videoResolution(candidate.width, candidate.height);
    report?.({ stage: "download", message: `Checking ${label}` });
    let observedSize = 0;
    try {
      const file = await downloadMedia(
        { ...media, ...candidate },
        directory,
        signal,
        (phase, received, total) => {
          observedSize = total;
          if (phase === "download" && received === 0)
            report?.({
              stage: "download",
              message: `Selected ${label} · ${videoFileSize(total)}`,
              bytes: total,
            });
          onProgress?.(phase, received, total);
        },
      );
      attempts.push({ width: candidate.width, height: candidate.height, size: file.size });
      return { ...file, sourceUrl: candidate.url, videoAttempts: attempts };
    } catch (error) {
      if (error instanceof MediaTooLargeError) {
        attempts.push({ width: candidate.width, height: candidate.height, size: error.size });
        report?.({
          stage: "warning",
          message: `${label} · ${videoFileSize(error.size)} exceeds 100 MB`,
        });
        continue;
      }
      if (observedSize)
        attempts.push({ width: candidate.width, height: candidate.height, size: observedSize });
      throw new VideoArchiveError(
        error instanceof ConnectorError ? error.code : "download_failed",
        attempts,
      );
    }
  }
  throw new VideoArchiveError("media_too_large", attempts);
}
