// Hilfe-Zeile der Settings (UI-STANDARD §8): Doku-Index und Issues dieses Repos, Texte aus i18n.
import { t } from '../vendor/kit/i18n';
import { githubHelpUrls, helpSettingDefinition } from '../vendor/kit-obsidian/help-setting';
import type { HelpSettingOptions } from '../vendor/kit-obsidian/help-setting';

/** GitHub-Repo-Name, nicht die Plugin-ID (`paperize`). */
export const HELP_REPO = 'obsidian-paperize';

export function helpOptions(open?: (url: string) => void): HelpSettingOptions {
  return {
    ...githubHelpUrls(HELP_REPO),
    texts: {
      name: t('settings.help.name'),
      desc: t('settings.help.desc'),
      openDocs: t('settings.help.openDocs'),
      reportIssue: t('settings.help.reportIssue'),
    },
    open,
  };
}

/** Erstes Element von `getSettingDefinitions()`; im Fallback zeichnet `renderFallback` es vor den Sektionen. */
export function helpDefinition() {
  return helpSettingDefinition(helpOptions());
}
