import { describe, expect, it } from "vitest";
import { findNegativeKeywords } from "../src/ai/safetyCheck";

describe("findNegativeKeywords", () => {
  it("flags known clickbait phrases case-insensitively", () => {
    const flagged = findNegativeKeywords("Dieses WUNDERMITTEL macht dich in 2 Minuten schmerzfrei!");
    expect(flagged).toContain("wundermittel");
    expect(flagged).toContain("in 2 minuten schmerzfrei");
  });

  it("returns an empty array for clean text", () => {
    expect(findNegativeKeywords("Sanfte Kieferöffnung zur Mobilisierung des Kiefergelenks.")).toEqual([]);
  });
});
