import { getUploads } from '@/actions/upload';
import { UploadList } from '@/components/dashboard/upload-list';

export const dynamic = 'force-dynamic';

export default async function UploadsPage() {
  const result = await getUploads();
  const uploads = result.data ?? [];

  return <UploadList initialUploads={uploads} />;
}
