import { describe, it, expect } from 'vitest';
import {
  buildFilename,
  sanitizeFilename,
  hasVersionPlaceholder,
  DEFAULT_FILENAME_TEMPLATE,
} from '../../src/core/filename';

const V = { title: 'Mein Bericht', date: '2026-07-16', time: '1435', folder: 'Projekte', version: 1 };

describe('sanitizeFilename', () => {
  it('replaces OS-illegal characters with an underscore', () => {
    expect(sanitizeFilename('a/b:c?')).toBe('a_b_c_');
  });
  it('also replaces Obsidian-specific characters', () => {
    expect(sanitizeFilename('a#b^c[d]e')).toBe('a_b_c_d_e');
  });
  it('collapses whitespace and trims', () => {
    expect(sanitizeFilename('  a   b  ')).toBe('a b');
  });
  it('returns an empty string for empty input', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});

describe('hasVersionPlaceholder', () => {
  // Load-bearing: without this guard the search loop in output.ts would rebuild the same
  // name forever when the template has no {version}.
  it('detects the version placeholder', () => {
    expect(hasVersionPlaceholder('{title} v{version}')).toBe(true);
  });
  it('is false without it', () => {
    expect(hasVersionPlaceholder('{title} {date}')).toBe(false);
  });
  it('does not match a similarly named placeholder', () => {
    expect(hasVersionPlaceholder('{versionx}')).toBe(false);
  });
});

describe('buildFilename', () => {
  it('resolves every placeholder', () => {
    expect(buildFilename('{title} {date} {time} {folder} v{version}', V))
      .toBe('Mein Bericht 2026-07-16 1435 Projekte v1');
  });
  it('defaults to the note title alone', () => {
    expect(buildFilename(DEFAULT_FILENAME_TEMPLATE, V)).toBe('Mein Bericht');
  });
  it('leaves an unknown placeholder literal so the typo stays visible', () => {
    expect(buildFilename('{title} {foo}', V)).toBe('Mein Bericht {foo}');
  });
  it('sanitizes the resolved result', () => {
    expect(buildFilename('{title}', { ...V, title: 'A/B' })).toBe('A_B');
  });
  it('collapses the gap left by an empty folder (note in vault root)', () => {
    expect(buildFilename('{title} {folder}', { ...V, folder: '' })).toBe('Mein Bericht');
  });
  it('falls back to the title for an empty template', () => {
    expect(buildFilename('', V)).toBe('Mein Bericht');
  });
  it('falls back to Dokument when template and title are both empty', () => {
    expect(buildFilename('', { ...V, title: '' })).toBe('Dokument');
  });
});
