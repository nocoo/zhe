/**
 * E2E Folder CRUD + Link Categorization Tests
 *
 * Tests the full folder lifecycle through server actions with the in-memory D1 mock.
 * Validates folder management from the perspective of an authenticated user:
 *   - Create, list, update, delete folders
 *   - Folder name / icon validation
 *   - Assigning links to folders
 *   - Folder deletion cascade (links get folderId nullified)
 *   - Multi-user isolation (user A cannot see/modify user B folders)
 *
 * BDD style — each scenario simulates a real user workflow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearMockStorage } from '../setup';
import type { Folder, Link } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Mocks — auth (D1 uses the global mock from setup.ts)
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_A = 'user-folder-e2e-a';
const USER_B = 'user-folder-e2e-b';

function authenticatedAs(userId: string) {
  mockAuth.mockResolvedValue({
    user: { id: userId, name: 'E2E User', email: 'e2e@test.com' },
  });
}

function unauthenticated() {
  mockAuth.mockResolvedValue(null);
}

/** Create a link for the current authenticated user via server action */
async function seedLink(url: string, folderId?: string): Promise<Link> {
  const { createLink } = await import('@/actions/links');
  const result = await createLink({ originalUrl: url, folderId });
  if (!result.success || !result.data) {
    throw new Error(`Failed to seed link: ${result.error}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Folder CRUD + Link Categorization E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockStorage();
  });

  // ============================================================
  // Scenario 1: Unauthenticated access denied
  // ============================================================
  describe('unauthenticated user', () => {
    it('cannot list folders', async () => {
      unauthenticated();
      const { getFolders } = await import('@/actions/folders');

      const result = await getFolders();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot create a folder', async () => {
      unauthenticated();
      const { createFolder } = await import('@/actions/folders');

      const result = await createFolder({ name: 'sneaky' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot update a folder', async () => {
      unauthenticated();
      const { updateFolder } = await import('@/actions/folders');

      const result = await updateFolder('some-id', { name: 'hacked' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('cannot delete a folder', async () => {
      unauthenticated();
      const { deleteFolder } = await import('@/actions/folders');

      const result = await deleteFolder('some-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  // ============================================================
  // Scenario 2: Full folder CRUD lifecycle
  // As an authenticated user: create → list → update → delete
  // ============================================================
  describe('authenticated user — folder CRUD lifecycle', () => {
    it('create → list → update name → update icon → delete', async () => {
      authenticatedAs(USER_A);
      const { createFolder, getFolders, updateFolder, deleteFolder } =
        await import('@/actions/folders');

      // Step 1: Create a folder
      const createResult = await createFolder({ name: 'Work', icon: 'briefcase' });
      expect(createResult.success).toBe(true);
      const folder = createResult.data!;
      expect(folder.name).toBe('Work');
      expect(folder.icon).toBe('briefcase');
      expect(folder.userId).toBe(USER_A);
      expect(folder.id).toBeTruthy();
      expect(folder.createdAt).toBeInstanceOf(Date);

      // Step 2: List folders — should contain the one we created
      const listResult = await getFolders();
      expect(listResult.success).toBe(true);
      expect(listResult.data).toHaveLength(1);
      expect(listResult.data![0].id).toBe(folder.id);

      // Step 3: Update name
      const nameResult = await updateFolder(folder.id, { name: 'Personal' });
      expect(nameResult.success).toBe(true);
      expect(nameResult.data!.name).toBe('Personal');
      expect(nameResult.data!.icon).toBe('briefcase'); // icon unchanged

      // Step 4: Update icon
      const iconResult = await updateFolder(folder.id, { icon: 'heart' });
      expect(iconResult.success).toBe(true);
      expect(iconResult.data!.icon).toBe('heart');
      expect(iconResult.data!.name).toBe('Personal'); // name unchanged

      // Step 5: Delete
      const deleteResult = await deleteFolder(folder.id);
      expect(deleteResult.success).toBe(true);

      // Step 6: Verify gone
      const listAfterDelete = await getFolders();
      expect(listAfterDelete.data).toHaveLength(0);
    });

    it('creates folder with default icon when none specified', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');

      const result = await createFolder({ name: 'No Icon' });
      expect(result.success).toBe(true);
      expect(result.data!.icon).toBe('folder'); // default icon
    });

    it('creates multiple folders and lists them all', async () => {
      authenticatedAs(USER_A);
      const { createFolder, getFolders } = await import('@/actions/folders');

      await createFolder({ name: 'Alpha' });
      await createFolder({ name: 'Beta' });
      await createFolder({ name: 'Gamma' });

      const list = await getFolders();
      expect(list.success).toBe(true);
      expect(list.data).toHaveLength(3);

      const names = list.data!.map((f: Folder) => f.name).sort();
      expect(names).toEqual(['Alpha', 'Beta', 'Gamma']);
    });
  });

  // ============================================================
  // Scenario 3: Folder name validation
  // ============================================================
  describe('folder name validation', () => {
    it('rejects empty name', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');

      const result = await createFolder({ name: '' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid folder name');
    });

    it('rejects whitespace-only name', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');

      const result = await createFolder({ name: '   ' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid folder name');
    });

    it('rejects name exceeding 50 characters', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');

      const longName = 'a'.repeat(51);
      const result = await createFolder({ name: longName });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid folder name');
    });

    it('accepts name at exactly 50 characters', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');

      const maxName = 'a'.repeat(50);
      const result = await createFolder({ name: maxName });
      expect(result.success).toBe(true);
      expect(result.data!.name).toBe(maxName);
    });

    it('trims whitespace from name', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');

      const result = await createFolder({ name: '  Trimmed  ' });
      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Trimmed');
    });

    it('rejects update with empty name', async () => {
      authenticatedAs(USER_A);
      const { createFolder, updateFolder } = await import('@/actions/folders');

      const folder = (await createFolder({ name: 'Valid' })).data!;

      const result = await updateFolder(folder.id, { name: '' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid folder name');
    });
  });

  // ============================================================
  // Scenario 4: Icon validation
  // ============================================================
  describe('folder icon validation', () => {
    it('rejects invalid icon on create', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');

      const result = await createFolder({ name: 'Bad Icon', icon: 'nonexistent-icon' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid icon');
    });

    it('rejects invalid icon on update', async () => {
      authenticatedAs(USER_A);
      const { createFolder, updateFolder } = await import('@/actions/folders');

      const folder = (await createFolder({ name: 'Good' })).data!;

      const result = await updateFolder(folder.id, { icon: 'nonexistent-icon' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid icon');
    });

    it('accepts all valid icons from FOLDER_ICONS list', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');
      const { FOLDER_ICONS } = await import('@/models/folders');

      // Test a few representative icons
      const testIcons = [FOLDER_ICONS[0], FOLDER_ICONS[5], FOLDER_ICONS[10]];
      for (const icon of testIcons) {
        const result = await createFolder({ name: `Folder-${icon}`, icon });
        expect(result.success).toBe(true);
        expect(result.data!.icon).toBe(icon);
      }
    });
  });

  // ============================================================
  // Scenario 5: Link categorization — assign links to folders
  // ============================================================
  describe('link categorization', () => {
    it('creates a link inside a folder', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');

      const folder = (await createFolder({ name: 'Bookmarks' })).data!;
      const link = await seedLink('https://example.com', folder.id);

      expect(link.folderId).toBe(folder.id);
    });

    it('creates a link without folder (folderId is null)', async () => {
      authenticatedAs(USER_A);

      const link = await seedLink('https://no-folder.com');

      expect(link.folderId).toBeNull();
    });

    it('moves a link to a different folder via updateLink', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');
      const { updateLink } = await import('@/actions/links');

      const folderA = (await createFolder({ name: 'Folder A' })).data!;
      const folderB = (await createFolder({ name: 'Folder B' })).data!;

      const link = await seedLink('https://moveable.com', folderA.id);
      expect(link.folderId).toBe(folderA.id);

      // Move to folder B
      const result = await updateLink(link.id, { folderId: folderB.id });
      expect(result.success).toBe(true);
      expect(result.data!.folderId).toBe(folderB.id);
    });

    it('link without folder has null folderId by default', async () => {
      authenticatedAs(USER_A);
      const { createFolder } = await import('@/actions/folders');

      // Create a folder and a link NOT in any folder
      await createFolder({ name: 'Exists But Unused' });
      const link = await seedLink('https://unfiled.com');

      expect(link.folderId).toBeNull();
    });
  });

  // ============================================================
  // Scenario 6: Cascade delete — deleting a folder nullifies links
  // ============================================================
  describe('folder deletion cascade', () => {
    it('nullifies folderId on links when folder is deleted', async () => {
      authenticatedAs(USER_A);
      const { createFolder, deleteFolder } = await import('@/actions/folders');
      const { getLinks } = await import('@/actions/links');

      // Create folder + links inside it
      const folder = (await createFolder({ name: 'Doomed' })).data!;
      await seedLink('https://link-1.com', folder.id);
      await seedLink('https://link-2.com', folder.id);
      await seedLink('https://link-3.com'); // no folder

      // Delete the folder
      const deleteResult = await deleteFolder(folder.id);
      expect(deleteResult.success).toBe(true);

      // Verify all links still exist, but folder assignment is gone
      const links = await getLinks();
      expect(links.success).toBe(true);
      expect(links.data).toHaveLength(3);

      for (const link of links.data!) {
        expect(link.folderId).toBeNull();
      }

      // Unassigned link is also still null
      const link3 = links.data!.find((l: Link) => l.originalUrl === 'https://link-3.com');
      expect(link3).toBeDefined();
      expect(link3!.folderId).toBeNull();
    });
  });

  // ============================================================
  // Scenario 7: Non-existent folder operations
  // ============================================================
  describe('non-existent folder', () => {
    it('returns error when updating a non-existent folder', async () => {
      authenticatedAs(USER_A);
      const { updateFolder } = await import('@/actions/folders');

      const result = await updateFolder('non-existent-id', { name: 'Ghost' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Folder not found or access denied');
    });

    it('returns error when deleting a non-existent folder', async () => {
      authenticatedAs(USER_A);
      const { deleteFolder } = await import('@/actions/folders');

      const result = await deleteFolder('non-existent-id');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Folder not found or access denied');
    });
  });

  // ============================================================
  // Scenario 8: Multi-user isolation
  // User A and User B should not see each other's folders.
  // ============================================================
  describe('multi-user isolation', () => {
    it('user B cannot see user A folders', async () => {
      // User A creates a folder
      authenticatedAs(USER_A);
      const { createFolder, getFolders } = await import('@/actions/folders');

      const folderA = (await createFolder({ name: 'Private A' })).data!;
      expect(folderA.userId).toBe(USER_A);

      // Switch to User B
      authenticatedAs(USER_B);

      const list = await getFolders();
      expect(list.success).toBe(true);
      expect(list.data).toHaveLength(0);
    });

    it('user B cannot update user A folder', async () => {
      authenticatedAs(USER_A);
      const { createFolder, updateFolder } = await import('@/actions/folders');

      const folderA = (await createFolder({ name: 'A Only' })).data!;

      // Switch to User B
      authenticatedAs(USER_B);

      const result = await updateFolder(folderA.id, { name: 'Hijacked' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Folder not found or access denied');
    });

    it('user B cannot delete user A folder', async () => {
      authenticatedAs(USER_A);
      const { createFolder, deleteFolder, getFolders } = await import('@/actions/folders');

      const folderA = (await createFolder({ name: 'Protected' })).data!;

      // Switch to User B — try to delete
      authenticatedAs(USER_B);
      const deleteResult = await deleteFolder(folderA.id);
      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toBe('Folder not found or access denied');

      // Switch back to User A — folder is still there
      authenticatedAs(USER_A);
      const list = await getFolders();
      expect(list.data).toHaveLength(1);
      expect(list.data![0].id).toBe(folderA.id);
    });

    it('each user manages their own folders independently', async () => {
      const { createFolder, getFolders } = await import('@/actions/folders');

      // User A creates folders
      authenticatedAs(USER_A);
      await createFolder({ name: 'A-Work' });
      await createFolder({ name: 'A-Personal' });

      // User B creates folders
      authenticatedAs(USER_B);
      await createFolder({ name: 'B-Projects' });

      // User A sees only their 2
      authenticatedAs(USER_A);
      const listA = await getFolders();
      expect(listA.data).toHaveLength(2);
      const namesA = listA.data!.map((f: Folder) => f.name).sort();
      expect(namesA).toEqual(['A-Personal', 'A-Work']);

      // User B sees only their 1
      authenticatedAs(USER_B);
      const listB = await getFolders();
      expect(listB.data).toHaveLength(1);
      expect(listB.data![0].name).toBe('B-Projects');
    });
  });

  // ============================================================
  // Scenario 9: Update with no changes
  // When updateFolder is called with empty data, it should return
  // the folder unchanged (falls back to getFolderById).
  // ============================================================
  describe('edge cases', () => {
    it('update with empty data returns folder unchanged', async () => {
      authenticatedAs(USER_A);
      const { createFolder, updateFolder } = await import('@/actions/folders');

      const folder = (await createFolder({ name: 'Static', icon: 'star' })).data!;

      const result = await updateFolder(folder.id, {});
      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Static');
      expect(result.data!.icon).toBe('star');
    });

    it('update both name and icon in a single call', async () => {
      authenticatedAs(USER_A);
      const { createFolder, updateFolder } = await import('@/actions/folders');

      const folder = (await createFolder({ name: 'Old', icon: 'folder' })).data!;

      const result = await updateFolder(folder.id, {
        name: 'New',
        icon: 'rocket',
      });
      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('New');
      expect(result.data!.icon).toBe('rocket');
    });
  });
});
