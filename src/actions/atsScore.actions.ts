"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { getCurrentUser } from "@/utils/user.utils";
import { generateText } from "ai";
import {
  getModel,
  preprocessResume,
  preprocessJob,
  ATS_KEYWORDS_SYSTEM_PROMPT,
  buildAtsKeywordsPrompt,
} from "@/lib/ai";
import { TEMPERATURES } from "@/lib/ai/config";
import { getResumeById } from "@/actions/profile.actions";
import { getJobDetails } from "@/actions/job.actions";
import { defaultUserSettings } from "@/models/userSettings.model";
import { scoreResumeAgainstKeywords } from "@/lib/ats";

export const getJobKeywords = async (jobId: string): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: user.id },
      select: { id: true },
    });
    if (!job) {
      throw new Error("Job not found");
    }

    const keywords = await prisma.jobKeyword.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });

    return { success: true, data: keywords };
  } catch (error) {
    const msg = "Failed to get job keywords.";
    return handleError(error, msg);
  }
};

// Extracts ATS keywords from the job description via the local/configured
// AI model (same non-streaming getModel + generateText convention as
// automation.actions.ts's analyzeDiscoveredJob). Replaces any previously
// *extracted* keywords but leaves manually-added ones untouched.
export const extractJobKeywords = async (jobId: string): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const { job, success: jobSuccess } = await getJobDetails(jobId);
    if (!jobSuccess || !job) {
      throw new Error("Job not found");
    }

    const jobPre = await preprocessJob(job);
    if (!jobPre.success) {
      throw new Error(jobPre.error.message);
    }

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });
    const ai = userSettings
      ? {
          ...defaultUserSettings.ai,
          ...(JSON.parse(userSettings.settings).ai ?? {}),
        }
      : defaultUserSettings.ai;

    const model = await getModel(ai.provider, ai.model || "llama3.2", user.id);

    const result = await generateText({
      model,
      system: ATS_KEYWORDS_SYSTEM_PROMPT,
      prompt: buildAtsKeywordsPrompt(jobPre.data.normalizedText),
      temperature: TEMPERATURES.ANALYSIS,
    });

    const keywords = result.text
      .split("\n")
      .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean);

    if (keywords.length === 0) {
      throw new Error("AI did not return any keywords");
    }

    await prisma.$transaction([
      prisma.jobKeyword.deleteMany({ where: { jobId, source: "extracted" } }),
      prisma.jobKeyword.createMany({
        data: keywords.map((text) => ({ jobId, text, source: "extracted" })),
      }),
    ]);

    const data = await prisma.jobKeyword.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });

    return { success: true, data };
  } catch (error) {
    const msg = "Failed to extract job keywords.";
    return handleError(error, msg);
  }
};

export const addJobKeyword = async (
  jobId: string,
  text: string,
): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const value = text.trim();
    if (!value) {
      throw new Error("Please provide a keyword");
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: user.id },
      select: { id: true },
    });
    if (!job) {
      throw new Error("Job not found");
    }

    const keyword = await prisma.jobKeyword.create({
      data: { jobId, text: value, source: "manual" },
    });

    return { success: true, data: keyword };
  } catch (error) {
    const msg = "Failed to add keyword.";
    return handleError(error, msg);
  }
};

export const removeJobKeyword = async (
  keywordId: string,
): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    await prisma.jobKeyword.delete({
      where: { id: keywordId, Job: { userId: user.id } },
    });

    return { success: true };
  } catch (error) {
    const msg = "Failed to remove keyword.";
    return handleError(error, msg);
  }
};

// Scores the job's current keyword list against a resume (job's own resume,
// else the user's default, else their most recent) using the language-
// agnostic EN/DE scoring core, and saves the result on the Job row.
export const scoreJob = async (jobId: string): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const { job, success: jobSuccess } = await getJobDetails(jobId);
    if (!jobSuccess || !job) {
      throw new Error("Job not found");
    }

    const keywords = await prisma.jobKeyword.findMany({ where: { jobId } });
    if (keywords.length === 0) {
      throw new Error("No keywords to score against. Extract or add keywords first.");
    }

    const userRow = await prisma.user.findUnique({
      where: { id: user.id },
      select: { defaultResumeId: true },
    });

    let resumeId: string | null = job.resumeId ?? userRow?.defaultResumeId ?? null;

    if (!resumeId) {
      const profile = await prisma.profile.findFirst({ where: { userId: user.id } });
      const fallbackResume = profile
        ? await prisma.resume.findFirst({
            where: { profileId: profile.id },
            orderBy: { createdAt: "desc" },
          })
        : null;
      resumeId = fallbackResume?.id ?? null;
    }

    if (!resumeId) {
      throw new Error(
        "No resume found to score. Attach a resume to this job or add one to your profile first.",
      );
    }

    const { data: resume, success: resumeSuccess } = await getResumeById(resumeId);
    if (!resumeSuccess || !resume) {
      throw new Error("Resume not found");
    }

    const resumePre = await preprocessResume(resume);
    if (!resumePre.success) {
      throw new Error(resumePre.error.message);
    }

    const jobPre = await preprocessJob(job);
    if (!jobPre.success) {
      throw new Error(jobPre.error.message);
    }

    const result = await scoreResumeAgainstKeywords(
      resumePre.data.normalizedText,
      keywords.map((k) => k.text),
      jobPre.data.normalizedText,
    );

    const atsScoreData = JSON.stringify({
      language: result.language,
      matched: result.matched,
      missing: result.missing,
      resumeId,
      resumeTitle: resume.title,
      scoredAt: new Date().toISOString(),
    });

    await prisma.job.update({
      where: { id: jobId, userId: user.id },
      data: { atsScore: result.score, atsScoreData },
    });

    return { success: true, score: result.score, data: JSON.parse(atsScoreData) };
  } catch (error) {
    const msg = "Failed to score job against keywords.";
    return handleError(error, msg);
  }
};
