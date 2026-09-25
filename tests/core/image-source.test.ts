// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { imageSourceKind, withTimeout, mimeForBytes } from '../../src/core/image-source';

describe('imageSourceKind — Weiche fuer decodeImage', () => {
  it('erkennt entfernte Quellen (http/https, gross/klein)', () => {
    expect(imageSourceKind('https://example.com/a.png')).toBe('remote');
    expect(imageSourceKind('http://example.com/a.png')).toBe('remote');
    expect(imageSourceKind('HTTPS://example.com/a.png')).toBe('remote');
  });
  it('app:, data:, blob: bleiben lokal ladbar', () => {
    expect(imageSourceKind('app://abc/x.png')).toBe('direct');
    expect(imageSourceKind('data:image/png;base64,AAAA')).toBe('direct');
    expect(imageSourceKind('blob:app://x')).toBe('direct');
  });
  it('alles andere ist ein Vault-Pfad', () => {
    expect(imageSourceKind('assets/probe.png')).toBe('vault');
    expect(imageSourceKind('./probe.png')).toBe('vault');
    expect(imageSourceKind('Anh%C3%A4nge/x%20y.png')).toBe('vault');
  });
});

describe('mimeForBytes', () => {
  it('bevorzugt den Header, faellt auf Magic Bytes zurueck', () => {
    expect(mimeForBytes('image/svg+xml; charset=utf-8', new Uint8Array([0]))).toBe('image/svg+xml');
    expect(mimeForBytes('', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
    expect(mimeForBytes('application/octet-stream', new Uint8Array([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(mimeForBytes('', new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe('image/gif');
    expect(mimeForBytes('', new Uint8Array([1, 2, 3]))).toBe('application/octet-stream');
  });
});

describe('withTimeout', () => {
  it('liefert das Ergebnis, wenn es rechtzeitig kommt', async () => {
    expect(await withTimeout(Promise.resolve(7), 50)).toBe(7);
  });
  it('liefert null, wenn es haengt', async () => {
    expect(await withTimeout(new Promise<number>(() => {}), 20)).toBeNull();
  });
  it('reicht Fehler weiter', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 50)).rejects.toThrow('x');
  });
});
