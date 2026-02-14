import { getLinks } from '@/actions/links';
import { getFolders } from '@/actions/folders';
import { LinksList } from '@/components/dashboard/links-list';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [linksResult, foldersResult] = await Promise.all([
    getLinks(),
    getFolders(),
  ]);
  const links = linksResult.data ?? [];
  const folders = foldersResult.data ?? [];
  const headersList = await headers();
  const protocol = headersList.get('x-forwarded-proto') || 'http';
  const host = headersList.get('host') || 'localhost:7003';
  const siteUrl = `${protocol}://${host}`;

  return <LinksList initialLinks={links} siteUrl={siteUrl} folders={folders} />;
}
