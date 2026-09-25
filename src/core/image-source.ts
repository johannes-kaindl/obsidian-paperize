// Pure Weichen fuer das Laden von Bildquellen im Export (kein Obsidian-Import).

export type ImageSourceKind = 'remote' | 'direct' | 'vault';

/** remote = http(s), muss ueber requestUrl geholt werden (Canvas-Taint/CORS);
 *  direct = app:/data:/blob:, direkt ladbar; vault = Pfad, per metadataCache aufzuloesen. */
export function imageSourceKind(src: string): ImageSourceKind {
  if (/^https?:/i.test(src)) return 'remote';
  if (/^(data:|app:|blob:)/i.test(src)) return 'direct';
  return 'vault';
}

/** Ein haengendes Laden darf den Export nicht blockieren: nach ms wird null geliefert. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    p.then(
      (v) => { window.clearTimeout(timer); resolve(v); },
      (e: unknown) => { window.clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

/** MIME-Typ fuer einen Blob: Header zuerst, sonst Magic Bytes. */
export function mimeForBytes(header: string, bytes: Uint8Array): string {
  const h = (header || '').split(';')[0].trim().toLowerCase();
  if (h.startsWith('image/')) return h;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  return 'application/octet-stream';
}
