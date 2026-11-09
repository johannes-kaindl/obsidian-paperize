// Die Platzhalter stehen IM PDF und folgen deshalb der Oberflaechensprache. Die Engine ist
// Obsidian- und i18n-frei, also reicht der Konsument die Texte durch (dasselbe Objekt dient
// domToIrSync und resolveImages). `mathSource` traegt die Klammern selbst; {0} bleibt stehen,
// weil t() ohne Argument ihn nicht ersetzt — die Engine setzt die LaTeX-Quelle ein.
import { t } from '../vendor/kit/i18n';
import type { PdfPlaceholders } from '../vendor/kit/pdf/dom-to-ir';

export function buildPdfPlaceholders(): PdfPlaceholders {
  return {
    math: t('pdf.placeholder.math'),
    mathSource: t('pdf.placeholder.mathSource'),
    graphic: t('pdf.placeholder.graphic'),
    image: t('pdf.placeholder.image'),
    imageFailed: t('pdf.placeholder.imageFailed'),
  };
}
