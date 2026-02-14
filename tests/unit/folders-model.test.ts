import { describe, it, expect } from 'vitest';
import {
  FOLDER_ICONS,
  isValidFolderIcon,
  validateFolderName,
  DEFAULT_FOLDER_ICON,
} from '@/models/folders';

describe('models/folders', () => {
  describe('FOLDER_ICONS', () => {
    it('is a non-empty array of icon names', () => {
      expect(FOLDER_ICONS.length).toBeGreaterThan(0);
      expect(FOLDER_ICONS).toContain('folder');
    });

    it('contains only lowercase kebab-case strings', () => {
      for (const icon of FOLDER_ICONS) {
        expect(icon).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    });
  });

  describe('DEFAULT_FOLDER_ICON', () => {
    it('is "folder"', () => {
      expect(DEFAULT_FOLDER_ICON).toBe('folder');
    });
  });

  describe('isValidFolderIcon', () => {
    it('returns true for valid icons', () => {
      expect(isValidFolderIcon('folder')).toBe(true);
      expect(isValidFolderIcon('star')).toBe(true);
      expect(isValidFolderIcon('heart')).toBe(true);
    });

    it('returns false for unknown icons', () => {
      expect(isValidFolderIcon('unknown-icon-xyz')).toBe(false);
      expect(isValidFolderIcon('')).toBe(false);
    });
  });

  describe('validateFolderName', () => {
    it('returns trimmed name for valid input', () => {
      expect(validateFolderName('My Folder')).toBe('My Folder');
      expect(validateFolderName('  spaced  ')).toBe('spaced');
    });

    it('returns null for empty or whitespace-only input', () => {
      expect(validateFolderName('')).toBeNull();
      expect(validateFolderName('   ')).toBeNull();
    });

    it('returns null for names exceeding 50 characters', () => {
      const longName = 'a'.repeat(51);
      expect(validateFolderName(longName)).toBeNull();
    });

    it('accepts names exactly 50 characters', () => {
      const name = 'a'.repeat(50);
      expect(validateFolderName(name)).toBe(name);
    });
  });
});
