"use client";
import { useState, useTransition } from "react";
import { Loader, FileText } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "../ui/use-toast";
import { generateCoverLetter } from "@/actions/coverLetter.actions";
import { getCurrentProfileId } from "@/actions/profile.actions";

type GenerateCoverLetterButtonProps = {
  jobId: string;
  existingContent?: string | null;
};

export function GenerateCoverLetterButton({
  jobId,
  existingContent,
}: GenerateCoverLetterButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [content, setContent] = useState<string | null>(
    existingContent ?? null
  );
  const [warning, setWarning] = useState<string | null>(null);

  const onGenerate = () => {
    startTransition(async () => {
      const profileId = await getCurrentProfileId();
      if (!profileId) {
        toast({
          variant: "destructive",
          title: "Error!",
          description:
            "Set up your profile with a resume before generating a cover letter.",
        });
        return;
      }

      const {
        success,
        message,
        content: generated,
        warning,
      } = await generateCoverLetter(profileId, jobId);

      if (!success) {
        toast({
          variant: "destructive",
          title: "Error!",
          description: message ?? "Failed to generate cover letter.",
        });
        return;
      }

      setContent(generated);
      setWarning(warning ?? null);
      setDialogOpen(true);

      if (warning) {
        toast({
          variant: "destructive",
          title: "Review before sending",
          description: warning,
        });
      } else {
        toast({
          variant: "success",
          description: "Cover letter generated and saved.",
        });
      }
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1 cursor-pointer"
        onClick={onGenerate}
        disabled={isPending}
      >
        <FileText className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
          Generate Cover Letter
        </span>
        {isPending && <Loader className="h-4 w-4 shrink-0 spinner" />}
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="lg:max-w-screen-md">
          <DialogHeader>
            <DialogTitle>Cover Letter</DialogTitle>
          </DialogHeader>
          {warning && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
              {warning}
            </p>
          )}
          <textarea
            readOnly
            value={content ?? ""}
            className="w-full min-h-[320px] rounded-md border border-input bg-background p-3 text-sm"
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
