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
type StepState = { label: string; status: StepStatus; error?: string };

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
    updateStep(0, { status: "done" });

    updateStep(1, { status: "running" });
    const scoreResult = await scoreJob(jobId);
    if (!scoreResult.success) {
      updateStep(1, { status: "error", error: scoreResult.message });
      setRunning(false);
      return;
    }
    updateStep(1, { status: "done" });

    updateStep(2, { status: "running" });
    const summaryResult = await generateTailoredSummary(profileId, jobId);
    if (!summaryResult.success) {
      updateStep(2, { status: "error", error: summaryResult.message });
      setRunning(false);
      return;
    }
    updateStep(2, { status: "done" });

    updateStep(3, { status: "running" });
    const coverLetterResult = await generateCoverLetter(profileId, jobId);
    if (!coverLetterResult.success) {
      updateStep(3, { status: "error", error: coverLetterResult.message });
      setRunning(false);
      return;
    }
    updateStep(3, { status: "done" });

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
      updateStep(4, { status: "done" });
    }

    setRunning(false);
    router.refresh();
    toast({ variant: "success", description: "Generate All completed." });
  };

  const runningIndex = steps.findIndex((s) => s.status === "running");
  const errorIndex = steps.findIndex((s) => s.status === "error");
  const allSettled = steps.every((s) => s.status === "done" || s.status === "skipped");

  let headline: string;
  if (errorIndex !== -1) {
    headline = `Failed at step ${errorIndex + 1} of 5: ${steps[errorIndex].label}`;
  } else if (runningIndex !== -1) {
    headline = `Step ${runningIndex + 1} of 5: ${steps[runningIndex].label}...`;
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
