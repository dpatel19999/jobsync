import { rewriteResume } from "@/actions/resumeRewrite.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { getJobDetails, resolveJobLanguage } from "@/actions/job.actions";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

vi.mock("@prisma/client", () => {
  const mPrismaClient = {
    profile: { findFirst: vi.fn() },
    masterTemplate: { findFirst: vi.fn() },
    rewrittenResume: { create: vi.fn() },
    job: { update: vi.fn() },
  };
  return { PrismaClient: vi.fn(function () { return mPrismaClient; }) };
});

vi.mock("@/utils/user.utils", () => ({ getCurrentUser: vi.fn() }));

const { getJobDetailsMock, resolveJobLanguageMock } = vi.hoisted(() => ({
  getJobDetailsMock: vi.fn(),
  resolveJobLanguageMock: vi.fn(),
}));
vi.mock("@/actions/job.actions", () => ({
  getJobDetails: getJobDetailsMock,
  resolveJobLanguage: resolveJobLanguageMock,
}));

const {
  getModelMock,
  preprocessJobMock,
  generateVerifiedContentMock,
  checkRateLimitMock,
  resolveDefaultAiMock,
  callWithGeminiFallbackMock,
  checkPositionLockMock,
} = vi.hoisted(() => {
  const getModelMock = vi.fn();
  const resolveDefaultAiMock = vi.fn();
  // Default pass-through mirroring the real callWithGeminiFallback, same
  // pattern as coverLetter.actions.spec.ts / atsScore.actions.spec.ts.
  const callWithGeminiFallbackMock = vi.fn(async (userId: string, run: any) => {
    const ai = await resolveDefaultAiMock(userId);
    const model = await getModelMock(ai.provider, ai.model, userId);
    const result = await run(model, ai.provider);
    return { result, providerUsed: ai.provider, usedOfflineFallback: false };
  });
  return {
    getModelMock,
    preprocessJobMock: vi.fn(),
    generateVerifiedContentMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    resolveDefaultAiMock,
    callWithGeminiFallbackMock,
    checkPositionLockMock: vi.fn(),
  };
});

vi.mock("@/lib/ai", () => ({
  preprocessJob: preprocessJobMock,
  RESUME_REWRITE_SYSTEM_PROMPT: "REWRITE_EN_SYSTEM",
  buildResumeRewritePrompt: (_template: string, _job: string) => `REWRITE_EN_PROMPT`,
  RESUME_REWRITE_SYSTEM_PROMPT_DE: "REWRITE_DE_SYSTEM",
  buildResumeRewritePromptDe: (_template: string, _job: string) => `REWRITE_DE_PROMPT`,
  generateVerifiedContent: generateVerifiedContentMock,
  checkRateLimit: checkRateLimitMock,
  callWithGeminiFallback: callWithGeminiFallbackMock,
  checkPositionLock: checkPositionLockMock,
}));

describe("rewriteResume", () => {
  const mockUser = { id: "user-id" };

  function setupHappyPath() {
    (getCurrentUser as any).mockResolvedValue(mockUser);
    (prisma.profile.findFirst as any).mockResolvedValue({ id: "profile-1", userId: "user-id" });
    (getJobDetailsMock as any).mockResolvedValue({
      success: true,
      job: {
        id: "job-1",
        Company: { label: "Nordwind GmbH" },
        JobTitle: { label: "Backend Engineer" },
      },
    });
    preprocessJobMock.mockResolvedValue({
      success: true,
      data: { normalizedText: "Job text for Backend Engineer role." },
    });
    resolveJobLanguageMock.mockResolvedValue("en");
    (prisma.masterTemplate.findFirst as any).mockResolvedValue({
      id: "template-1",
      slot: "RESUME_EN",
      extractedText: "Summary block.\n\nExperience block.",
    });
    resolveDefaultAiMock.mockResolvedValue({ provider: "gemini", model: DEFAULT_GEMINI_MODEL });
    getModelMock.mockResolvedValue({ modelId: "mock-model" });
    checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 4, resetIn: 60000 });
    generateVerifiedContentMock.mockResolvedValue({
      content: "Reworded summary.\n\nReworded experience.",
      verified: true,
      unsupportedClaims: [],
      attempts: 1,
      warning: null,
    });
    checkPositionLockMock.mockReturnValue({
      matched: true,
      originalLineCount: 2,
      rewrittenLineCount: 2,
    });
    (prisma.rewrittenResume.create as any).mockImplementation(({ data }: any) => ({
      id: "rewritten-1",
      ...data,
    }));
    (prisma.job.update as any).mockResolvedValue({});
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPath();
  });

  it("succeeds on the happy path, saving a RewrittenResume and linking it to the job", async () => {
    const result = await rewriteResume("profile-1", "job-1");

    expect(result.success).toBe(true);
    expect(result.content).toBe("Reworded summary.\n\nReworded experience.");
    expect(prisma.rewrittenResume.create).toHaveBeenCalledWith({
      data: {
        profileId: "profile-1",
        title: "Dhruvil_Akbari_Nordwind_GmbH_Resume",
        content: "Reworded summary.\n\nReworded experience.",
        sourceTemplateId: "template-1",
      },
    });
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: "job-1", userId: "user-id" },
      data: { rewrittenResumeId: "rewritten-1" },
    });
  });

  it("reads the resume template from MasterTemplate, not the structured Resume model", async () => {
    await rewriteResume("profile-1", "job-1");
    expect(prisma.masterTemplate.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-id", slot: "RESUME_EN", isCurrent: true },
    });
  });

  it("rejects with a clear message when the user is rate limited, without calling the model", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetIn: 42000 });
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/too many ai requests/i);
    expect(generateVerifiedContentMock).not.toHaveBeenCalled();
  });

  it("fails cleanly when the profile doesn't belong to the user", async () => {
    (prisma.profile.findFirst as any).mockResolvedValue(null);
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/profile not found/i);
  });

  it("fails cleanly when the job isn't found", async () => {
    (getJobDetailsMock as any).mockResolvedValue({ success: false, job: null });
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/job not found/i);
  });

  it("fails with a clear message when the job's language can't be determined yet, without attempting generation", async () => {
    resolveJobLanguageMock.mockResolvedValue(null);
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/language couldn't be determined/i);
    expect(generateVerifiedContentMock).not.toHaveBeenCalled();
  });

  it("fails with a clear 'no template uploaded' message (English) instead of falling back silently", async () => {
    (prisma.masterTemplate.findFirst as any).mockResolvedValue(null);
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no english resume template uploaded yet/i);
    expect(generateVerifiedContentMock).not.toHaveBeenCalled();
  });

  it("fails with a clear 'no template uploaded' message (German) when the job is German", async () => {
    resolveJobLanguageMock.mockResolvedValue("de");
    (prisma.masterTemplate.findFirst as any).mockResolvedValue(null);
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no german resume template uploaded yet/i);
  });

  it("defaults to Gemini when the user has no saved AI settings", async () => {
    await rewriteResume("profile-1", "job-1");
    expect(getModelMock).toHaveBeenCalledWith("gemini", DEFAULT_GEMINI_MODEL, "user-id");
  });

  it("uses the user's saved Ollama preference instead of the Gemini default", async () => {
    resolveDefaultAiMock.mockResolvedValue({ provider: "ollama", model: "llama3.2:3b" });
    await rewriteResume("profile-1", "job-1");
    expect(getModelMock).toHaveBeenCalledWith("ollama", "llama3.2:3b", "user-id");
  });

  it("surfaces usedOfflineFallback on the result when a Gemini quota error fell back to Ollama", async () => {
    callWithGeminiFallbackMock.mockImplementationOnce(async (_userId: string, run: any) => {
      const result = await run({ modelId: "ollama-fallback-model" }, "ollama");
      return { result, providerUsed: "ollama", usedOfflineFallback: true };
    });
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.success).toBe(true);
    expect(result.usedOfflineFallback).toBe(true);
  });

  it("routes to the German resume-rewrite prompt pair when resolveJobLanguage returns 'de', with a German template", async () => {
    resolveJobLanguageMock.mockResolvedValue("de");
    (prisma.masterTemplate.findFirst as any).mockResolvedValue({
      id: "template-de-1",
      slot: "RESUME_DE",
      extractedText: "Zusammenfassung.\n\nErfahrung.",
    });

    await rewriteResume("profile-1", "job-1");

    expect(prisma.masterTemplate.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-id", slot: "RESUME_DE", isCurrent: true },
    });
    const callArgs = generateVerifiedContentMock.mock.calls[0][0];
    expect(callArgs.system).toBe("REWRITE_DE_SYSTEM");
    expect(callArgs.prompt).toBe("REWRITE_DE_PROMPT");
    expect(callArgs.language).toBe("de");
  });

  it("routes to the English resume-rewrite prompt pair when resolveJobLanguage returns 'en'", async () => {
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.success).toBe(true);

    const callArgs = generateVerifiedContentMock.mock.calls[0][0];
    expect(callArgs.system).toBe("REWRITE_EN_SYSTEM");
    expect(callArgs.prompt).toBe("REWRITE_EN_PROMPT");
    expect(callArgs.language).toBe("en");
  });

  it("surfaces the factual-accuracy warning from generateVerifiedContent without discarding the content", async () => {
    generateVerifiedContentMock.mockResolvedValue({
      content: "Flagged rewritten content.",
      verified: false,
      unsupportedClaims: ["fake claim"],
      attempts: 2,
      warning: "Please review before sending.",
    });
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.success).toBe(true);
    expect(result.content).toBe("Flagged rewritten content.");
    expect(result.warning).toBe("Please review before sending.");
  });

  it("appends a position-lock warning when the rewritten output's line count doesn't match the template's", async () => {
    checkPositionLockMock.mockReturnValue({
      matched: false,
      originalLineCount: 5,
      rewrittenLineCount: 3,
    });
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.success).toBe(true);
    expect(result.warning).toMatch(/line structure doesn't match/i);
    expect(result.warning).toMatch(/template: 5 lines, rewritten: 3 lines/i);
    expect(result.positionLock).toEqual({
      matched: false,
      originalLineCount: 5,
      rewrittenLineCount: 3,
    });
  });

  it("combines a factual-accuracy warning and a position-lock warning when both fire", async () => {
    generateVerifiedContentMock.mockResolvedValue({
      content: "Flagged rewritten content.",
      verified: false,
      unsupportedClaims: ["fake claim"],
      attempts: 2,
      warning: "Please review before sending.",
    });
    checkPositionLockMock.mockReturnValue({
      matched: false,
      originalLineCount: 4,
      rewrittenLineCount: 5,
    });
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.warning).toContain("Please review before sending.");
    expect(result.warning).toMatch(/line structure doesn't match/i);
  });

  it("has no warning at all when both factual-accuracy and position-lock pass", async () => {
    const result = await rewriteResume("profile-1", "job-1");
    expect(result.warning).toBeNull();
  });
});
