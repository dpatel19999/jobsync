"use client";
import { useEffect, useState, useTransition } from "react";
import { Loader, FileEdit } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "../ui/use-toast";
import { rewriteResume } from "@/actions/resumeRewrite.actions";
import { getCurrentProfileId } from "@/actions/profile.actions";
import { getTemplateForJobLanguage } from "@/actions/templates.actions";
import { TemplateKind } from "@/models/template.model";
import { TemplateAvailabilityNote } from "./TemplateAvailabilityNote";

type RewriteResumeButtonProps = {
  jobId: string;
  language?: string | null;
  existingContent?: string | null;
};

// Replaces the old "Tailor Resume Summary" button: position-locked rewrite
// of the candidate's master resume template (not the structured Resume
// model) for one specific job. Only reworks wording — see
// resumeRewrite.actions.ts / position-lock.ts for the enforcement.
export function RewriteResumeButton({
  jobId,
  language,
  existingContent,
}: RewriteResumeButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [content, setContent] = useState<string | null>(existingContent ?? null);
  const [warning, setWarning] = useState<string | null>(null);
  const [templateAvailable, setTemplateAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!language) {
      setTemplateAvailable(null);
      return;
    }
    let cancelled = false;
    getTemplateForJobLanguage(TemplateKind.RESUME, language).then((result) => {
      if (cancelled) return;
      setTemplateAvailable(result.success ? !!result.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const onGenerate = () => {
    startTransition(async () => {
      const profileId = await getCurrentProfileId();
      if (!profileId) {
        toast({
          variant: "destructive",
          title: "Error!",
          description: "Set up your profile before rewriting your resume.",
        });
        return;
      }

      const {
        success,
        message,
        content: generated,
        warning,
        usedOfflineFallback,
      } = await rewriteResume(profileId, jobId);

      if (!success) {
        toast({
          variant: "destructive",
          title: "Error!",
          description: message ?? "Failed to rewrite resume.",
        });
        return;
      }

      setContent(generated);
      setWarning(warning ?? null);
      setDialogOpen(true);

      const offlineSuffix = usedOfflineFallback
        ? " Using offline mode — Gemini quota reached."
        : "";

      if (warning) {
        toast({
          variant: "destructive",
          title: "Review before using",
          description: warning + offlineSuffix,
        });
      } else {
        toast({
          variant: "success",
          description: "Resume rewritten and saved." + offlineSuffix,
        });
      }
    });
  };

  // Language is known and there's no matching template — don't offer a
  // button that can only fail; show why instead.
  if (language && templateAvailable === false) {
    return <TemplateAvailabilityNote kind={TemplateKind.RESUME} language={language} />;
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1 cursor-pointer"
        onClick={onGenerate}
        disabled={isPending}
      >
        <FileEdit className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
          Rewrite Resume
        </span>
        {isPending && <Loader className="h-4 w-4 shrink-0 spinner" />}
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="lg:max-w-screen-md">
          <DialogHeader>
            <DialogTitle>Rewritten Resume</DialogTitle>
          </DialogHeader>
          {warning && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
              {warning}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Reworded to match this job, with the same sections and structure
            as your master template. Review before using.
          </p>
          <textarea
            readOnly
            value={content ?? ""}
            className="w-full min-h-[400px] rounded-md border border-input bg-background p-3 text-sm font-mono"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
