import { describe, it, expect } from 'vitest';
import {
  TAG_COLORS,
  TAG_COLOR_MAP,
  isValidTagColor,
  randomTagColor,
  tagColorFromName,
  validateTagName,
  getTagColorClasses,
  getTagColorClassesByName,
} from '@/models/tags';

describe('models/tags', () => {
  describe('TAG_COLORS', () => {
    it('contains 12 predefined colors', () => {
      expect(TAG_COLORS).toHaveLength(12);
    });

    it('includes expected color names', () => {
      expect(TAG_COLORS).toContain('red');
      expect(TAG_COLORS).toContain('blue');
      expect(TAG_COLORS).toContain('emerald');
      expect(TAG_COLORS).toContain('slate');
    });

    it('contains only lowercase alphabetic strings', () => {
      for (const color of TAG_COLORS) {
        expect(color).toMatch(/^[a-z]+$/);
      }
    });
  });

  describe('isValidTagColor', () => {
    it('returns true for valid colors', () => {
      expect(isValidTagColor('red')).toBe(true);
      expect(isValidTagColor('blue')).toBe(true);
      expect(isValidTagColor('emerald')).toBe(true);
    });

    it('returns false for unknown colors', () => {
      expect(isValidTagColor('purple')).toBe(false);
      expect(isValidTagColor('green')).toBe(false);
      expect(isValidTagColor('')).toBe(false);
      expect(isValidTagColor('#ff0000')).toBe(false);
    });
  });

  describe('randomTagColor', () => {
    it('returns a valid tag color', () => {
      const color = randomTagColor();
      expect(isValidTagColor(color)).toBe(true);
    });

    it('returns colors from the TAG_COLORS array', () => {
      // Run multiple times to increase confidence
      for (let i = 0; i < 20; i++) {
        expect(TAG_COLORS).toContain(randomTagColor());
      }
    });
  });

  describe('tagColorFromName', () => {
    it('returns a valid tag color', () => {
      expect(isValidTagColor(tagColorFromName('work'))).toBe(true);
      expect(isValidTagColor(tagColorFromName('personal'))).toBe(true);
    });

    it('is deterministic — same name always gives same color', () => {
      const color1 = tagColorFromName('work');
      const color2 = tagColorFromName('work');
      const color3 = tagColorFromName('work');
      expect(color1).toBe(color2);
      expect(color2).toBe(color3);
    });

    it('handles Chinese characters', () => {
      const color = tagColorFromName('工作');
      expect(isValidTagColor(color)).toBe(true);
      expect(tagColorFromName('工作')).toBe(color);
    });

    it('handles emoji', () => {
      const color = tagColorFromName('🚀 launch');
      expect(isValidTagColor(color)).toBe(true);
    });

    it('different names can produce different colors', () => {
      // Not guaranteed for any two specific names, but across many
      // names we should see at least 2 distinct colors
      const colors = new Set(
        ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']
          .map(tagColorFromName),
      );
      expect(colors.size).toBeGreaterThan(1);
    });

    it('handles single-char names', () => {
      expect(isValidTagColor(tagColorFromName('a'))).toBe(true);
      expect(isValidTagColor(tagColorFromName('Z'))).toBe(true);
    });
  });

  describe('validateTagName', () => {
    it('returns trimmed name for valid input', () => {
      expect(validateTagName('work')).toBe('work');
      expect(validateTagName('  spaced  ')).toBe('spaced');
    });

    it('returns null for empty or whitespace-only input', () => {
      expect(validateTagName('')).toBeNull();
      expect(validateTagName('   ')).toBeNull();
    });

    it('returns null for names exceeding 30 characters', () => {
      const longName = 'a'.repeat(31);
      expect(validateTagName(longName)).toBeNull();
    });

    it('accepts names exactly 30 characters', () => {
      const name = 'a'.repeat(30);
      expect(validateTagName(name)).toBe(name);
    });

    it('preserves unicode characters', () => {
      expect(validateTagName('工作')).toBe('工作');
      expect(validateTagName('プロジェクト')).toBe('プロジェクト');
    });
  });

  describe('TAG_COLOR_MAP', () => {
    it('has an entry for every TAG_COLORS value', () => {
      for (const color of TAG_COLORS) {
        expect(TAG_COLOR_MAP[color]).toBeDefined();
        expect(TAG_COLOR_MAP[color].badge).toBeTruthy();
        expect(TAG_COLOR_MAP[color].dot).toBeTruthy();
      }
    });

    it('badge classes contain bg- and text- prefixes', () => {
      for (const color of TAG_COLORS) {
        expect(TAG_COLOR_MAP[color].badge).toMatch(/bg-/);
        expect(TAG_COLOR_MAP[color].badge).toMatch(/text-/);
      }
    });

    it('dot classes are bg-{color}-500', () => {
      expect(TAG_COLOR_MAP.red.dot).toBe('bg-red-500');
      expect(TAG_COLOR_MAP.blue.dot).toBe('bg-blue-500');
    });
  });

  describe('getTagColorClasses', () => {
    it('returns correct classes for valid colors', () => {
      expect(getTagColorClasses('red')).toBe(TAG_COLOR_MAP.red);
      expect(getTagColorClasses('blue')).toBe(TAG_COLOR_MAP.blue);
    });

    it('falls back to slate for unknown colors', () => {
      expect(getTagColorClasses('purple')).toBe(TAG_COLOR_MAP.slate);
      expect(getTagColorClasses('')).toBe(TAG_COLOR_MAP.slate);
      expect(getTagColorClasses('invalid')).toBe(TAG_COLOR_MAP.slate);
    });
  });

  describe('getTagColorClassesByName', () => {
    it('returns valid color classes for any name', () => {
      const classes = getTagColorClassesByName('work');
      expect(classes.badge).toMatch(/bg-/);
      expect(classes.badge).toMatch(/text-/);
      expect(classes.dot).toMatch(/bg-.*-500/);
    });

    it('returns same classes for same name', () => {
      expect(getTagColorClassesByName('test')).toBe(getTagColorClassesByName('test'));
    });

    it('handles Chinese tag names', () => {
      const classes = getTagColorClassesByName('工作');
      expect(classes.badge).toBeTruthy();
      expect(classes.dot).toBeTruthy();
    });
  });
});
