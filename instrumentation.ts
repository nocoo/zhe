export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ZHE_LOCAL_AUTH_TOKEN) {
    const { installProviderFixtures } = await import("./scripts/lib/provider-fixtures");
    installProviderFixtures();
  }
}
