import { describe, expect, it } from "vitest";
import { settingsFormSchema } from "../src/lib/settingsSchema";
import { queryKeys } from "../src/lib/query/keys";
import { queryClient, REPOS_STALE_TIME_MS } from "../src/lib/query";
import en from "../src/i18n/locales/en.json";
import zhCN from "../src/i18n/locales/zh-CN.json";

describe("settingsFormSchema", () => {
  it("accepts valid scanDepth and concurrency", () => {
    expect(settingsFormSchema.parse({ scanDepth: 3, concurrency: 4 })).toEqual({
      scanDepth: 3,
      concurrency: 4,
    });
  });

  it("rejects out-of-range values", () => {
    expect(() => settingsFormSchema.parse({ scanDepth: 0, concurrency: 4 })).toThrow();
    expect(() => settingsFormSchema.parse({ scanDepth: 3, concurrency: 17 })).toThrow();
  });

  it("coerces string numbers", () => {
    expect(settingsFormSchema.parse({ scanDepth: "5", concurrency: "8" })).toEqual({
      scanDepth: 5,
      concurrency: 8,
    });
  });
});

describe("queryKeys", () => {
  it("keeps stable key shapes", () => {
    expect(queryKeys.repos).toEqual(["repos"]);
    expect(queryKeys.settings).toEqual(["settings"]);
    expect(queryKeys.repoDetail("/tmp/a")).toEqual(["repoDetail", "/tmp/a"]);
  });
});

describe("queryClient defaults", () => {
  it("does not refetch on focus or reconnect", () => {
    const defaults = queryClient.getDefaultOptions().queries;
    expect(defaults?.refetchOnWindowFocus).toBe(false);
    expect(defaults?.refetchOnReconnect).toBe(false);
    expect(REPOS_STALE_TIME_MS).toBe(Infinity);
  });
});

describe("i18n catalogs", () => {
  it("keeps en and zh-CN keys in sync", () => {
    const enKeys = Object.keys(en).sort();
    const zhKeys = Object.keys(zhCN).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it("uses i18next interpolation markers", () => {
    expect(en.selectedCount).toContain("{{selected}}");
    expect(zhCN.selectedCount).toContain("{{selected}}");
  });
});
