"use client";
import { useState, useTransition } from "react";
import { Loader, Mail } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "../ui/use-toast";
import { generateColdEmail } from "@/actions/coverLetter.actions";
import { getCurrentProfileId } from "@/actions/profile.actions";

type GenerateColdEmailButtonProps = {
  jobId: string;
  existingContent?: string | null;
};

export function GenerateColdEmailButton({
  jobId,
  existingContent,
}: GenerateColdEmailButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [content, setContent] = useState<string | null>(
    existingContent ?? null
  );

  const onGenerate = () => {
    startTransition(async () => {
      const profileId = await getCurrentProfileId();
      if (!profileId) {
        toast({
          variant: "destructive",
          title: "Error!",
          description:
            "Set up your profile with a resume before generating a cold email.",
        });
        return;
      }

      const { success, message, content: generated } = await generateColdEmail(
        profileId,
        jobId
      );

      if (!success) {
        toast({
          variant: "destructive",
          title: "Error!",
          description: message ?? "Failed to generate cold email.",
        });
        return;
      }

      setContent(generated);
      setDialogOpen(true);
      toast({
        variant: "success",
        description: "Cold email generated and saved.",
      });
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
        <Mail className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
          Generate Cold Email
        </span>
        {isPending && <Loader className="h-4 w-4 shrink-0 spinner" />}
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="lg:max-w-screen-md">
          <DialogHeader>
            <DialogTitle>Cold Email</DialogTitle>
          </DialogHeader>
          <textarea
            readOnly
            value={content ?? ""}
            className="w-full min-h-[220px] rounded-md border border-input bg-background p-3 text-sm"
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
