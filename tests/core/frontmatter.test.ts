import { describe, it, expect } from 'vitest';
import { buildMetadataEntries } from '../../src/core/frontmatter';

describe('buildMetadataEntries', () => {
  it('returns entries for content fields', () => {
    const e = buildMetadataEntries({ type: 'Cockpit', status: 'Evergreen' });
    expect(e).toEqual([{ key: 'type', value: 'Cockpit' }, { key: 'status', value: 'Evergreen' }]);
  });
  it('joins array values with commas', () => {
    expect(buildMetadataEntries({ tags: ['a', 'b', 'c'] })).toEqual([{ key: 'tags', value: 'a, b, c' }]);
  });
  it('drops system/internal fields', () => {
    const e = buildMetadataEntries({ 'linter-yaml-title-alias': 'x', aliases: ['Home'], position: {}, cssclasses: ['a'], type: 'Cockpit' });
    expect(e).toEqual([{ key: 'type', value: 'Cockpit' }]);
  });
  it('drops empty / null values', () => {
    expect(buildMetadataEntries({ a: '', b: null, c: [], d: 'keep' })).toEqual([{ key: 'd', value: 'keep' }]);
  });
  it('stringifies numbers and booleans', () => {
    expect(buildMetadataEntries({ wip_limit: 2, done: false })).toEqual([{ key: 'wip_limit', value: '2' }, { key: 'done', value: 'false' }]);
  });
  it('returns [] for null frontmatter', () => {
    expect(buildMetadataEntries(null)).toEqual([]);
  });
});
