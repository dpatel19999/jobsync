import { preprocessJob } from "@/lib/ai/tools/preprocessing-job";
import type { JobResponse } from "@/models/job.model";

function makeJob(overrides: Partial<JobResponse> = {}): JobResponse {
  return {
    id: "job-1",
    userId: "user-1",
    JobTitle: { id: "t1", label: "Backend Engineer", value: "backend-engineer", createdBy: "user-1" },
    Company: { id: "c1", label: "Acme Corp", value: "acme-corp", createdBy: "user-1" },
    Status: { id: "s1", label: "Applied", value: "applied" } as any,
    Location: null,
    JobSource: null,
    jobType: "full-time",
    createdAt: new Date(),
    appliedDate: new Date(),
    dueDate: new Date(),
    salaryRange: "",
    description: "",
    jobUrl: "",
    applied: false,
    ...overrides,
  } as JobResponse;
}

describe("preprocessJob — edge cases", () => {
  it("rejects a completely empty job description as NO_CONTENT/TOO_SHORT rather than crashing", async () => {
    const job = makeJob({ description: "" });
    const result = await preprocessJob(job);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(["NO_CONTENT", "TOO_SHORT"]).toContain(result.error.code);
    }
  });

  it("rejects a minimal description that's too short even with title/company padding", async () => {
    const job = makeJob({ description: "Great team." });
    const result = await preprocessJob(job);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TOO_SHORT");
    }
  });

  it("does not crash when JobTitle/Company labels are empty strings", async () => {
    const job = makeJob({
      JobTitle: { id: "t1", label: "", value: "", createdBy: "user-1" },
      Company: { id: "c1", label: "", value: "", createdBy: "user-1" },
      description: "A".repeat(250),
    });
    const result = await preprocessJob(job);
    expect(result.success).toBe(true);
  });

  it("accepts a very long (but under-max) job description", async () => {
    const job = makeJob({ description: "Responsibilities include building services. ".repeat(200) });
    const result = await preprocessJob(job);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.normalizedText.length).toBeGreaterThan(1000);
    }
  });

  it("rejects a job description over the 50,000 character hard cap", async () => {
    const job = makeJob({ description: "A".repeat(60000) });
    const result = await preprocessJob(job);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TOO_LONG");
    }
  });

  it("strips HTML tags from the description", async () => {
    const job = makeJob({
      description: `<p>${"We need a backend engineer. ".repeat(15)}</p><ul><li>Node.js</li><li>AWS</li></ul>`,
    });
    const result = await preprocessJob(job);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.normalizedText).not.toContain("<p>");
      expect(result.data.normalizedText).not.toContain("<li>");
    }
  });
});
