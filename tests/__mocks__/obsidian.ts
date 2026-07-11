// Minimal stub so Vite/Vitest can resolve the 'obsidian' specifier at test
// runtime (the real 'obsidian' npm package ships only type declarations —
// its package.json has "main": "" — so plain node resolution fails).
// Individual test files still override behavior with vi.mock('obsidian', ...)
// where they need specific class shapes; this file is the resolution target
// for that alias and a safe fallback otherwise.
export class App {}
export class Plugin {}
export class PluginSettingTab {
  app: App;
  containerEl: any;
  constructor(app: App, _plugin: unknown) {
    this.app = app;
  }
  display(): void {}
  hide(): void {}
}
export class Setting {
  constructor(_containerEl: any) {}
}
