"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { getCurrentUser } from "@/utils/user.utils";
import {
  preprocessJob,
  RESUME_REWRITE_SYSTEM_PROMPT,
  buildResumeRewritePrompt,
  RESUME_REWRITE_SYSTEM_PROMPT_DE,
  buildResumeRewritePromptDe,
  generateVerifiedContent,
  checkRateLimit,
  callWithGeminiFallback,
  checkPositionLock,
} from "@/lib/ai";
import { TEMPERATURES, truncateForProvider } from "@/lib/ai/config";
import { getJobDetails, resolveJobLanguage } from "@/actions/job.actions";
import {
  TemplateKind,
  languageToTemplateLanguage,
  templateSlotFor,
} from "@/models/template.model";
import { buildResumeDocumentName } from "@/lib/resume-naming";

// Rewrites the candidate's master resume template (Resume-EN or Resume-DE,
// picked by the job's language) for one specific job — position-locked: the
// AI may only reword existing sentences, never add/remove/reorder sections
// or bullets. Reads from MasterTemplate.extractedText (see
// templates.actions.ts), not the structured Resume/ResumeSection model that
// generateTailoredSummary used — that action is superseded by this one but
// left in place, unwired from the UI, so past generated summaries aren't
// lost. Runs through the same guardrail pipeline (generateVerifiedContent:
// factual-accuracy + writing-tells) as every other generation feature,
// unchanged, plus an additional position-lock structural check specific to
// this feature (see src/lib/ai/guardrails/position-lock.ts).
export const rewriteResume = async (
  profileId: string,
  jobId: string,
): Promise<any | undefined> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const rateLimit = checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      throw new Error(
        `Too many AI requests. Please wait ${Math.ceil(rateLimit.resetIn / 1000)} seconds and try again.`
      );
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

    const jobPre = await preprocessJob(job);
    if (!jobPre.success) {
      throw new Error(jobPre.error.message);
    }

    const language = await resolveJobLanguage(
      user.id,
      job,
      jobPre.data.normalizedText,
    );

    const templateLanguage = languageToTemplateLanguage(language);
    if (!templateLanguage) {
      throw new Error(
        "This job's language couldn't be determined yet — try again after it's detected (e.g. via ATS scoring)."
      );
    }

    const slot = templateSlotFor(TemplateKind.RESUME, templateLanguage);
    const template = await prisma.masterTemplate.findFirst({
      where: { userId: user.id, slot, isCurrent: true },
    });
    if (!template) {
      throw new Error(
        `No ${templateLanguage === "DE" ? "German" : "English"} resume template uploaded yet. Import one under Settings → Templates first.`
      );
    }

    const companyName = job.Company?.label ?? "the company";

    const { result, usedOfflineFallback } = await callWithGeminiFallback(
      user.id,
      async (model, provider) => {
        const templateText = truncateForProvider(
          template.extractedText,
          provider,
          "RESUME_REWRITE",
        );
        const jobText = truncateForProvider(jobPre.data.normalizedText, provider, "JOB");
        const verified = await generateVerifiedContent({
          model,
          system: language === "de" ? RESUME_REWRITE_SYSTEM_PROMPT_DE : RESUME_REWRITE_SYSTEM_PROMPT,
          prompt:
            language === "de"
              ? buildResumeRewritePromptDe(templateText, jobText)
              : buildResumeRewritePrompt(templateText, jobText),
          temperature: TEMPERATURES.FEEDBACK,
          facts: { resumeText: templateText, jobText },
          language,
        });
        return { ...verified, templateTextUsed: templateText };
      },
    );

    const { content, warning, templateTextUsed } = result;

    // Position-lock is checked against the text actually sent to the model
    // (post-truncation), not the raw stored template — the model can only
    // preserve blocks it actually received.
    const positionLock = checkPositionLock(templateTextUsed, content);
    const positionLockWarning = positionLock.matched
      ? null
      : `The rewritten resume's line structure doesn't match the template (template: ${positionLock.originalLineCount} lines, rewritten: ${positionLock.rewrittenLineCount} lines) — review carefully before using.`;
    const combinedWarning = [warning, positionLockWarning].filter(Boolean).join(" ") || null;

    const title = buildResumeDocumentName(companyName);

    const rewrittenResume = await prisma.rewrittenResume.create({
      data: { profileId, title, content, sourceTemplateId: template.id },
    });

    await prisma.job.update({
      where: { id: jobId, userId: user.id },
      data: { rewrittenResumeId: rewrittenResume.id },
    });

    return {
      success: true,
      data: rewrittenResume,
      content,
      warning: combinedWarning,
      usedOfflineFallback,
      positionLock,
    };
  } catch (error) {
    const msg = "Failed to rewrite resume.";
    return handleError(error, msg);
  }
};
