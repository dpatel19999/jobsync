"use client";
import { useState, useTransition } from "react";
import { Loader, Wand2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "../ui/use-toast";
import { generateTailoredSummary } from "@/actions/coverLetter.actions";
import { getCurrentProfileId } from "@/actions/profile.actions";

type TailoredSummarySectionProps = {
  jobId: string;
  initialSummary?: string | null;
};

// Displays an editable (not read-only) tailored resume summary — the user
// tweaks the wording and copies it into their own resume manually. Nothing
// here ever writes back to the actual resume file.
export function TailoredSummarySection({
  jobId,
  initialSummary,
}: TailoredSummarySectionProps) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [summary, setSummary] = useState<string>(initialSummary ?? "");
  const [warning, setWarning] = useState<string | null>(null);

  const onGenerate = () => {
    startTransition(async () => {
      const profileId = await getCurrentProfileId();
      if (!profileId) {
        toast({
          variant: "destructive",
          title: "Error!",
          description:
            "Set up your profile with a resume before tailoring a summary.",
        });
        return;
      }

      const { success, message, content, warning } =
        await generateTailoredSummary(profileId, jobId);

      if (!success) {
        toast({
          variant: "destructive",
          title: "Error!",
          description: message ?? "Failed to generate tailored summary.",
        });
        return;
      }

      setSummary(content ?? "");
      setWarning(warning ?? null);
      setDialogOpen(true);

      if (warning) {
        toast({
          variant: "destructive",
          title: "Review before using",
          description: warning,
        });
      } else {
        toast({
          variant: "success",
          description: "Tailored summary generated and saved.",
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
        <Wand2 className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
          Tailor Resume Summary
        </span>
        {isPending && <Loader className="h-4 w-4 shrink-0 spinner" />}
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="lg:max-w-screen-md">
          <DialogHeader>
            <DialogTitle>Tailored Resume Summary</DialogTitle>
          </DialogHeader>
          {warning && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
              {warning}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Edit as needed, then copy this into your resume yourself — it is
            not written back to your resume automatically.
          </p>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full min-h-[120px] rounded-md border border-input bg-background p-3 text-sm"
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
