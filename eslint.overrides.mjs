// Repo-eigene ESLint-Abweichungen — der EINZIGE Ort dafuer. Der Kern
// (eslint.config.mjs) ist template-verwaltet, Inline-disables blockt das Lint-Gate.
// Jeder Override braucht eine Begruendung im Kommentar.
//
// Zwei Klassen, zwei Preise (Details: _docs/docs/obsidian-plugin-publishing.md):
// - Kosmetik-/Benennungsregeln (z. B. ui/sentence-case bei Eigennamen/API-Namen):
//   Override ist die richtige Antwort und kostet nichts — der Scanner hat keinen
//   Mangel gefunden, sondern eine Konvention falsch angelegt.
// - Faehigkeitsregeln (z. B. settings-tab/prefer-setting-definitions): der Scanner
//   bewertet den Mangel, nicht die Begruendung — ein Override hier ist gestundete
//   Schuld und kostet die Store-Wertung ("Satisfactory" statt "Passed").
//   Marker fuer solche Faelle: `// STORE-SCHULD:` + wo die Abloesung geplant ist.
export default [
  {
    // Type-aware Linting braucht das Build-tsconfig des Repos. Achtung Falle
    // (json_viewer 1.9.0): ein obsidian→Mock-paths-Alias im referenzierten tsconfig
    // laesst die type-aware Regeln auf einen losen Mock aufloesen → no-unsafe-*-Kaskade.
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // STORE-SCHULD (Store-Scanner-Paritaet, 2026-08-13): PaperizeSettingTab nutzt noch
    // die klassische display()-API statt der deklarativen getSettingDefinitions() (seit
    // Obsidian 1.13.0). minAppVersion dieses Repos ist 1.8.7 — ein grosser Teil der
    // Nutzerbasis laeuft noch unter 1.13.0, wo getSettingDefinitions() gar nicht existiert.
    // Migration ist eine echte Fluss-Aenderung der Settings-Sektionen (SECTIONS-Tabelle +
    // collapsibleSection, s. AGENTS.md), keine mechanische Kleinumbau — bewusst zurueckgestellt,
    // bis minAppVersion angehoben wird. Gleiche Ursache treibt auch die display()- und
    // setDynamicTooltip()-Deprecation-Warnungen unten: beide APIs sind erst ab 1.13.0
    // ersetzbar, ohne Slider-Tooltips fuer die 1.8.7–1.12.x-Nutzerbasis zu verlieren.
    files: ["src/obsidian/settings.ts"],
    rules: {
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
      "@typescript-eslint/no-deprecated": "off",
    },
  },
];
