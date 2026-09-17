export interface XJob {
  source?: "x";
  linkId: number;
  userId: string;
  postId: string;
  sourceUrl: string;
  leaseToken: string;
  leaseUntil: number;
  attempts: number;
}
export interface GitHubJob {
  source: "github";
  linkId: number;
  userId: string;
  fullName: string;
  sourceUrl: string;
  leaseToken: string;
  leaseUntil: number;
  attempts: number;
}
export interface ScreenshotJob {
  source: "screenshot";
  linkId: number;
  userId: string;
  sourceUrl: string;
  leaseToken: string;
  leaseUntil: number;
  attempts: number;
}
export type ConnectorJob = XJob | GitHubJob | ScreenshotJob;
export interface MediaReservation {
  id: string;
  key: string;
  uploaded: boolean;
  skipped?: false;
}
export interface DownloadedMedia {
  path: string;
  size: number;
  sha256: string;
  mime: string;
  width?: number | undefined;
  height?: number | undefined;
  duration?: number | undefined;
}

export interface ConnectorStatus {
  states: { state: string; count: number }[];
  keyPrefix: string;
  expiresAt: number | null;
}

export interface ConnectorProgress {
  stage:
    | "claim"
    | "read"
    | "capture"
    | "download"
    | "verify"
    | "upload"
    | "uploaded"
    | "poster"
    | "saved"
    | "skipped"
    | "warning"
    | "publish";
  message: string;
  current?: number;
  total?: number;
  received?: number;
  bytes?: number;
}

export type ReportProgress = (event: ConnectorProgress) => void;
