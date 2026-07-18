import { scoreKeywords } from "@/lib/ats/core/scorer";

describe("scoreKeywords", () => {
  it("scores 0 when there are no keywords", () => {
    const result = scoreKeywords(new Set(["node", "aws"]), []);
    expect(result.score).toBe(0);
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("scores 0 when resume token set is empty", () => {
    const result = scoreKeywords(new Set(), [{ keyword: "Node.js", tokens: ["node"] }]);
    expect(result.score).toBe(0);
    expect(result.missing).toHaveLength(1);
  });

  it("scores 100 when all keywords match", () => {
    const result = scoreKeywords(new Set(["node", "aws", "docker"]), [
      { keyword: "Node.js", tokens: ["node"] },
      { keyword: "AWS", tokens: ["aws"] },
    ]);
    expect(result.score).toBe(100);
    expect(result.matched).toHaveLength(2);
    expect(result.missing).toHaveLength(0);
  });

  it("requires every token of a multi-token keyword to match (AND-match)", () => {
    const result = scoreKeywords(new Set(["rest"]), [
      { keyword: "REST API", tokens: ["rest", "api"] },
    ]);
    expect(result.score).toBe(0);
    expect(result.missing).toHaveLength(1);
  });

  it("treats a keyword with zero tokens as unmatched, not a free pass", () => {
    const result = scoreKeywords(new Set(["node"]), [{ keyword: "", tokens: [] }]);
    expect(result.matched).toHaveLength(0);
    expect(result.missing).toHaveLength(1);
  });

  it("weights keywords proportionally", () => {
    const result = scoreKeywords(new Set(["node"]), [
      { keyword: "Node.js", tokens: ["node"], weight: 3 },
      { keyword: "AWS", tokens: ["aws"], weight: 1 },
    ]);
    // matched weight 3 / total weight 4 = 75%
    expect(result.score).toBe(75);
  });

  it("rounds the score to the nearest integer", () => {
    const result = scoreKeywords(new Set(["a"]), [
      { keyword: "a", tokens: ["a"] },
      { keyword: "b", tokens: ["b"] },
      { keyword: "c", tokens: ["c"] },
    ]);
    // 1/3 = 33.33... -> rounds to 33
    expect(result.score).toBe(33);
  });
});
