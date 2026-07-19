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
vi.mock("ai", () => ({ generateText: vi.fn() }));

const {
  getModelMock,
  preprocessResumeMock,
  preprocessJobMock,
  checkRateLimitMock,
  resolveJobLanguageMock,
  resolveDefaultAiMock,
  callWithGeminiFallbackMock,
} = vi.hoisted(() => {
  const getModelMock = vi.fn();
  const resolveDefaultAiMock = vi.fn();
  // Default pass-through: resolves the provider (via resolveDefaultAiMock),
  // gets the model (via getModelMock), and calls the action's `run`
  // callback — mirrors the real callWithGeminiFallback so existing
  // getModelMock assertions still hold. Individual tests override this to
  // exercise the actual quota-fallback behavior.
  const callWithGeminiFallbackMock = vi.fn(async (userId: string, run: any) => {
    const ai = await resolveDefaultAiMock(userId);
    const model = await getModelMock(ai.provider, ai.model, userId);
    const result = await run(model, ai.provider);
    return { result, providerUsed: ai.provider, usedOfflineFallback: false };
  });
  return {
    getModelMock,
    preprocessResumeMock: vi.fn(),
    preprocessJobMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    resolveJobLanguageMock: vi.fn(),
    resolveDefaultAiMock,
    callWithGeminiFallbackMock,
  };
});
vi.mock("@/actions/job.actions", () => ({
  getJobDetails: vi.fn(),
  resolveJobLanguage: resolveJobLanguageMock,
}));
vi.mock("@/actions/profile.actions", () => ({ getResumeById: vi.fn() }));

const { scoreResumeAgainstKeywordsMock } = vi.hoisted(() => ({
  scoreResumeAgainstKeywordsMock: vi.fn(),
}));
vi.mock("@/lib/ats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ats")>();
  // Defaults to the real scoring pipeline so every existing test keeps
  // exercising real EN/DE tokenization; individual tests override with
  // mockImplementationOnce to simulate a hang.
  scoreResumeAgainstKeywordsMock.mockImplementation(actual.scoreResumeAgainstKeywords);
  return { ...actual, scoreResumeAgainstKeywords: scoreResumeAgainstKeywordsMock };
});

vi.mock("@/lib/ai", () => ({
  getModel: getModelMock,
  preprocessResume: preprocessResumeMock,
  preprocessJob: preprocessJobMock,
  ATS_KEYWORDS_SYSTEM_PROMPT: "ATS_SYSTEM",
  buildAtsKeywordsPrompt: (jobText: string) => `ATS_PROMPT:${jobText.length}`,
  checkRateLimit: checkRateLimitMock,
  resolveDefaultAi: resolveDefaultAiMock,
  callWithGeminiFallback: callWithGeminiFallbackMock,
}));

const VALID_USER = { id: "user-1", name: "Test", email: "test@test.com" };

describe("extractJobKeywords — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockResolvedValue(VALID_USER);
    resolveDefaultAiMock.mockResolvedValue({ provider: "gemini", model: "gemini-flash-latest" });
    getModelMock.mockResolvedValue({ modelId: "mock-model" });
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 4, resetIn: 60000 });
  });

  it("defaults to Gemini when the user has no saved AI settings", async () => {
    (getJobDetails as any).mockResolvedValue({ success: true, job: { id: "job-1" } });
    preprocessJobMock.mockResolvedValue({ success: true, data: { normalizedText: "A".repeat(300) } });
    (generateText as any).mockResolvedValue({ text: "Node.js\nAWS" });
    (prisma.jobKeyword.findMany as any).mockResolvedValue([]);

    await extractJobKeywords("job-1");
    expect(getModelMock).toHaveBeenCalledWith("gemini", "gemini-flash-latest", VALID_USER.id);
  });

  it("uses the user's saved Ollama preference instead of the Gemini default", async () => {
    resolveDefaultAiMock.mockResolvedValue({ provider: "ollama", model: "llama3.2:3b" });
    (getJobDetails as any).mockResolvedValue({ success: true, job: { id: "job-1" } });
    preprocessJobMock.mockResolvedValue({ success: true, data: { normalizedText: "A".repeat(300) } });
    (generateText as any).mockResolvedValue({ text: "Node.js\nAWS" });
    (prisma.jobKeyword.findMany as any).mockResolvedValue([]);

    await extractJobKeywords("job-1");
    expect(getModelMock).toHaveBeenCalledWith("ollama", "llama3.2:3b", VALID_USER.id);
  });

  it("surfaces usedOfflineFallback on the result when callWithGeminiFallback had to fall back to Ollama", async () => {
    (getJobDetails as any).mockResolvedValue({ success: true, job: { id: "job-1" } });
    preprocessJobMock.mockResolvedValue({ success: true, data: { normalizedText: "A".repeat(300) } });
    (prisma.jobKeyword.findMany as any).mockResolvedValue([]);
    callWithGeminiFallbackMock.mockImplementationOnce(async (_userId: string, run: any) => {
      const result = await run({ modelId: "ollama-fallback-model" }, "ollama");
      return { result, providerUsed: "ollama", usedOfflineFallback: true };
    });
    (generateText as any).mockResolvedValue({ text: "Node.js\nAWS" });

    const result = await extractJobKeywords("job-1");
    expect(result.success).toBe(true);
    expect(result.usedOfflineFallback).toBe(true);
  });

  it("fails cleanly when the job is not found", async () => {
    (getJobDetails as any).mockResolvedValue({ success: false, job: null });
    const result = await extractJobKeywords("job-1");
    expect(result.success).toBe(false);
  });

  it("rejects with a clear message when the user is rate limited, without calling the model", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetIn: 42000 });
    const result = await extractJobKeywords("job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/too many ai requests/i);
    expect(generateText).not.toHaveBeenCalled();
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
    resolveDefaultAiMock.mockResolvedValue({ provider: "ollama", model: "llama3.1" });
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
    resolveJobLanguageMock.mockResolvedValue("en");
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

  it("scores a non-English/non-German job description without crashing (real scoring pipeline, no mocking)", async () => {
    // Language fallback itself (franc forced to pick en/de for French text)
    // is covered directly in language-detect.spec.ts; here resolveJobLanguage
    // is mocked and this test only checks the scoring core doesn't choke on
    // whatever language comes back.
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
        normalizedText:
          "Nous recherchons un ingenieur backend pour rejoindre notre equipe de plateforme technique tres avancee.",
      },
    });

    const result = await scoreJob("job-1");
    expect(result.success).toBe(true);
    expect(typeof result.score).toBe("number");
    expect(result.data.language).toBe("en"); // from the mocked resolveJobLanguage
  });

  it("resolves language via the job's persisted field/detection and passes it straight through to scoring (no re-detection)", async () => {
    (getJobDetails as any).mockResolvedValue({
      success: true,
      job: { id: "job-1", resumeId: "resume-1", language: "de" },
    });
    (prisma.jobKeyword.findMany as any).mockResolvedValue([{ id: "k1", text: "Node.js" }]);
    (getResumeById as any).mockResolvedValue({ success: true, data: { id: "resume-1", title: "My Resume" } });
    preprocessResumeMock.mockResolvedValue({
      success: true,
      data: { normalizedText: "Erfahrung mit Node.js." },
    });
    preprocessJobMock.mockResolvedValue({
      success: true,
      data: { normalizedText: "Wir suchen einen Entwickler mit Node.js Erfahrung." },
    });
    resolveJobLanguageMock.mockResolvedValue("de");

    const result = await scoreJob("job-1");

    expect(result.success).toBe(true);
    expect(result.data.language).toBe("de");
    expect(resolveJobLanguageMock).toHaveBeenCalledWith(
      VALID_USER.id,
      expect.objectContaining({ id: "job-1", language: "de" }),
      "Wir suchen einen Entwickler mit Node.js Erfahrung.",
    );
  });

  it("times out with a clear message instead of hanging if scoring stalls (e.g. a slow dependency load)", async () => {
    vi.useFakeTimers();
    try {
      (getJobDetails as any).mockResolvedValue({ success: true, job: { id: "job-1", resumeId: "resume-1" } });
      (prisma.jobKeyword.findMany as any).mockResolvedValue([{ id: "k1", text: "Node.js" }]);
      (getResumeById as any).mockResolvedValue({ success: true, data: { id: "resume-1", title: "My Resume" } });
      preprocessResumeMock.mockResolvedValue({
        success: true,
        data: { normalizedText: "Experience with Node.js." },
      });
      preprocessJobMock.mockResolvedValue({
        success: true,
        data: { normalizedText: "We need a Node.js developer." },
      });
      scoreResumeAgainstKeywordsMock.mockImplementationOnce(() => new Promise(() => {}));

      const resultPromise = scoreJob("job-1");
      await vi.advanceTimersByTimeAsync(15000);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/timed out/i);
    } finally {
      vi.useRealTimers();
    }
  });
});
