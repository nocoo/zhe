import { describe, it, expect } from 'vitest';
import { stripMarkdown, generateExcerpt } from '@/lib/markdown';

describe('stripMarkdown', () => {
  it('should return empty string for empty input', () => {
    expect(stripMarkdown('')).toBe('');
    expect(stripMarkdown(null as unknown as string)).toBe('');
    expect(stripMarkdown(undefined as unknown as string)).toBe('');
  });

  it('should strip headers', () => {
    expect(stripMarkdown('# Header 1')).toBe('Header 1');
    expect(stripMarkdown('## Header 2')).toBe('Header 2');
    expect(stripMarkdown('### Header 3')).toBe('Header 3');
    expect(stripMarkdown('#### Header 4')).toBe('Header 4');
    expect(stripMarkdown('###### Header 6')).toBe('Header 6');
  });

  it('should strip bold markers', () => {
    expect(stripMarkdown('**bold text**')).toBe('bold text');
    expect(stripMarkdown('__also bold__')).toBe('also bold');
    expect(stripMarkdown('some **bold** in middle')).toBe('some bold in middle');
  });

  it('should strip italic markers', () => {
    expect(stripMarkdown('*italic text*')).toBe('italic text');
    expect(stripMarkdown('_also italic_')).toBe('also italic');
    expect(stripMarkdown('some *italic* in middle')).toBe('some italic in middle');
  });

  it('should strip links but keep text', () => {
    expect(stripMarkdown('[link text](https://example.com)')).toBe('link text');
    expect(stripMarkdown('Check [this link](http://foo.bar) out')).toBe('Check this link out');
  });

  it('should strip images', () => {
    expect(stripMarkdown('![alt text](image.png)')).toBe('alt text');
    expect(stripMarkdown('![](image.png)')).toBe('');
    expect(stripMarkdown('Before ![img](url) after')).toBe('Before img after');
  });

  it('should strip inline code', () => {
    expect(stripMarkdown('`inline code`')).toBe('inline code');
    expect(stripMarkdown('use `const` keyword')).toBe('use const keyword');
  });

  it('should strip code blocks', () => {
    expect(stripMarkdown('```\ncode block\n```')).toBe('');
    expect(stripMarkdown('```js\nconsole.log("hi")\n```')).toBe('');
    expect(stripMarkdown('Before\n```\ncode\n```\nAfter')).toBe('Before After');
  });

  it('should strip blockquotes', () => {
    expect(stripMarkdown('> quoted text')).toBe('quoted text');
    expect(stripMarkdown('> line 1\n> line 2')).toBe('line 1 line 2');
  });

  it('should strip list markers', () => {
    expect(stripMarkdown('- item 1\n- item 2')).toBe('item 1 item 2');
    expect(stripMarkdown('* item 1\n* item 2')).toBe('item 1 item 2');
    expect(stripMarkdown('+ item 1')).toBe('item 1');
    expect(stripMarkdown('1. first\n2. second')).toBe('first second');
  });

  it('should strip horizontal rules', () => {
    expect(stripMarkdown('---')).toBe('');
    expect(stripMarkdown('***')).toBe('');
    expect(stripMarkdown('Before\n---\nAfter')).toBe('Before After');
  });

  it('should strip HTML tags', () => {
    expect(stripMarkdown('<div>content</div>')).toBe('content');
    expect(stripMarkdown('<br/>')).toBe('');
    expect(stripMarkdown('text <em>emphasis</em> more')).toBe('text emphasis more');
  });

  it('should normalize whitespace', () => {
    expect(stripMarkdown('multiple   spaces')).toBe('multiple spaces');
    expect(stripMarkdown('line1\n\n\nline2')).toBe('line1 line2');
    expect(stripMarkdown('  leading and trailing  ')).toBe('leading and trailing');
  });

  it('should handle complex markdown', () => {
    const markdown = `# My Idea

This is a **bold** statement with *emphasis*.

## Details

- Point one
- Point two

Check [this link](https://example.com) for more.

\`\`\`js
const x = 1;
\`\`\`

> A quote

The end.`;

    const expected = 'My Idea This is a bold statement with emphasis. Details Point one Point two Check this link for more. A quote The end.';
    expect(stripMarkdown(markdown)).toBe(expected);
  });
});

describe('generateExcerpt', () => {
  it('should return full text if shorter than maxLength', () => {
    expect(generateExcerpt('short text')).toBe('short text');
    expect(generateExcerpt('short', 10)).toBe('short');
  });

  it('should strip markdown before truncating', () => {
    expect(generateExcerpt('**bold text**', 100)).toBe('bold text');
    expect(generateExcerpt('# Header', 100)).toBe('Header');
  });

  it('should truncate at word boundary when possible', () => {
    const text = 'This is a longer piece of text that needs truncation';
    const excerpt = generateExcerpt(text, 30);
    expect(excerpt.length).toBeLessThanOrEqual(30);
    expect(excerpt).not.toMatch(/\s$/); // No trailing space
    expect(text.startsWith(excerpt)).toBe(true);
  });

  it('should respect maxLength parameter', () => {
    const longText = 'a'.repeat(300);
    const excerpt = generateExcerpt(longText, 200);
    expect(excerpt.length).toBeLessThanOrEqual(200);
  });

  it('should use default maxLength of 200', () => {
    const longText = 'word '.repeat(100); // 500 chars
    const excerpt = generateExcerpt(longText);
    expect(excerpt.length).toBeLessThanOrEqual(200);
  });

  it('should handle markdown with resulting text shorter than maxLength', () => {
    const markdown = '```js\ncode\n```\n\nShort text';
    expect(generateExcerpt(markdown, 200)).toBe('Short text');
  });
});
