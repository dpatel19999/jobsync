"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { getCurrentUser } from "@/utils/user.utils";
import { APP_CONSTANTS } from "@/lib/constants";
import {
  getModel,
  preprocessResume,
  preprocessJob,
  COLD_EMAIL_SYSTEM_PROMPT,
  buildColdEmailPrompt,
  COLD_EMAIL_SYSTEM_PROMPT_DE,
  buildColdEmailPromptDe,
  generateVerifiedContent,
  detectAtsLanguage,
} from "@/lib/ai";
import { TEMPERATURES, truncateForProvider } from "@/lib/ai/config";
import { getResumeById } from "@/actions/profile.actions";
import { getJobDetails } from "@/actions/job.actions";
import { defaultUserSettings } from "@/models/userSettings.model";

export const getCoverLetterList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE
): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.coverLetter.findMany({
        where: {
          profile: {
            userId: user.id,
          },
        },
        skip,
        take: limit,
        select: {
          id: true,
          profileId: true,
          title: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              Job: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.coverLetter.count({
        where: {
          profile: {
            userId: user.id,
          },
        },
      }),
    ]);
    return { data, total, success: true };
  } catch (error) {
    const msg = "Failed to get cover letter list.";
    return handleError(error, msg);
  }
};

export const createCoverLetter = async (
  title: string,
  content: string
): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const value = title.trim().toLowerCase();
    const titleExists = await prisma.coverLetter.findFirst({
      where: {
        title: value,
        profile: {
          userId: user.id,
        },
      },
    });

    if (titleExists) {
      throw new Error("Cover letter title already exists!");
    }

    const profile = await prisma.profile.findFirst({
      where: {
        userId: user.id,
      },
    });

    const res = profile?.id
      ? await prisma.coverLetter.create({
          data: {
            profileId: profile.id,
            title,
            content,
          },
        })
      : await prisma.profile.create({
          data: {
            userId: user.id,
            coverLetters: {
              create: [{ title, content }],
            },
          },
        });

    return { success: true, data: res };
  } catch (error) {
    const msg = "Failed to create cover letter.";
    return handleError(error, msg);
  }
};

export const updateCoverLetter = async (
  id: string,
  title: string,
  content: string
): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const res = await prisma.coverLetter.update({
      where: { id, profile: { userId: user.id } },
      data: { title, content },
    });

    return { success: true, data: res };
  } catch (error) {
    const msg = "Failed to update cover letter.";
    return handleError(error, msg);
  }
};

export const deleteCoverLetterById = async (
  coverLetterId: string
): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    await prisma.coverLetter.delete({
      where: { id: coverLetterId, profile: { userId: user.id } },
    });

    return { success: true };
  } catch (error) {
    const msg = "Failed to delete cover letter.";
    return handleError(error, msg);
  }
};

// Generates a short cold email for a specific job, from the same resume/profile
// data the cover letter flow uses, then saves it as a ColdEmail linked to the job.
// Uses generateVerifiedContent (src/lib/ai/guardrails) instead of calling
// generateText directly, so the factual-accuracy + natural-writing guardrails
// apply the same way any other generation feature would use them.
export const generateColdEmail = async (
  profileId: string,
  jobId: string
): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const profile = await prisma.profile.findFirst({
      where: { id: profileId, userId: user.id },
    });
    if (!profile) {
      throw new Error("Profile not found");
    }

    const { job, success: jobSuccess } = await getJobDetails(jobId);
    if (!jobSuccess || !job) {
      throw new Error("Job not found");
    }

    const userRow = await prisma.user.findUnique({
      where: { id: user.id },
      select: { defaultResumeId: true },
    });

    let resumeId: string | null =
      job.resumeId ?? userRow?.defaultResumeId ?? null;

    if (!resumeId) {
      const fallbackResume = await prisma.resume.findFirst({
        where: { profileId },
        orderBy: { createdAt: "desc" },
      });
      resumeId = fallbackResume?.id ?? null;
    }

    if (!resumeId) {
      throw new Error(
        "No resume found to generate a cold email from. Attach a resume to this job or add one to your profile first."
      );
    }

    const { data: resume, success: resumeSuccess } = await getResumeById(
      resumeId
    );
    if (!resumeSuccess || !resume) {
      throw new Error("Resume not found");
    }

    const [resumePre, jobPre] = await Promise.all([
      preprocessResume(resume),
      preprocessJob(job),
    ]);

    if (!resumePre.success) {
      throw new Error(resumePre.error.message);
    }
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

    const companyName = job.Company?.label ?? "the company";

    // Fresh EN/DE detection from the job description text, reusing the ATS
    // module's detector rather than a persisted Job.region/language field
    // (see DECISIONS.md — deferred pending a UX decision on a user-facing
    // language override).
    const language = detectAtsLanguage(jobPre.data.normalizedText);

    // TEXT_LIMITS existed but was never wired in anywhere — long resumes/JDs
    // were going to the model uncapped. Truncate here, provider-aware.
    const resumeText = truncateForProvider(resumePre.data.normalizedText, ai.provider, "RESUME");
    const jobText = truncateForProvider(jobPre.data.normalizedText, ai.provider, "JOB");

    const { content, warning } = await generateVerifiedContent({
      model,
      system: language === "de" ? COLD_EMAIL_SYSTEM_PROMPT_DE : COLD_EMAIL_SYSTEM_PROMPT,
      prompt:
        language === "de"
          ? buildColdEmailPromptDe(resumeText, jobText, companyName)
          : buildColdEmailPrompt(resumeText, jobText, companyName),
      temperature: TEMPERATURES.FEEDBACK,
      facts: {
        resumeText,
        jobText,
      },
      language,
    });

    const title = `${companyName} - ${job.JobTitle?.label ?? "Cold Email"}`;

    const coldEmail = await prisma.coldEmail.create({
      data: { profileId, title, content },
    });

    await prisma.job.update({
      where: { id: jobId, userId: user.id },
      data: { coldEmailId: coldEmail.id },
    });

    return { success: true, data: coldEmail, content, warning };
  } catch (error) {
    const msg = "Failed to generate cold email.";
    return handleError(error, msg);
  }
};
