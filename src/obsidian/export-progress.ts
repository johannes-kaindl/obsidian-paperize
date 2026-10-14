// Fortschritts-Hinweis mit Abbrechen-Knopf für den PDF-Export (Rendern bis 10 s, je Bild bis 15 s).
// Der Export prüft zwischen seinen Schritten `checkpoint()`; ein laufender Schritt (Render, Bild-Abruf)
// wird nicht unterbrochen, sein Ergebnis aber verworfen. Die eigentliche Zeitgrenze bleibt withTimeout.
import { Notice } from 'obsidian';
import { t } from '../vendor/kit/i18n';

export class ExportCancelled extends Error {
  constructor() { super('export cancelled'); this.name = 'ExportCancelled'; }
}

export interface ExportProgress {
  /** Wirft ExportCancelled, wenn der Nutzer abgebrochen hat. */
  checkpoint(): void;
  /** Hinweis schließen (immer im finally). */
  done(): void;
}

export function startExportProgress(): ExportProgress {
  let cancelled = false;
  const notice = new Notice(t('notice.exporting'), 0);
  const host = notice.messageEl;
  const btn = host.createEl('button', { text: t('notice.exportCancel') });
  btn.addEventListener('click', () => { cancelled = true; notice.hide(); });
  return {
    checkpoint() { if (cancelled) throw new ExportCancelled(); },
    done() { notice.hide(); },
  };
}
