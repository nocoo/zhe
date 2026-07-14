import { getXrayConfig } from "@/actions/xray";
import { XrayPage } from "@/components/dashboard/xray-page";

export default async function XrayRoute() {
  const result = await getXrayConfig();
  return <XrayPage {...(result.success && result.data ? { initialData: result.data } : {})} />;
}
