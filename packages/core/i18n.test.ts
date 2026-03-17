// i18n module unit tests

import { describe, it, expect } from "vitest";
import { t, getLanguage, languageName, languageDirective } from "./i18n.js";
import type { L5Blueprint } from "./l5.js";

const baseRevision = {
  rev: 1,
  parentRev: null as number | null,
  source: { type: "init" as const },
  timestamp: "2024-01-01T00:00:00Z",
};

function makeL5(language?: string): L5Blueprint {
  return {
    id: "test",
    name: "Test",
    version: "0.1.0",
    intent: "Test intent",
    constraints: [],
    domains: [],
    integrations: [],
    language,
    contentHash: "abc",
    revision: baseRevision,
  };
}

describe("t()", () => {
  it("returns English text for a known key", () => {
    const result = t("en", "check.missingLanguage");
    expect(result).toContain("language");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns English fallback for unknown language", () => {
    const enResult = t("en", "check.missingLanguage");
    const unknownResult = t("xx-unknown", "check.missingLanguage");
    expect(unknownResult).toBe(enResult);
  });

  it("returns the key itself for an unknown key", () => {
    const result = t("en", "nonexistent.key.that.does.not.exist");
    expect(result).toBe("nonexistent.key.that.does.not.exist");
  });

  it("performs parameter interpolation with {param} syntax", () => {
    const result = t("en", "check.hashMismatch.l5", {
      stored: "abc123",
      computed: "def456",
    });
    expect(result).toContain("abc123");
    expect(result).toContain("def456");
    expect(result).not.toContain("{stored}");
    expect(result).not.toContain("{computed}");
  });

  it("returns Chinese text for zh locale", () => {
    const enResult = t("en", "check.missingLanguage");
    const zhResult = t("zh", "check.missingLanguage");
    // zh translation should differ from English
    expect(zhResult).not.toBe(enResult);
    expect(typeof zhResult).toBe("string");
    expect(zhResult.length).toBeGreaterThan(0);
  });
});

describe("getLanguage()", () => {
  it("returns 'en' when no L5 provided", () => {
    expect(getLanguage(undefined)).toBe("en");
  });

  it("returns L5.language when present", () => {
    const l5 = makeL5("zh");
    expect(getLanguage(l5)).toBe("zh");
  });

  it("returns 'en' when L5.language is undefined", () => {
    const l5 = makeL5(undefined);
    expect(getLanguage(l5)).toBe("en");
  });
});

describe("languageName()", () => {
  it("returns 'English' for 'en'", () => {
    expect(languageName("en")).toBe("English");
  });

  it("returns Chinese name for 'zh'", () => {
    const name = languageName("zh");
    expect(name).toContain("Chinese");
  });

  it("returns the code itself for an unknown language code", () => {
    expect(languageName("xx-unknown")).toBe("xx-unknown");
  });
});

describe("languageDirective()", () => {
  it("returns empty string for 'en'", () => {
    expect(languageDirective("en")).toBe("");
  });

  it("returns non-empty string for 'zh'", () => {
    const directive = languageDirective("zh");
    expect(directive.length).toBeGreaterThan(0);
    expect(directive).toContain("Chinese");
  });
});
