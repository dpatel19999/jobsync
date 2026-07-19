"use client";
import { useState, useTransition } from "react";
import { Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { toast } from "../ui/use-toast";
import { updateJobLanguage } from "@/actions/job.actions";

type JobLanguageSelectProps = {
  jobId: string;
  initialLanguage?: "en" | "de" | null;
};

// Manual override for the language auto-detected on first cold-email
// generation / ATS scoring (persisted on Job.language). Detection can guess
// wrong on short or ambiguous job descriptions — this lets the user correct
// it, and every later generation/scoring call reuses the corrected value.
export function JobLanguageSelect({
  jobId,
  initialLanguage,
}: JobLanguageSelectProps) {
  const [language, setLanguage] = useState<"en" | "de" | null>(
    initialLanguage ?? null,
  );
  const [isPending, startTransition] = useTransition();

  const onChange = (value: string) => {
    if (value !== "en" && value !== "de") return;
    const previous = language;
    setLanguage(value);
    startTransition(async () => {
      const { success, message } = await updateJobLanguage(jobId, value);
      if (!success) {
        setLanguage(previous);
        toast({
          variant: "destructive",
          title: "Error!",
          description: message ?? "Failed to update job language.",
        });
        return;
      }
      toast({
        variant: "success",
        description: `Language set to ${value === "de" ? "German" : "English"} for this job's generated content.`,
      });
    });
  };

  return (
    <Select
      value={language ?? undefined}
      onValueChange={onChange}
      disabled={isPending}
    >
      <SelectTrigger
        className="h-8 w-[130px] gap-1 text-xs"
        aria-label="Job description language"
      >
        <Languages className="h-3.5 w-3.5 shrink-0" />
        <SelectValue placeholder="Not detected" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="de">German</SelectItem>
      </SelectContent>
    </Select>
  );
}
