import {
  getCoverLetterList,
  createCoverLetter,
  updateCoverLetter,
  deleteCoverLetterById,
  generateColdEmail,
  generateCoverLetter,
  generateTailoredSummary,
} from "@/actions/coverLetter.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { getJobDetails } from "@/actions/job.actions";
import { getResumeById } from "@/actions/profile.actions";
import { DEFAULT_GEMINI_MODEL, DEFAULT_OLLAMA_MODEL } from "@/lib/ai/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

vi.mock("@prisma/client", () => {
  const mPrismaClient = {
    coverLetter: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    profile: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    resume: { findFirst: vi.fn() },
    userSettings: { findUnique: vi.fn() },
    coldEmail: { create: vi.fn() },
    job: { update: vi.fn() },
  };
  return { PrismaClient: vi.fn(function() { return mPrismaClient; }) };
});

vi.mock("@/utils/user.utils", () => ({
  getCurrentUser: vi.fn(),
}));

const { getJobDetailsMock, resolveJobLanguageMock } = vi.hoisted(() => ({
  getJobDetailsMock: vi.fn(),
  resolveJobLanguageMock: vi.fn(),
}));
vi.mock("@/actions/job.actions", () => ({
  getJobDetails: getJobDetailsMock,
  resolveJobLanguage: resolveJobLanguageMock,
}));
vi.mock("@/actions/profile.actions", () => ({ getResumeById: vi.fn() }));

const {
  getModelMock,
  preprocessResumeMock,
  preprocessJobMock,
  generateVerifiedContentMock,
  checkRateLimitMock,
} = vi.hoisted(() => ({
  getModelMock: vi.fn(),
  preprocessResumeMock: vi.fn(),
  preprocessJobMock: vi.fn(),
  generateVerifiedContentMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}));
vi.mock("@/lib/ai", () => ({
  getModel: getModelMock,
  preprocessResume: preprocessResumeMock,
  preprocessJob: preprocessJobMock,
  COLD_EMAIL_SYSTEM_PROMPT: "EN_SYSTEM",
  buildColdEmailPrompt: (_resume: string, _job: string, company: string) => `EN_PROMPT:${company}`,
  COLD_EMAIL_SYSTEM_PROMPT_DE: "DE_SYSTEM",
  buildColdEmailPromptDe: (_resume: string, _job: string, company: string) => `DE_PROMPT:${company}`,
  COVER_LETTER_SYSTEM_PROMPT: "CL_EN_SYSTEM",
  buildCoverLetterPrompt: (_resume: string, _job: string, company: string) => `CL_EN_PROMPT:${company}`,
  COVER_LETTER_SYSTEM_PROMPT_DE: "CL_DE_SYSTEM",
  buildCoverLetterPromptDe: (_resume: string, _job: string, company: string) => `CL_DE_PROMPT:${company}`,
  TAILORED_SUMMARY_SYSTEM_PROMPT: "SUMMARY_EN_SYSTEM",
  buildTailoredSummaryPrompt: (_resume: string, _job: string) => `SUMMARY_EN_PROMPT`,
  TAILORED_SUMMARY_SYSTEM_PROMPT_DE: "SUMMARY_DE_SYSTEM",
  buildTailoredSummaryPromptDe: (_resume: string, _job: string) => `SUMMARY_DE_PROMPT`,
  generateVerifiedContent: generateVerifiedContentMock,
  checkRateLimit: checkRateLimitMock,
}));

describe("coverLetterActions", () => {
  const mockUser = { id: "user-id" };
  const mockCoverLetter = {
    id: "cl-id",
    profileId: "profile-id",
    title: "My Cover Letter",
    content: "This is the content of my cover letter for the position.",
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { Job: 0 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCoverLetterList", () => {
    it("should return cover letter list with default parameters", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.findMany as any).mockResolvedValue([
        mockCoverLetter,
      ]);
      (prisma.coverLetter.count as any).mockResolvedValue(1);

      const result = await getCoverLetterList();

      expect(result).toEqual({
        success: true,
        data: [mockCoverLetter],
        total: 1,
      });
      expect(prisma.coverLetter.findMany).toHaveBeenCalledWith({
        where: {
          profile: { userId: mockUser.id },
        },
        skip: 0,
        take: 25,
        select: {
          id: true,
          profileId: true,
          title: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { Job: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      expect(prisma.coverLetter.count).toHaveBeenCalledWith({
        where: {
          profile: { userId: mockUser.id },
        },
      });
    });

    it("should return cover letter list with pagination", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.findMany as any).mockResolvedValue([]);
      (prisma.coverLetter.count as any).mockResolvedValue(15);

      const result = await getCoverLetterList(2, 5);

      expect(result).toEqual({
        success: true,
        data: [],
        total: 15,
      });
      expect(prisma.coverLetter.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        }),
      );
    });

    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as any).mockResolvedValue(null);

      const result = await getCoverLetterList();

      expect(result).toEqual({
        success: false,
        message: "Not authenticated",
      });
    });

    it("should handle database errors", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.findMany as any).mockRejectedValue(
        new Error("Database error"),
      );

      const result = await getCoverLetterList();

      expect(result).toEqual({
        success: false,
        message: "Database error",
      });
    });
  });

  describe("createCoverLetter", () => {
    it("should create a cover letter when profile exists", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.findFirst as any).mockResolvedValue(null);
      (prisma.profile.findFirst as any).mockResolvedValue({
        id: "profile-id",
      });
      (prisma.coverLetter.create as any).mockResolvedValue(
        mockCoverLetter,
      );

      const result = await createCoverLetter(
        "My Cover Letter",
        "This is the content of my cover letter for the position.",
      );

      expect(result).toEqual({
        success: true,
        data: mockCoverLetter,
      });
      expect(prisma.coverLetter.create).toHaveBeenCalledWith({
        data: {
          profileId: "profile-id",
          title: "My Cover Letter",
          content:
            "This is the content of my cover letter for the position.",
        },
      });
    });

    it("should create a profile and cover letter when no profile exists", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.findFirst as any).mockResolvedValue(null);
      (prisma.profile.findFirst as any).mockResolvedValue(null);
      (prisma.profile.create as any).mockResolvedValue({
        id: "new-profile-id",
      });

      const result = await createCoverLetter("New CL", "Content for the new cover letter here.");

      expect(result).toEqual({
        success: true,
        data: { id: "new-profile-id" },
      });
      expect(prisma.profile.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          coverLetters: {
            create: [
              { title: "New CL", content: "Content for the new cover letter here." },
            ],
          },
        },
      });
      expect(prisma.coverLetter.create).not.toHaveBeenCalled();
    });

    it("should return error when title already exists", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.findFirst as any).mockResolvedValue(
        mockCoverLetter,
      );

      const result = await createCoverLetter(
        "My Cover Letter",
        "Some content for the cover letter.",
      );

      expect(result).toEqual({
        success: false,
        message: "Cover letter title already exists!",
      });
      expect(prisma.coverLetter.create).not.toHaveBeenCalled();
      expect(prisma.profile.create).not.toHaveBeenCalled();
    });

    it("should check title case-insensitively with trimming", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.findFirst as any).mockResolvedValue(null);
      (prisma.profile.findFirst as any).mockResolvedValue({
        id: "profile-id",
      });
      (prisma.coverLetter.create as any).mockResolvedValue(
        mockCoverLetter,
      );

      await createCoverLetter(
        "  My Cover Letter  ",
        "This is the content of my cover letter for the position.",
      );

      expect(prisma.coverLetter.findFirst).toHaveBeenCalledWith({
        where: {
          title: "my cover letter",
          profile: { userId: mockUser.id },
        },
      });
    });

    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as any).mockResolvedValue(null);

      const result = await createCoverLetter("Title", "Some content here.");

      expect(result).toEqual({
        success: false,
        message: "Not authenticated",
      });
    });

    it("should handle database errors", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.findFirst as any).mockRejectedValue(
        new Error("Database error"),
      );

      const result = await createCoverLetter("Title", "Some content here.");

      expect(result).toEqual({
        success: false,
        message: "Database error",
      });
    });
  });

  describe("updateCoverLetter", () => {
    it("should update a cover letter successfully", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      const updated = { ...mockCoverLetter, title: "Updated Title" };
      (prisma.coverLetter.update as any).mockResolvedValue(updated);

      const result = await updateCoverLetter(
        "cl-id",
        "Updated Title",
        "Updated content for the cover letter.",
      );

      expect(result).toEqual({
        success: true,
        data: updated,
      });
      expect(prisma.coverLetter.update).toHaveBeenCalledWith({
        where: { id: "cl-id", profile: { userId: "user-id" } },
        data: { title: "Updated Title", content: "Updated content for the cover letter." },
      });
    });

    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as any).mockResolvedValue(null);

      const result = await updateCoverLetter("cl-id", "Title", "Content");

      expect(result).toEqual({
        success: false,
        message: "Not authenticated",
      });
    });

    it("should handle database errors", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.update as any).mockRejectedValue(
        new Error("Database error"),
      );

      const result = await updateCoverLetter("cl-id", "Title", "Content");

      expect(result).toEqual({
        success: false,
        message: "Database error",
      });
    });
  });

  describe("deleteCoverLetterById", () => {
    it("should delete a cover letter successfully", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.delete as any).mockResolvedValue(
        mockCoverLetter,
      );

      const result = await deleteCoverLetterById("cl-id");

      expect(result).toEqual({ success: true });
      expect(prisma.coverLetter.delete).toHaveBeenCalledWith({
        where: { id: "cl-id", profile: { userId: "user-id" } },
      });
    });

    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as any).mockResolvedValue(null);

      const result = await deleteCoverLetterById("cl-id");

      expect(result).toEqual({
        success: false,
        message: "Not authenticated",
      });
    });

    it("should handle database errors", async () => {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.coverLetter.delete as any).mockRejectedValue(
        new Error("Database error"),
      );

      const result = await deleteCoverLetterById("cl-id");

      expect(result).toEqual({
        success: false,
        message: "Database error",
      });
    });
  });

  describe("generateColdEmail — edge cases", () => {
    function setupHappyPath() {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.profile.findFirst as any).mockResolvedValue({ id: "profile-1", userId: "user-id" });
      (getJobDetails as any).mockResolvedValue({
        success: true,
        job: {
          id: "job-1",
          resumeId: null,
          Company: { label: "Nordwind" },
          JobTitle: { label: "Backend Engineer" },
        },
      });
      (prisma.user.findUnique as any).mockResolvedValue({ defaultResumeId: "resume-1" });
      (getResumeById as any).mockResolvedValue({ success: true, data: { id: "resume-1", title: "My Resume" } });
      preprocessResumeMock.mockResolvedValue({
        success: true,
        data: { normalizedText: "Resume text with Node.js experience." },
      });
      preprocessJobMock.mockResolvedValue({
        success: true,
        data: { normalizedText: "Job text for Backend Engineer role." },
      });
      (prisma.userSettings.findUnique as any).mockResolvedValue(null);
      getModelMock.mockResolvedValue({ modelId: "mock-model" });
      resolveJobLanguageMock.mockResolvedValue("en");
      checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 4, resetIn: 60000 });
      generateVerifiedContentMock.mockResolvedValue({
        content: "Generated email body.",
        verified: true,
        unsupportedClaims: [],
        attempts: 1,
        warning: null,
      });
      (prisma.coldEmail.create as any).mockResolvedValue({ id: "email-1", content: "Generated email body." });
      (prisma.job.update as any).mockResolvedValue({});
    }

    beforeEach(() => {
      vi.clearAllMocks();
      setupHappyPath();
    });

    it("succeeds on the happy path", async () => {
      const result = await generateColdEmail("profile-1", "job-1");
      expect(result.success).toBe(true);
      expect(result.content).toBe("Generated email body.");
    });

    it("still defaults to Ollama (unaffected by the Gemini default added for cover letter/summary)", async () => {
      await generateColdEmail("profile-1", "job-1");
      expect(getModelMock).toHaveBeenCalledWith("ollama", DEFAULT_OLLAMA_MODEL, "user-id");
    });

    it("fails cleanly when the job is not found", async () => {
      (getJobDetails as any).mockResolvedValue({ success: false, job: null });
      const result = await generateColdEmail("profile-1", "job-1");
      expect(result.success).toBe(false);
    });

    it("rejects with a clear message when the user is rate limited, without calling the model", async () => {
      checkRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetIn: 42000 });
      const result = await generateColdEmail("profile-1", "job-1");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/too many ai requests/i);
      expect(generateVerifiedContentMock).not.toHaveBeenCalled();
    });

    it("fails cleanly when no resume can be resolved at all (job/user/profile all empty)", async () => {
      (getJobDetails as any).mockResolvedValue({
        success: true,
        job: { id: "job-1", resumeId: null, Company: { label: "Nordwind" }, JobTitle: { label: "BE" } },
      });
      (prisma.user.findUnique as any).mockResolvedValue({ defaultResumeId: null });
      (prisma.resume.findFirst as any).mockResolvedValue(null); // no fallback resume in profile either

      const result = await generateColdEmail("profile-1", "job-1");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no resume/i);
      expect(generateVerifiedContentMock).not.toHaveBeenCalled();
    });

    it("falls back to the most recent profile resume when job and user default are both empty", async () => {
      (getJobDetails as any).mockResolvedValue({
        success: true,
        job: { id: "job-1", resumeId: null, Company: { label: "Nordwind" }, JobTitle: { label: "BE" } },
      });
      (prisma.user.findUnique as any).mockResolvedValue({ defaultResumeId: null });
      (prisma.resume.findFirst as any).mockResolvedValue({ id: "fallback-resume" });

      const result = await generateColdEmail("profile-1", "job-1");
      expect(result.success).toBe(true);
      expect(getResumeById).toHaveBeenCalledWith("fallback-resume");
    });

    it("fails cleanly when the resume text is too short/minimal to pass preprocessing", async () => {
      preprocessResumeMock.mockResolvedValue({
        success: false,
        error: { code: "TOO_SHORT", message: "Resume is too short. Found 12 characters, minimum required: 200 characters." },
      });
      const result = await generateColdEmail("profile-1", "job-1");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/too short/i);
      expect(generateVerifiedContentMock).not.toHaveBeenCalled();
    });

    it("routes to the German prompt pair when resolveJobLanguage returns 'de'", async () => {
      resolveJobLanguageMock.mockResolvedValue("de");
      await generateColdEmail("profile-1", "job-1");

      const callArgs = generateVerifiedContentMock.mock.calls[0][0];
      expect(callArgs.system).toBe("DE_SYSTEM");
      expect(callArgs.prompt).toContain("DE_PROMPT");
      expect(callArgs.language).toBe("de");
    });

    it("routes to the English prompt pair when resolveJobLanguage returns 'en'", async () => {
      resolveJobLanguageMock.mockResolvedValue("en");
      await generateColdEmail("profile-1", "job-1");

      const callArgs = generateVerifiedContentMock.mock.calls[0][0];
      expect(callArgs.system).toBe("EN_SYSTEM");
      expect(callArgs.prompt).toContain("EN_PROMPT");
      expect(callArgs.language).toBe("en");
    });

    it("resolves language via the job's persisted field/detection, passing the job and job text through", async () => {
      await generateColdEmail("profile-1", "job-1");

      expect(resolveJobLanguageMock).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ id: "job-1" }),
        "Job text for Backend Engineer role.",
      );
    });

    it("does not re-detect language when the job already has one persisted — reuses whatever resolveJobLanguage returns", async () => {
      (getJobDetails as any).mockResolvedValue({
        success: true,
        job: {
          id: "job-1",
          resumeId: null,
          language: "de", // already persisted from a prior scoring/generation
          Company: { label: "Nordwind" },
          JobTitle: { label: "Backend Engineer" },
        },
      });
      resolveJobLanguageMock.mockResolvedValue("de");

      const result = await generateColdEmail("profile-1", "job-1");

      expect(result.success).toBe(true);
      const callArgs = generateVerifiedContentMock.mock.calls[0][0];
      expect(callArgs.language).toBe("de");
      // The persisted job (with language: "de") is what got passed in —
      // resolveJobLanguage owns whether to re-detect or trust it.
      expect(resolveJobLanguageMock).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ language: "de" }),
        expect.any(String),
      );
    });

    it("truncates very long resume/job text before handing it to generateVerifiedContent (Ollama provider)", async () => {
      preprocessResumeMock.mockResolvedValue({
        success: true,
        data: { normalizedText: "R".repeat(5000) },
      });
      preprocessJobMock.mockResolvedValue({
        success: true,
        data: { normalizedText: "J".repeat(5000) },
      });
      (prisma.userSettings.findUnique as any).mockResolvedValue({
        settings: JSON.stringify({ ai: { provider: "ollama", model: "llama3.1" } }),
      });

      await generateColdEmail("profile-1", "job-1");

      const callArgs = generateVerifiedContentMock.mock.calls[0][0];
      // TEXT_LIMITS.OLLAMA.RESUME/JOB are 1500/1200 — both inputs are 5000
      // chars, so both must have been truncated well below that.
      expect(callArgs.facts.resumeText.length).toBeLessThan(2000);
      expect(callArgs.facts.jobText.length).toBeLessThan(2000);
    });

    it("surfaces the warning from generateVerifiedContent to the caller without discarding content", async () => {
      generateVerifiedContentMock.mockResolvedValue({
        content: "Flagged content.",
        verified: false,
        unsupportedClaims: ["fake claim"],
        attempts: 2,
        warning: "Please review before sending.",
      });
      const result = await generateColdEmail("profile-1", "job-1");
      expect(result.success).toBe(true);
      expect(result.content).toBe("Flagged content.");
      expect(result.warning).toBe("Please review before sending.");
    });

    it("handles two rapid duplicate calls without throwing, each producing its own ColdEmail row", async () => {
      let createCount = 0;
      (prisma.coldEmail.create as any).mockImplementation(async () => {
        createCount += 1;
        return { id: `email-${createCount}`, content: "Generated email body." };
      });

      const [r1, r2] = await Promise.all([
        generateColdEmail("profile-1", "job-1"),
        generateColdEmail("profile-1", "job-1"),
      ]);

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(prisma.coldEmail.create).toHaveBeenCalledTimes(2);
      expect(prisma.job.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("generateCoverLetter — edge cases", () => {
    function setupHappyPath() {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.profile.findFirst as any).mockResolvedValue({ id: "profile-1", userId: "user-id" });
      (getJobDetailsMock as any).mockResolvedValue({
        success: true,
        job: {
          id: "job-1",
          resumeId: null,
          Company: { label: "Nordwind" },
          JobTitle: { label: "Backend Engineer" },
        },
      });
      (prisma.user.findUnique as any).mockResolvedValue({ defaultResumeId: "resume-1" });
      (getResumeById as any).mockResolvedValue({ success: true, data: { id: "resume-1", title: "My Resume" } });
      preprocessResumeMock.mockResolvedValue({
        success: true,
        data: { normalizedText: "Resume text with Node.js experience." },
      });
      preprocessJobMock.mockResolvedValue({
        success: true,
        data: { normalizedText: "Job text for Backend Engineer role." },
      });
      (prisma.userSettings.findUnique as any).mockResolvedValue(null);
      getModelMock.mockResolvedValue({ modelId: "mock-model" });
      resolveJobLanguageMock.mockResolvedValue("en");
      checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 4, resetIn: 60000 });
      generateVerifiedContentMock.mockResolvedValue({
        content: "Generated cover letter body.",
        verified: true,
        unsupportedClaims: [],
        attempts: 1,
        warning: null,
      });
      (prisma.coverLetter.create as any).mockResolvedValue({ id: "cl-1", content: "Generated cover letter body." });
      (prisma.job.update as any).mockResolvedValue({});
    }

    beforeEach(() => {
      vi.clearAllMocks();
      setupHappyPath();
    });

    it("succeeds on the happy path, saving and linking a CoverLetter", async () => {
      const result = await generateCoverLetter("profile-1", "job-1");
      expect(result.success).toBe(true);
      expect(result.content).toBe("Generated cover letter body.");
      expect(prisma.coverLetter.create).toHaveBeenCalledWith({
        data: { profileId: "profile-1", title: "Nordwind - Backend Engineer", content: "Generated cover letter body." },
      });
      expect(prisma.job.update).toHaveBeenCalledWith({
        where: { id: "job-1", userId: "user-id" },
        data: { coverLetterId: "cl-1" },
      });
    });

    it("rejects with a clear message when the user is rate limited, without calling the model", async () => {
      checkRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetIn: 42000 });
      const result = await generateCoverLetter("profile-1", "job-1");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/too many ai requests/i);
      expect(generateVerifiedContentMock).not.toHaveBeenCalled();
    });

    it("defaults to Gemini when the user has no saved AI settings", async () => {
      (prisma.userSettings.findUnique as any).mockResolvedValue(null);
      await generateCoverLetter("profile-1", "job-1");
      expect(getModelMock).toHaveBeenCalledWith("gemini", DEFAULT_GEMINI_MODEL, "user-id");
    });

    it("uses the user's saved Ollama preference instead of the Gemini default", async () => {
      (prisma.userSettings.findUnique as any).mockResolvedValue({
        settings: JSON.stringify({ ai: { provider: "ollama", model: "llama3.2:3b" } }),
      });
      await generateCoverLetter("profile-1", "job-1");
      expect(getModelMock).toHaveBeenCalledWith("ollama", "llama3.2:3b", "user-id");
    });

    it("falls back to the Ollama default model when a saved Ollama preference omits the model", async () => {
      (prisma.userSettings.findUnique as any).mockResolvedValue({
        settings: JSON.stringify({ ai: { provider: "ollama" } }),
      });
      await generateCoverLetter("profile-1", "job-1");
      expect(getModelMock).toHaveBeenCalledWith("ollama", DEFAULT_OLLAMA_MODEL, "user-id");
    });

    it("fails cleanly when no resume can be resolved", async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ defaultResumeId: null });
      (prisma.resume.findFirst as any).mockResolvedValue(null);

      const result = await generateCoverLetter("profile-1", "job-1");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no resume/i);
      expect(generateVerifiedContentMock).not.toHaveBeenCalled();
    });

    it("routes to the German cover-letter prompt pair when resolveJobLanguage returns 'de'", async () => {
      resolveJobLanguageMock.mockResolvedValue("de");
      await generateCoverLetter("profile-1", "job-1");

      const callArgs = generateVerifiedContentMock.mock.calls[0][0];
      expect(callArgs.system).toBe("CL_DE_SYSTEM");
      expect(callArgs.prompt).toContain("CL_DE_PROMPT");
      expect(callArgs.language).toBe("de");
    });

    it("routes to the English cover-letter prompt pair when resolveJobLanguage returns 'en'", async () => {
      const result = await generateCoverLetter("profile-1", "job-1");
      expect(result.success).toBe(true);

      const callArgs = generateVerifiedContentMock.mock.calls[0][0];
      expect(callArgs.system).toBe("CL_EN_SYSTEM");
      expect(callArgs.prompt).toContain("CL_EN_PROMPT");
      expect(callArgs.language).toBe("en");
    });

    it("surfaces the warning from generateVerifiedContent without discarding content", async () => {
      generateVerifiedContentMock.mockResolvedValue({
        content: "Flagged letter content.",
        verified: false,
        unsupportedClaims: ["fake claim"],
        attempts: 2,
        warning: "Please review before sending.",
      });
      const result = await generateCoverLetter("profile-1", "job-1");
      expect(result.success).toBe(true);
      expect(result.content).toBe("Flagged letter content.");
      expect(result.warning).toBe("Please review before sending.");
    });
  });

  describe("generateTailoredSummary — edge cases", () => {
    function setupHappyPath() {
      (getCurrentUser as any).mockResolvedValue(mockUser);
      (prisma.profile.findFirst as any).mockResolvedValue({ id: "profile-1", userId: "user-id" });
      (getJobDetailsMock as any).mockResolvedValue({
        success: true,
        job: {
          id: "job-1",
          resumeId: null,
          Company: { label: "Nordwind" },
          JobTitle: { label: "Backend Engineer" },
        },
      });
      (prisma.user.findUnique as any).mockResolvedValue({ defaultResumeId: "resume-1" });
      (getResumeById as any).mockResolvedValue({ success: true, data: { id: "resume-1", title: "My Resume" } });
      preprocessResumeMock.mockResolvedValue({
        success: true,
        data: { normalizedText: "Resume text with Node.js experience." },
      });
      preprocessJobMock.mockResolvedValue({
        success: true,
        data: { normalizedText: "Job text for Backend Engineer role." },
      });
      (prisma.userSettings.findUnique as any).mockResolvedValue(null);
      getModelMock.mockResolvedValue({ modelId: "mock-model" });
      resolveJobLanguageMock.mockResolvedValue("en");
      checkRateLimitMock.mockReturnValue({ allowed: true, remaining: 4, resetIn: 60000 });
      generateVerifiedContentMock.mockResolvedValue({
        content: "Backend engineer with Node.js experience relevant to this role.",
        verified: true,
        unsupportedClaims: [],
        attempts: 1,
        warning: null,
      });
      (prisma.job.update as any).mockResolvedValue({});
    }

    beforeEach(() => {
      vi.clearAllMocks();
      setupHappyPath();
    });

    it("succeeds on the happy path, saving the summary directly on the Job row (no separate document)", async () => {
      const result = await generateTailoredSummary("profile-1", "job-1");
      expect(result.success).toBe(true);
      expect(result.content).toBe("Backend engineer with Node.js experience relevant to this role.");
      expect(prisma.job.update).toHaveBeenCalledWith({
        where: { id: "job-1", userId: "user-id" },
        data: { tailoredSummary: "Backend engineer with Node.js experience relevant to this role." },
      });
    });

    it("rejects with a clear message when the user is rate limited, without calling the model", async () => {
      checkRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetIn: 42000 });
      const result = await generateTailoredSummary("profile-1", "job-1");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/too many ai requests/i);
      expect(generateVerifiedContentMock).not.toHaveBeenCalled();
    });

    it("defaults to Gemini when the user has no saved AI settings", async () => {
      (prisma.userSettings.findUnique as any).mockResolvedValue(null);
      await generateTailoredSummary("profile-1", "job-1");
      expect(getModelMock).toHaveBeenCalledWith("gemini", DEFAULT_GEMINI_MODEL, "user-id");
    });

    it("uses the user's saved Ollama preference instead of the Gemini default", async () => {
      (prisma.userSettings.findUnique as any).mockResolvedValue({
        settings: JSON.stringify({ ai: { provider: "ollama", model: "llama3.2:3b" } }),
      });
      await generateTailoredSummary("profile-1", "job-1");
      expect(getModelMock).toHaveBeenCalledWith("ollama", "llama3.2:3b", "user-id");
    });

    it("fails cleanly when no resume can be resolved", async () => {
      (prisma.user.findUnique as any).mockResolvedValue({ defaultResumeId: null });
      (prisma.resume.findFirst as any).mockResolvedValue(null);

      const result = await generateTailoredSummary("profile-1", "job-1");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no resume/i);
      expect(generateVerifiedContentMock).not.toHaveBeenCalled();
    });

    it("routes to the German tailored-summary prompt pair when resolveJobLanguage returns 'de'", async () => {
      resolveJobLanguageMock.mockResolvedValue("de");
      await generateTailoredSummary("profile-1", "job-1");

      const callArgs = generateVerifiedContentMock.mock.calls[0][0];
      expect(callArgs.system).toBe("SUMMARY_DE_SYSTEM");
      expect(callArgs.prompt).toBe("SUMMARY_DE_PROMPT");
      expect(callArgs.language).toBe("de");
    });

    it("routes to the English tailored-summary prompt pair when resolveJobLanguage returns 'en'", async () => {
      const result = await generateTailoredSummary("profile-1", "job-1");
      expect(result.success).toBe(true);

      const callArgs = generateVerifiedContentMock.mock.calls[0][0];
      expect(callArgs.system).toBe("SUMMARY_EN_SYSTEM");
      expect(callArgs.prompt).toBe("SUMMARY_EN_PROMPT");
      expect(callArgs.language).toBe("en");
    });

    it("surfaces the warning from generateVerifiedContent without discarding the summary", async () => {
      generateVerifiedContentMock.mockResolvedValue({
        content: "Flagged summary content.",
        verified: false,
        unsupportedClaims: ["fake claim"],
        attempts: 2,
        warning: "Please review before sending.",
      });
      const result = await generateTailoredSummary("profile-1", "job-1");
      expect(result.success).toBe(true);
      expect(result.content).toBe("Flagged summary content.");
      expect(result.warning).toBe("Please review before sending.");
    });
  });
});
