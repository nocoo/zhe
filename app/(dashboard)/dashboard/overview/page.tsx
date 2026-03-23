import { OverviewPage } from '@/components/dashboard/overview-page';
import { getOverviewStats } from '@/actions/overview';

export default async function OverviewRoute() {
  const result = await getOverviewStats();
  return <OverviewPage {...(result.success && result.data ? { initialData: result.data } : {})} />;
}
