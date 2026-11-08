// vendored from obsidian-kit@0.81.0, src/obsidian/print-to-pdf.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import { Platform } from "obsidian";
import { withTimeout } from "../kit/timeout";
import { realClock } from "./clock";

/**
 * Druckt ein eigenständiges HTML-Dokument über ein unsichtbares `<webview>` als PDF
 * (Desktop-Export, Chromium-Druck mit `@page`, Randboxen und getaggtem PDF).
 *
 * Vertrag: `printHtmlToPdf(doc, html, options) → Promise<Uint8Array>`. Scheitern ist immer ein
 * `PrintToPdfError` mit Art (`unavailable`, `timeout`, `aborted`, `empty`, `failed`); das
 * Element wird in jedem Fall entfernt. Keine Host-Bibliothek, kein dynamisches Laden: `<webview>`
 * ist hier nur ein DOM-Element, dessen Methoden (`executeJavaScript`, `printToPDF`) der
 * Renderer bereitstellt.
 *
 * @example
 * const pdf = await printHtmlToPdf(activeDocument, html, { pageSize: "A4", printBackground: true });
 */
export type PrintToPdfErrorKind = "unavailable" | "timeout" | "aborted" | "empty" | "failed";

export class PrintToPdfError extends Error {
  constructor(readonly kind: PrintToPdfErrorKind, message: string) {
    super(message);
    this.name = "PrintToPdfError";
  }
}

export interface PrintToPdfOptions {
  pageSize: "A4" | "Letter";
  printBackground: boolean;
  /** Gesamtgrenze in Millisekunden (Vorgabe 60 000). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Ein PDF unter dieser Größe ist eine leere Seite (gemessen: Kopf und Katalog ohne Inhalt). */
export const EMPTY_PDF_MAX_BYTES = 4096;

const DOM_READY_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 60_000;

/** Verbraucher kopiert die Konstante wortgleich in seine `styles.css`. */
export const PRINT_TO_PDF_CSS: string = `
.okit-print-host { position: fixed; left: -10000px; top: 0; width: 794px; height: 1123px; }
`.trim();

const WEBVIEW_TAG = "webview" as "div";

interface WebviewLike {
  addEventListener(name: string, fn: () => void, opts?: { once: boolean }): void;
  removeEventListener(name: string, fn: () => void): void;
  executeJavaScript(code: string): Promise<unknown>;
  printToPDF(opts: Record<string, unknown>): Promise<Uint8Array>;
  remove(): void;
}

/** `true` in der Desktop-App; nur dort gibt es `<webview>`. */
export function isDesktopPrintAvailable(): boolean {
  return Platform.isDesktopApp;
}

export async function printHtmlToPdf(
  doc: Document,
  html: string,
  options: PrintToPdfOptions,
): Promise<Uint8Array> {
  if (!isDesktopPrintAvailable()) {
    throw new PrintToPdfError("unavailable", "Print to PDF needs the desktop app");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = options.signal;
  if (signal?.aborted) throw new PrintToPdfError("aborted", "Print was cancelled");
  // `webview` fehlt in HTMLElementTagNameMap; createEl (statt createElement) verlangt der Store-Lint.
  const wv = doc.body.createEl(WEBVIEW_TAG, { cls: "okit-print-host", attr: { src: "about:blank" } }) as unknown as WebviewLike;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return;
    onAbort = () => reject(new PrintToPdfError("aborted", "Print was cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  aborted.catch(() => undefined);
  const guard = <T>(p: Promise<T>): Promise<T> => (signal ? Promise.race([p, aborted]) : p);
  const checkAbort = (): void => {
    if (signal?.aborted) throw new PrintToPdfError("aborted", "Print was cancelled");
  };

  let domReadyFn: (() => void) | undefined;
  const domReady = new Promise<void>((resolve) => {
    domReadyFn = () => resolve();
    wv.addEventListener("dom-ready", domReadyFn, { once: true });
  });

  const work = (async (): Promise<Uint8Array> => {
    const ready = await guard(withTimeout(domReady, DOM_READY_MS, realClock));
    if (ready.timedOut) throw new PrintToPdfError("timeout", "The print view did not become ready");
    checkAbort();
    await guard(wv.executeJavaScript(`document.open();document.write(${JSON.stringify(html)});document.close();0`));
    await guard(wv.executeJavaScript("document.fonts.ready.then(()=>0)"));
    checkAbort();
    const data = await guard(wv.printToPDF({
      pageSize: options.pageSize,
      printBackground: options.printBackground,
      preferCSSPageSize: true,
      generateTaggedPDF: true,
    }));
    if (data.byteLength < EMPTY_PDF_MAX_BYTES) {
      throw new PrintToPdfError("empty", `The PDF has only ${data.byteLength} bytes`);
    }
    return data;
  })();
  work.catch(() => undefined);

  try {
    const result = await withTimeout(work, timeoutMs, realClock);
    if (result.timedOut) throw new PrintToPdfError("timeout", "Printing took too long");
    return result.value;
  } catch (e) {
    if (e instanceof PrintToPdfError) throw e;
    throw new PrintToPdfError("failed", e instanceof Error ? e.message : String(e));
  } finally {
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    if (domReadyFn) wv.removeEventListener("dom-ready", domReadyFn);
    wv.remove();
  }
}
