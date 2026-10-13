export const POLLING_SCHEDULE = "idle polling: 5m; 30m during local 22:00-05:00";

export function idlePollDelay(now = new Date()): number {
  const hour = now.getHours();
  return (hour >= 22 || hour < 5 ? 30 : 5) * 60_000;
}
