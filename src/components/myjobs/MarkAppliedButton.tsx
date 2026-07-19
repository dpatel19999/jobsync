"use client";
import { useState, useTransition } from "react";
import { Check, Loader } from "lucide-react";
import { Button } from "../ui/button";
import { toast } from "../ui/use-toast";
import { toggleJobApplied } from "@/actions/job.actions";

type MarkAppliedButtonProps = {
  jobId: string;
  initialApplied: boolean;
};

// Standalone quick-action toggle for Job.applied, separate from the full
// "Change status" dropdown (which also flips applied as a side effect of
// setting status to "applied"/"interview" — see updateJobStatus). This lets
// marking a job applied not require also changing its status.
export function MarkAppliedButton({
  jobId,
  initialApplied,
}: MarkAppliedButtonProps) {
  const [applied, setApplied] = useState(initialApplied);
  const [isPending, startTransition] = useTransition();

  const onToggle = () => {
    const next = !applied;
    const previous = applied;
    setApplied(next);
    startTransition(async () => {
      const { success, message } = await toggleJobApplied(jobId, next);
      if (!success) {
        setApplied(previous);
        toast({
          variant: "destructive",
          title: "Error!",
          description: message ?? "Failed to update applied status.",
        });
        return;
      }
      toast({
        variant: "success",
        description: next
          ? "Job marked as applied."
          : "Job marked as not applied.",
      });
    });
  };

  return (
    <Button
      size="sm"
      variant={applied ? "default" : "outline"}
      className="h-8 gap-1 cursor-pointer"
      onClick={onToggle}
      disabled={isPending}
      aria-pressed={applied}
    >
      {isPending ? (
        <Loader className="h-3.5 w-3.5 shrink-0 spinner" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
      <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
        {applied ? "Applied" : "Mark as Applied"}
      </span>
    </Button>
  );
}
