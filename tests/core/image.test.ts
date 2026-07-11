import { describe, it, expect } from 'vitest';
import { imageToJpeg } from '../../src/core/image';

describe('imageToJpeg', () => {
  it('returns null for empty input', async () => {
    expect(await imageToJpeg('')).toBeNull();
  });
});
