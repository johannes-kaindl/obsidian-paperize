// src/core/desktop-print.ts
// Reine Bausteine des Desktop-Druckwegs (Chromium über <webview>): Profile, Seiten-CSS, Satzspiegel.
// Kein obsidian-Import; die Verdrahtung steht in src/obsidian/export-desktop.ts.
import { pageCss } from '../vendor/kit/print-document';
import { obsidianPrintResetCss, paperProfileCss } from '../vendor/kit/print-css';

export type DesktopProfile = 'paper' | 'screen';

export interface DesktopPageSettings {
  pageSize: 'A4' | 'Letter';
  marginMm: number;
  pageNumbers: boolean;
  footer: { left?: string; right?: string } | null;
  imageMaxWidthPct: number;
  keepTablesTogether: boolean;
  repeatTableHeader: boolean;
  keepImagesTogether: boolean;
  keepCodeTogether: boolean;
  headingKeepWithLines: number;
}

/** Ausgeschriebene Farben aus dem Theme für `@page` (dort wirken keine CSS-Variablen). */
export interface PageColors { background: string | null; muted: string | null }

const PAGE_WIDTH_MM = { A4: 210, Letter: 215.9 } as const;

/** Papier erzwingt das helle Theme (Mermaid, Inline-Code), Bildschirm lässt die Klassen unberührt. */
export function profileBodyClass(profile: DesktopProfile, bodyClass: string): string {
  if (profile === 'screen') return bodyClass;
  const rest = bodyClass.split(/\s+/).filter((c) => c !== '' && c !== 'theme-dark' && c !== 'theme-light');
  return ['theme-light', ...rest].join(' ');
}

export function printBackgroundFor(profile: DesktopProfile): boolean {
  return profile === 'screen';
}

/** Breite des Satzspiegels in CSS-Pixeln (96 dpi): der Render-Container hat dieselbe Breite wie der Druck. */
export function renderWidthPx(s: DesktopPageSettings): number {
  return Math.round((PAGE_WIDTH_MM[s.pageSize] - 2 * s.marginMm) / 25.4 * 96);
}

export function paginationCss(s: DesktopPageSettings): string {
  const rules: string[] = [];
  if (s.keepTablesTogether) rules.push('table { break-inside: avoid; }');
  if (s.keepImagesTogether) rules.push('img, .mermaid { break-inside: avoid; }');
  if (s.keepCodeTogether) rules.push('pre { break-inside: avoid; }');
  rules.push('.callout { break-inside: avoid; }');
  if (s.headingKeepWithLines > 0) rules.push('h1, h2, h3, h4, h5, h6 { break-after: avoid; }');
  if (!s.repeatTableHeader) rules.push('thead { display: table-row-group; }');
  rules.push(`img { max-width: ${s.imageMaxWidthPct}%; }`);
  rules.push('.paperize-break { break-after: page; }');
  return rules.join('\n');
}

/** Das CSS nach dem gesammelten Theme-CSS: Rücksetzung, Profil, Paginierung, `@page`. */
export function desktopExtraCss(
  profile: DesktopProfile,
  s: DesktopPageSettings,
  colors: PageColors,
  marginBoxes: boolean,
): string {
  const paper = profile === 'paper';
  const background = paper ? undefined : colors.background ?? undefined;
  const numberColor = paper ? '#555' : colors.muted ?? undefined;
  const page = pageCss({
    size: s.pageSize,
    marginMm: s.marginMm,
    marginBoxes,
    background,
    pageNumbers: s.pageNumbers,
    numberColor,
    footer: s.footer ?? undefined,
  });
  const parts = [obsidianPrintResetCss()];
  if (paper) parts.push(paperProfileCss());
  else if (background !== undefined) parts.push(`html, body { background: ${background}; }`);
  parts.push(paginationCss(s), page);
  return parts.join('\n');
}
