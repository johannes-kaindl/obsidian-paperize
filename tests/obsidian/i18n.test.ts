// registerI18n() is the single place that registers the EN/DE dicts with the vendored
// i18n engine (src/vendor/kit/i18n.ts). setLang() is module-global state — each test
// resets it explicitly so test order does not affect the result.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLang, t } from "../../src/vendor/kit/i18n";
import { DE, EN, registerI18n } from "../../src/i18n/strings";

beforeEach(() => {
  registerI18n();
  setLang("en");
});
afterEach(() => {
  setLang("en");
});

describe("registerI18n + t()", () => {
  it("returns the EN string for a known key by default", () => {
    expect(t("cmd.export")).toBe("Export active note as PDF");
  });

  it("setLang('de') switches t() to the DE translation", () => {
    setLang("de");
    expect(t("cmd.export")).toBe("Aktive Notiz als PDF exportieren");
  });

  it("falls back to the key itself for a missing key", () => {
    expect(t("does.not.exist")).toBe("does.not.exist");
  });

  it("interpolates {0} positional args", () => {
    expect(t("notice.simplified", 3)).toBe("PDF created. 3 element(s) were simplified (e.g. callouts, math).");
    expect(t("notice.saved", "Notes/Doc.pdf")).toBe("PDF saved: Notes/Doc.pdf");
  });

  it("leaves unmatched placeholders untouched when an arg is missing", () => {
    expect(t("notice.saved")).toBe("PDF saved: {0}");
  });
});

describe("EN/DE dictionaries", () => {
  it("define exactly the same set of keys (no drift between languages)", () => {
    expect(Object.keys(DE).sort()).toEqual(Object.keys(EN).sort());
  });

  it("have no empty values in either language", () => {
    for (const [key, val] of Object.entries(EN)) expect(val, `EN[${key}]`).toBeTruthy();
    for (const [key, val] of Object.entries(DE)) expect(val, `DE[${key}]`).toBeTruthy();
  });
});
