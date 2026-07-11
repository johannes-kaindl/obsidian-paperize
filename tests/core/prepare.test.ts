// tests/core/prepare.test.ts
import { describe, it, expect } from 'vitest';
import { stripFrontmatter, deriveTitle } from '../../src/core/prepare';

describe('stripFrontmatter', () => {
  it('removes a leading frontmatter block', () => {
    expect(stripFrontmatter('---\na: 1\n---\nHallo')).toBe('Hallo');
  });
  it('leaves body without frontmatter untouched', () => {
    expect(stripFrontmatter('# Titel\ntext')).toBe('# Titel\ntext');
  });
  it('strips an empty frontmatter block', () => {
    expect(stripFrontmatter('---\n---\nHallo')).toBe('Hallo');
  });
});

describe('deriveTitle', () => {
  it('takes the first H1', () => {
    expect(deriveTitle('# Mein Titel\nrest', 'Datei')).toBe('Mein Titel');
  });
  it('falls back to the note name when no leading H1', () => {
    expect(deriveTitle('Absatz zuerst\n# Später', 'Datei')).toBe('Datei');
  });
});
