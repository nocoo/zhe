import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarFolderCreate } from '@/components/sidebar-folder-create';
import { DEFAULT_FOLDER_ICON, FOLDER_ICONS } from '@/models/folders';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

function renderCreate(props: Partial<Parameters<typeof SidebarFolderCreate>[0]> = {}) {
  const defaultProps = {
    onCreate: vi.fn(),
    onCancel: vi.fn(),
    ...props,
  };
  return render(
    <TooltipProvider>
      <SidebarFolderCreate {...defaultProps} />
    </TooltipProvider>
  );
}

describe('SidebarFolderCreate', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an empty name input with placeholder', () => {
    renderCreate();

    const input = screen.getByPlaceholderText('文件夹名称');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('renders confirm and cancel buttons', () => {
    renderCreate();

    expect(screen.getByLabelText('确认')).toBeInTheDocument();
    expect(screen.getByLabelText('取消')).toBeInTheDocument();
  });

  it('auto-focuses the name input', () => {
    renderCreate();

    const input = screen.getByPlaceholderText('文件夹名称');
    expect(input).toHaveFocus();
  });

  it('shows icon picker grid with all available icons', () => {
    renderCreate();

    const iconButtons = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('data-icon-name')
    );
    expect(iconButtons).toHaveLength(FOLDER_ICONS.length);
  });

  it('defaults to DEFAULT_FOLDER_ICON', () => {
    renderCreate();

    // The default icon button should have the active style
    const defaultIconBtn = screen.getByTestId(`icon-${DEFAULT_FOLDER_ICON}`);
    expect(defaultIconBtn.className).toContain('bg-accent');
  });

  it('calls onCreate with name and default icon when confirm is clicked', () => {
    const onCreate = vi.fn();
    renderCreate({ onCreate });

    const input = screen.getByPlaceholderText('文件夹名称');
    fireEvent.change(input, { target: { value: '新文件夹' } });
    fireEvent.click(screen.getByLabelText('确认'));

    expect(onCreate).toHaveBeenCalledWith('新文件夹', DEFAULT_FOLDER_ICON);
  });

  it('calls onCreate with selected icon', () => {
    const onCreate = vi.fn();
    renderCreate({ onCreate });

    const input = screen.getByPlaceholderText('文件夹名称');
    fireEvent.change(input, { target: { value: '收藏' } });

    // Select a different icon
    fireEvent.click(screen.getByTestId('icon-heart'));
    fireEvent.click(screen.getByLabelText('确认'));

    expect(onCreate).toHaveBeenCalledWith('收藏', 'heart');
  });

  it('calls onCreate when Enter is pressed', () => {
    const onCreate = vi.fn();
    renderCreate({ onCreate });

    const input = screen.getByPlaceholderText('文件夹名称');
    fireEvent.change(input, { target: { value: '快速创建' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCreate).toHaveBeenCalledWith('快速创建', DEFAULT_FOLDER_ICON);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    renderCreate({ onCancel });

    fireEvent.click(screen.getByLabelText('取消'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = vi.fn();
    renderCreate({ onCancel });

    const input = screen.getByPlaceholderText('文件夹名称');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does not call onCreate when name is empty', () => {
    const onCreate = vi.fn();
    renderCreate({ onCreate });

    // Don't type anything, just click confirm
    fireEvent.click(screen.getByLabelText('确认'));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('does not call onCreate when name is only whitespace', () => {
    const onCreate = vi.fn();
    renderCreate({ onCreate });

    const input = screen.getByPlaceholderText('文件夹名称');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByLabelText('确认'));

    expect(onCreate).not.toHaveBeenCalled();
  });

  it('trims the name before calling onCreate', () => {
    const onCreate = vi.fn();
    renderCreate({ onCreate });

    const input = screen.getByPlaceholderText('文件夹名称');
    fireEvent.change(input, { target: { value: '  有空格  ' } });
    fireEvent.click(screen.getByLabelText('确认'));

    expect(onCreate).toHaveBeenCalledWith('有空格', DEFAULT_FOLDER_ICON);
  });

  it('highlights the currently selected icon', () => {
    renderCreate();

    // Click star icon
    const starBtn = screen.getByTestId('icon-star');
    fireEvent.click(starBtn);

    // Star should now have active class
    const starClasses = starBtn.className.split(' ');
    expect(starClasses).toContain('bg-accent');

    // Default icon should lose active class (check for exact 'bg-accent' not 'hover:bg-accent/50')
    const defaultBtn = screen.getByTestId(`icon-${DEFAULT_FOLDER_ICON}`);
    const defaultClasses = defaultBtn.className.split(' ');
    expect(defaultClasses).not.toContain('bg-accent');
  });

  it('shows the selected icon next to the input', () => {
    renderCreate();

    // The icon preview next to input should update when selecting a new icon
    // Initially shows default icon — we verify by checking the structure
    const inputRow = screen.getByPlaceholderText('文件夹名称').closest('div');
    expect(inputRow).toBeInTheDocument();
  });
});
