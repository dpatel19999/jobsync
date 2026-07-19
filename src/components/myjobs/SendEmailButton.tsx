"use client";
import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "../ui/use-toast";
import { updateJobEmailTo } from "@/actions/job.actions";
import {
  buildDefaultEmailSubject,
  buildGmailComposeUrl,
} from "@/lib/gmail-compose";

type SendEmailButtonProps = {
  jobId: string;
  jobTitle?: string | null;
  senderName?: string | null;
  initialEmailTo?: string | null;
  initialBody?: string | null;
};

// v1 "Send Email": builds a Gmail compose-window deep link (no OAuth, no
// Gmail API — see DECISIONS.md) and opens it in a new tab. The user reviews
// and sends from inside their own logged-in Gmail.
export function SendEmailButton({
  jobId,
  jobTitle,
  senderName,
  initialEmailTo,
  initialBody,
}: SendEmailButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [to, setTo] = useState(initialEmailTo ?? "");
  const [subject, setSubject] = useState(
    buildDefaultEmailSubject(senderName, jobTitle),
  );
  const [body, setBody] = useState(initialBody ?? "");
  const [isPending, startTransition] = useTransition();

  const onSend = () => {
    const recipient = to.trim();
    if (!recipient) {
      toast({
        variant: "destructive",
        title: "Error!",
        description: "Enter a recipient email address first.",
      });
      return;
    }

    const url = buildGmailComposeUrl({ to: recipient, subject, body });
    window.open(url, "_blank", "noopener,noreferrer");
    setDialogOpen(false);
    toast({
      variant: "success",
      description: "Gmail compose window opened in a new tab.",
    });

    if (recipient !== (initialEmailTo ?? "")) {
      startTransition(async () => {
        await updateJobEmailTo(jobId, recipient);
      });
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1 cursor-pointer"
        onClick={() => setDialogOpen(true)}
      >
        <Send className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
          Send Email
        </span>
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="lg:max-w-screen-md">
          <DialogHeader>
            <DialogTitle>Send Email via Gmail</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="send-email-to">To</Label>
              <Input
                id="send-email-to"
                type="email"
                placeholder="recruiter@company.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="send-email-subject">Subject</Label>
              <Input
                id="send-email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="send-email-body">Body</Label>
              <textarea
                id="send-email-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full min-h-[220px] rounded-md border border-input bg-background p-3 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSend} disabled={isPending}>
              <Send className="mr-2 h-3.5 w-3.5" />
              Open in Gmail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
