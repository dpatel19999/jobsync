"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, Loader, Sparkles, XCircle } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "../ui/use-toast";
import { extractJobKeywords, scoreJob } from "@/actions/atsScore.actions";
import {
  generateTailoredSummary,
  generateCoverLetter,
  generateColdEmail,
} from "@/actions/coverLetter.actions";
import { getCurrentProfileId } from "@/actions/profile.actions";

type StepStatus = "pending" | "running" | "done" | "error" | "skipped";
type StepState = { label: string; status: StepStatus; error?: string; note?: string };

const OFFLINE_FALLBACK_NOTE = "Using offline mode — Gemini quota reached.";

const STEP_LABELS = [
  "Extract ATS keywords",
  "Score resume against keywords",
  "Generate tailored summary",
  "Generate cover letter",
  "Generate cold email",
];

function initialSteps(): StepState[] {
  return STEP_LABELS.map((label) => ({ label, status: "pending" }));
}

type GenerateAllButtonProps = {
  jobId: string;
  hasColdEmail: boolean;
};

// Runs the five existing generation actions in sequence, purely as an
// orchestration convenience — no new guardrail/AI logic. Each action already
// persists its own result independently, so a failure partway through simply
// stops the sequence; whatever already succeeded stays saved (no rollback).
export function GenerateAllButton({ jobId, hasColdEmail }: GenerateAllButtonProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>(initialSteps());

  const updateStep = (index: number, patch: Partial<StepState>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const onGenerateAll = async () => {
    setSteps(initialSteps());
    setDialogOpen(true);
    setRunning(true);

    const profileId = await getCurrentProfileId();
    if (!profileId) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: "Set up your profile with a resume before generating.",
      });
      setRunning(false);
      return;
    }

    updateStep(0, { status: "running" });
    const keywordsResult = await extractJobKeywords(jobId);
    if (!keywordsResult.success) {
      updateStep(0, { status: "error", error: keywordsResult.message });
      setRunning(false);
      return;
    }
    updateStep(0, {
      status: "done",
      note: keywordsResult.usedOfflineFallback ? OFFLINE_FALLBACK_NOTE : undefined,
    });

    updateStep(1, { status: "running" });
    const scoreResult = await scoreJob(jobId);
    if (!scoreResult.success) {
      updateStep(1, { status: "error", error: scoreResult.message });
      setRunning(false);
      return;
    }
    updateStep(1, { status: "done" });

    // Tailored summary and cover letter don't depend on each other's output,
    // so they run concurrently — each still persists its own result
    // independently, so a failure in one doesn't lose the other's success.
    updateStep(2, { status: "running" });
    updateStep(3, { status: "running" });
    const [summaryResult, coverLetterResult] = await Promise.all([
      generateTailoredSummary(profileId, jobId),
      generateCoverLetter(profileId, jobId),
    ]);
    updateStep(
      2,
      summaryResult.success
        ? { status: "done", note: summaryResult.usedOfflineFallback ? OFFLINE_FALLBACK_NOTE : undefined }
        : { status: "error", error: summaryResult.message },
    );
    updateStep(
      3,
      coverLetterResult.success
        ? { status: "done", note: coverLetterResult.usedOfflineFallback ? OFFLINE_FALLBACK_NOTE : undefined }
        : { status: "error", error: coverLetterResult.message },
    );
    if (!summaryResult.success || !coverLetterResult.success) {
      setRunning(false);
      return;
    }

    let coldEmailUsedFallback = false;
    if (hasColdEmail) {
      updateStep(4, { status: "skipped" });
    } else {
      updateStep(4, { status: "running" });
      const coldEmailResult = await generateColdEmail(profileId, jobId);
      if (!coldEmailResult.success) {
        updateStep(4, { status: "error", error: coldEmailResult.message });
        setRunning(false);
        return;
      }
      coldEmailUsedFallback = !!coldEmailResult.usedOfflineFallback;
      updateStep(4, {
        status: "done",
        note: coldEmailUsedFallback ? OFFLINE_FALLBACK_NOTE : undefined,
      });
    }

    setRunning(false);
    router.refresh();
    const anyOffline =
      keywordsResult.usedOfflineFallback ||
      summaryResult.usedOfflineFallback ||
      coverLetterResult.usedOfflineFallback ||
      coldEmailUsedFallback;
    toast({
      variant: "success",
      description: anyOffline
        ? `Generate All completed. ${OFFLINE_FALLBACK_NOTE}`
        : "Generate All completed.",
    });
  };

  const runningIndices = steps.map((s, i) => i).filter((i) => steps[i].status === "running");
  const errorIndices = steps.map((s, i) => i).filter((i) => steps[i].status === "error");
  const allSettled = steps.every((s) => s.status === "done" || s.status === "skipped");

  let headline: string;
  if (errorIndices.length > 1) {
    headline = `Failed at steps ${errorIndices.map((i) => i + 1).join(" & ")} of 5: ${errorIndices.map((i) => steps[i].label).join(" + ")}`;
  } else if (errorIndices.length === 1) {
    headline = `Failed at step ${errorIndices[0] + 1} of 5: ${steps[errorIndices[0]].label}`;
  } else if (runningIndices.length > 1) {
    headline = `Steps ${runningIndices.map((i) => i + 1).join(" & ")} of 5: ${runningIndices.map((i) => steps[i].label).join(" + ")}...`;
  } else if (runningIndices.length === 1) {
    headline = `Step ${runningIndices[0] + 1} of 5: ${steps[runningIndices[0]].label}...`;
  } else if (allSettled) {
    headline = "All steps completed.";
  } else {
    headline = "Starting...";
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1 cursor-pointer"
        onClick={onGenerateAll}
        disabled={running}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
          Generate All
        </span>
        {running && <Loader className="h-4 w-4 shrink-0 spinner" />}
      </Button>
      <Dialog open={dialogOpen} onOpenChange={(open) => !running && setDialogOpen(open)}>
        <DialogContent className="lg:max-w-screen-sm">
          <DialogHeader>
            <DialogTitle>Generate All</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-medium" data-testid="generate-all-headline">
            {headline}
          </p>
          <ul className="space-y-2">
            {steps.map((step, i) => (
              <li key={step.label} className="flex items-start gap-2 text-sm">
                {step.status === "done" && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                )}
                {step.status === "running" && (
                  <Loader className="h-4 w-4 shrink-0 spinner" />
                )}
                {step.status === "error" && (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                )}
                {step.status === "skipped" && (
                  <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                {step.status === "pending" && (
                  <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                )}
                <div>
                  <div>
                    {i + 1}. {step.label}
                    {step.status === "skipped" && " (skipped — cold email already exists)"}
                  </div>
                  {step.error && (
                    <div className="text-xs text-destructive">{step.error}</div>
                  )}
                  {step.note && (
                    <div className="text-xs text-muted-foreground">{step.note}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={running}
              onClick={() => setDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
