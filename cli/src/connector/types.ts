export interface XJob {
  linkId: number;
  userId: string;
  postId: string;
  sourceUrl: string;
  leaseToken: string;
  leaseUntil: number;
  attempts: number;
}
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
