export type EnvironmentMode = "demo" | "e2e" | "prod";
export type LaunchIntent = "interactive" | "automation";
export const PREFERENCE_KEY = "zhe:environment-mode";
export function isEnvironmentMode(value: unknown): value is EnvironmentMode {
  return value === "demo" || value === "e2e" || value === "prod";
}
export function initialMode(
  intent: LaunchIntent,
  explicit: unknown,
  remembered: unknown,
): EnvironmentMode {
  if (intent === "automation") return "e2e";
  if (isEnvironmentMode(explicit)) return explicit;
  return isEnvironmentMode(remembered) ? remembered : "demo";
}
export function canSwitch(intent: LaunchIntent, currentId: string, requestId: string): boolean {
  return intent === "interactive" && currentId === requestId;
}
