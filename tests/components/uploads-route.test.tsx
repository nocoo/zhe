import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/dashboard/upload-list', () => ({
  UploadList: () => <div>Uploads</div>,
}));

import UploadsPage from '@/app/(dashboard)/dashboard/uploads/page';

describe('UploadsPage', () => {
  it('renders UploadList component', () => {
    render(<UploadsPage />);

    expect(screen.getByText('Uploads')).toBeInTheDocument();
  });
});
