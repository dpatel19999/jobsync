import { extractJobKeywords, scoreJob } from "@/actions/atsScore.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { getJobDetails } from "@/actions/job.actions";
import { getResumeById } from "@/actions/profile.actions";
import { generateText } from "ai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

vi.mock("@prisma/client", () => {
  const mPrismaClient = {
    job: { findFirst: vi.fn(), update: vi.fn() },
    jobKeyword: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    userSettings: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    profile: { findFirst: vi.fn() },
    resume: { findFirst: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { PrismaClient: vi.fn(function () { return mPrismaClient; }) };
});

vi.mock("@/utils/user.utils", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/actions/job.actions", () => ({ getJobDetails: vi.fn() }));
vi.mock("@/actions/profile.actions", () => ({ getResumeById: vi.fn() }));
vi.mock("ai", () => ({ generateText: vi.fn() }));

const {
  getModelMock,
  preprocessResumeMock,
  preprocessJobMock,
} = vi.hoisted(() => ({
  getModelMock: vi.fn(),
  preprocessResumeMock: vi.fn(),
  preprocessJobMock: vi.fn(),
}));
vi.mock("@/lib/ai", () => ({
  getModel: getModelMock,
  preprocessResume: preprocessResumeMock,
  preprocessJob: preprocessJobMock,
  ATS_KEYWORDS_SYSTEM_PROMPT: "ATS_SYSTEM",
  buildAtsKeywordsPrompt: (jobText: string) => `ATS_PROMPT:${jobText.length}`,
}));

const VALID_USER = { id: "user-1", name: "Test", email: "test@test.com" };

describe("extractJobKeywords — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockResolvedValue(VALID_USER);
    (prisma.userSettings.findUnique as any).mockResolvedValue(null);
    getModelMock.mockResolvedValue({ modelId: "mock-model" });
  });

  it("fails cleanly when the job is not found", async () => {
    (getJobDetails as any).mockResolvedValue({ success: false, job: null });
    const result = await extractJobKeywords("job-1");
    expect(result.success).toBe(false);
  });

  it("fails cleanly when the job description is too minimal to preprocess", async () => {
    (getJobDetails as any).mockResolvedValue({ success: true, job: { id: "job-1" } });
    preprocessJobMock.mockResolvedValue({
      success: false,
      error: { code: "TOO_SHORT", message: "Job description is too short (12 characters, minimum 200 required)" },
    });
    const result = await extractJobKeywords("job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/too short/i);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("truncates a very long job description before sending it to the model (Ollama provider)", async () => {
    (getJobDetails as any).mockResolvedValue({ success: true, job: { id: "job-1" } });
    preprocessJobMock.mockResolvedValue({
      success: true,
      data: { normalizedText: "J".repeat(5000) },
    });
    (prisma.userSettings.findUnique as any).mockResolvedValue({
      settings: JSON.stringify({ ai: { provider: "ollama", model: "llama3.1" } }),
    });
    (generateText as any).mockResolvedValue({ text: "Node.js\nAWS\nDocker" });
    (prisma.jobKeyword.findMany as any).mockResolvedValue([]);

    await extractJobKeywords("job-1");

    const promptArg = (generateText as any).mock.calls[0][0].prompt as string;
    // buildAtsKeywordsPrompt mock echoes the length it received
    const lengthUsed = Number(promptArg.split(":")[1]);
    expect(lengthUsed).toBeLessThan(2000); // TEXT_LIMITS.OLLAMA.JOB = 1200
  });

  it("fails cleanly when the model returns no usable keyword lines", async () => {
    (getJobDetails as any).mockResolvedValue({ success: true, job: { id: "job-1" } });
    preprocessJobMock.mockResolvedValue({
      success: true,
      data: { normalizedText: "A".repeat(300) },
    });
    (generateText as any).mockResolvedValue({ text: "" });

    const result = await extractJobKeywords("job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/did not return any keywords/i);
  });
});

describe("scoreJob — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockResolvedValue(VALID_USER);
  });

  it("fails cleanly when the job has no keywords to score against", async () => {
    (getJobDetails as any).mockResolvedValue({ success: true, job: { id: "job-1", resumeId: "resume-1" } });
    (prisma.jobKeyword.findMany as any).mockResolvedValue([]);

    const result = await scoreJob("job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no keywords/i);
  });

  it("fails cleanly when no resume can be resolved (missing job field chain)", async () => {
    (getJobDetails as any).mockResolvedValue({ success: true, job: { id: "job-1", resumeId: null } });
    (prisma.jobKeyword.findMany as any).mockResolvedValue([{ id: "k1", text: "Node.js" }]);
    (prisma.user.findUnique as any).mockResolvedValue({ defaultResumeId: null });
    (prisma.profile.findFirst as any).mockResolvedValue(null);

    const result = await scoreJob("job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no resume/i);
  });

  it("scores a non-English/non-German job description without crashing (real ATS pipeline, no mocking)", async () => {
    (getJobDetails as any).mockResolvedValue({ success: true, job: { id: "job-1", resumeId: "resume-1" } });
    (prisma.jobKeyword.findMany as any).mockResolvedValue([
      { id: "k1", text: "Node.js" },
      { id: "k2", text: "AWS" },
    ]);
    (getResumeById as any).mockResolvedValue({ success: true, data: { id: "resume-1", title: "My Resume" } });
    preprocessResumeMock.mockResolvedValue({
      success: true,
      data: { normalizedText: "Experience with Node.js and AWS services." },
    });
    preprocessJobMock.mockResolvedValue({
      success: true,
      data: {
        // French — neither English nor German; language-detect is forced to
        // pick one of the two rather than crash (see language-detect.spec.ts).
        normalizedText:
          "Nous recherchons un ingenieur backend pour rejoindre notre equipe de plateforme technique tres avancee.",
      },
    });

    const result = await scoreJob("job-1");
    expect(result.success).toBe(true);
    expect(typeof result.score).toBe("number");
    expect(["en", "de"]).toContain(result.data.language);
  });
});
