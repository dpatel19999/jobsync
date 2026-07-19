import { checkPositionLock } from "@/lib/ai/guardrails/position-lock";

describe("checkPositionLock", () => {
  it("matches when the rewritten text has the same number of non-empty lines", () => {
    const original = "Summary line.\nExperience line one.\nline two.\nSkills line.";
    const rewritten = "Reworded summary.\nReworded experience line one.\nReworded line two.\nReworded skills.";

    const result = checkPositionLock(original, rewritten);

    expect(result.matched).toBe(true);
    expect(result.originalLineCount).toBe(4);
    expect(result.rewrittenLineCount).toBe(4);
  });

  it("flags a mismatch when a line was added", () => {
    const original = "Summary line.\nExperience line.";
    const rewritten = "Summary line.\nExperience line.\nA brand new line that wasn't there.";

    const result = checkPositionLock(original, rewritten);

    expect(result.matched).toBe(false);
    expect(result.originalLineCount).toBe(2);
    expect(result.rewrittenLineCount).toBe(3);
  });

  it("flags a mismatch when a line was removed", () => {
    const original = "Summary line.\nExperience line.\nSkills line.";
    const rewritten = "Summary line.\nExperience line.";

    const result = checkPositionLock(original, rewritten);

    expect(result.matched).toBe(false);
    expect(result.originalLineCount).toBe(3);
    expect(result.rewrittenLineCount).toBe(2);
  });

  it("flags a mismatch when two lines were merged into one", () => {
    const original = "Job title line.\nJob description line.";
    const rewritten = "Job title line combined with description in one paragraph.";

    const result = checkPositionLock(original, rewritten);

    expect(result.matched).toBe(false);
    expect(result.originalLineCount).toBe(2);
    expect(result.rewrittenLineCount).toBe(1);
  });

  it("ignores blank lines — only non-empty lines count toward the total", () => {
    const original = "Line one.\n\n\n\nLine two.";
    const rewritten = "Reworded line one.\n\nReworded line two.";

    const result = checkPositionLock(original, rewritten);

    expect(result.matched).toBe(true);
    expect(result.originalLineCount).toBe(2);
    expect(result.rewrittenLineCount).toBe(2);
  });

  it("matches real PDF-extraction-shaped input: a continuous run of single-newline-separated lines with no blank lines at all", () => {
    const original = "DHRUVIL AKBARI\nMaster of Engineering\nAUSBILDUNG\nMaster of Engineering, 2027\nHochschule Schmalkalden";
    const rewritten = "DHRUVIL AKBARI\nMaster of Engineering (reworded)\nAUSBILDUNG\nMaster of Engineering, 2027 (reworded)\nHochschule Schmalkalden (reworded)";

    const result = checkPositionLock(original, rewritten);

    expect(result.matched).toBe(true);
    expect(result.originalLineCount).toBe(5);
  });

  it("treats empty input as zero lines", () => {
    const result = checkPositionLock("", "");
    expect(result.matched).toBe(true);
    expect(result.originalLineCount).toBe(0);
    expect(result.rewrittenLineCount).toBe(0);
  });
});
