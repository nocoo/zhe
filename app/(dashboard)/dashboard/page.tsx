import { getLinks } from '@/actions/links';
import { LinksList } from '@/components/dashboard/links-list';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const result = await getLinks();
  const links = result.data ?? [];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:7003';

  return <LinksList initialLinks={links} siteUrl={siteUrl} />;
}
