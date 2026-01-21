import { getLinks } from '@/actions/links';
import { LinksList } from '@/components/dashboard/links-list';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const result = await getLinks();
  const links = result.data ?? [];
  const headersList = await headers();
  const protocol = headersList.get('x-forwarded-proto') || 'http';
  const host = headersList.get('host') || 'localhost:7003';
  const siteUrl = `${protocol}://${host}`;

  return <LinksList initialLinks={links} siteUrl={siteUrl} />;
}
