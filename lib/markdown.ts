/**
 * Markdown utilities for ideas feature
 */

/**
 * Strip Markdown formatting and return plain text.
 * Used to generate excerpts for ideas.
 *
 * Handles common Markdown patterns:
 * - Headers (# ## ###)
 * - Bold/italic (**text** *text* __text__ _text_)
 * - Links [text](url) and images ![alt](url)
 * - Inline code `code` and code blocks ```code```
 * - Blockquotes (> text)
 * - Lists (- item, * item, 1. item)
 * - Horizontal rules (---, ***)
 * - HTML tags (<tag>)
 */
export function stripMarkdown(markdown: string): string {
  if (!markdown) return '';

  let text = markdown;

  // Remove code blocks (``` ... ```)
  text = text.replace(/```[\s\S]*?```/g, '');

  // Remove inline code (`code`)
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Remove links [text](url) - keep the text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove headers (# ## ### etc)
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove horizontal rules (must be exactly 3+ of same char on their own line)
  // Do this BEFORE bold/italic to avoid *** being partially consumed
  text = text.replace(/^-{3,}\s*$/gm, '');
  text = text.replace(/^\*{3,}\s*$/gm, '');

  // Remove bold/italic markers
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');

  // Remove blockquotes
  text = text.replace(/^>\s+/gm, '');

  // Remove list markers (-, *, 1.)
  text = text.replace(/^[\s]*[-*+]\s+/gm, '');
  text = text.replace(/^[\s]*\d+\.\s+/gm, '');

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Normalize whitespace: collapse multiple spaces/newlines into single space
  text = text.replace(/\s+/g, ' ');

  // Trim
  text = text.trim();

  return text;
}

/**
 * Generate an excerpt from Markdown content.
 * Strips Markdown and truncates to maxLength characters.
 *
 * @param content - Markdown content
 * @param maxLength - Maximum length of excerpt (default: 200)
 * @returns Plain text excerpt
 */
export function generateExcerpt(content: string, maxLength = 200): string {
  const plainText = stripMarkdown(content);

  if (plainText.length <= maxLength) {
    return plainText;
  }

  // Truncate at word boundary if possible
  const truncated = plainText.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace);
  }

  return truncated;
}
