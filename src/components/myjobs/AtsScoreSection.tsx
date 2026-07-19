"use client";
import { useMemo, useState, useTransition } from "react";
import { Loader, ListChecks, Plus, X, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "../ui/use-toast";
import { CircularScore } from "@/components/CircularScore";
import {
  extractJobKeywords,
  addJobKeyword,
  removeJobKeyword,
  scoreJob,
} from "@/actions/atsScore.actions";
import type { AtsScoreData, JobKeyword } from "@/models/job.model";

type AtsScoreSectionProps = {
  jobId: string;
  initialKeywords: JobKeyword[];
  initialScore?: number | null;
  initialScoreData?: string | null;
};

export function AtsScoreSection({
  jobId,
  initialKeywords,
  initialScore,
  initialScoreData,
}: AtsScoreSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [keywords, setKeywords] = useState<JobKeyword[]>(initialKeywords ?? []);
  const [newKeyword, setNewKeyword] = useState("");
  const [score, setScore] = useState<number | null>(initialScore ?? null);
  const [scoreData, setScoreData] = useState<AtsScoreData | null>(
    initialScoreData ? JSON.parse(initialScoreData) : null,
  );
  const [isExtracting, startExtracting] = useTransition();
  const [isScoring, startScoring] = useTransition();
  const [isAdding, startAdding] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const matchedTexts = useMemo(
    () => new Set(scoreData?.matched.map((m) => m.keyword) ?? []),
    [scoreData],
  );
  const missingTexts = useMemo(
    () => new Set(scoreData?.missing.map((m) => m.keyword) ?? []),
    [scoreData],
  );

  const onExtract = () => {
    startExtracting(async () => {
      const { success, message, data, usedOfflineFallback } = await extractJobKeywords(jobId);
      if (!success) {
        toast({
          variant: "destructive",
          title: "Error!",
          description: message ?? "Failed to extract keywords.",
        });
        return;
      }
      setKeywords(data);
      toast({
        variant: "success",
        description: usedOfflineFallback
          ? "Keywords extracted. Using offline mode — Gemini quota reached."
          : "Keywords extracted.",
      });
    });
  };

  const onScore = () => {
    startScoring(async () => {
      const { success, message, data, score: newScore } = await scoreJob(jobId);
      if (!success) {
        toast({
          variant: "destructive",
          title: "Error!",
          description: message ?? "Failed to score resume.",
        });
        return;
      }
      setScore(newScore);
      setScoreData(data);
      toast({ variant: "success", description: `ATS match: ${newScore}%` });
    });
  };

  const onAddKeyword = () => {
    const value = newKeyword.trim();
    if (!value) return;
    startAdding(async () => {
      const { success, message, data } = await addJobKeyword(jobId, value);
      if (!success) {
        toast({
          variant: "destructive",
          title: "Error!",
          description: message ?? "Failed to add keyword.",
        });
        return;
      }
      setKeywords((prev) => [...prev, data]);
      setNewKeyword("");
    });
  };

  const onRemoveKeyword = (keywordId: string) => {
    setRemovingId(keywordId);
    removeJobKeyword(keywordId).then(({ success, message }) => {
      setRemovingId(null);
      if (!success) {
        toast({
          variant: "destructive",
          title: "Error!",
          description: message ?? "Failed to remove keyword.",
        });
        return;
      }
      setKeywords((prev) => prev.filter((k) => k.id !== keywordId));
    });
  };

  const keywordBadgeVariant = (text: string) => {
    if (matchedTexts.has(text)) return "matched" as const;
    if (missingTexts.has(text)) return "missing" as const;
    return "neutral" as const;
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1 cursor-pointer"
        onClick={() => setDialogOpen(true)}
      >
        <ListChecks className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
          ATS Score{score != null ? `: ${score}%` : ""}
        </span>
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="lg:max-w-screen-md lg:max-h-screen overflow-y-scroll">
          <DialogHeader>
            <DialogTitle>ATS Keyword Score</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4">
            {score != null ? (
              <CircularScore score={score} size="md" />
            ) : (
              <span className="text-sm text-muted-foreground">
                Not scored yet.
              </span>
            )}
            {scoreData && (
              <span className="text-xs text-muted-foreground">
                Detected language: {scoreData.language === "de" ? "German" : "English"}
                <br />
                Scored against: {scoreData.resumeTitle}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onExtract}
                disabled={isExtracting}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                {keywords.length > 0 ? "Re-extract" : "Extract Keywords"}
                {isExtracting && <Loader className="h-4 w-4 shrink-0 spinner ml-1" />}
              </Button>
              <Button
                size="sm"
                onClick={onScore}
                disabled={isScoring || keywords.length === 0}
              >
                Score Resume
                {isScoring && <Loader className="h-4 w-4 shrink-0 spinner ml-1" />}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Add a keyword"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddKeyword();
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={onAddKeyword}
              disabled={isAdding || !newKeyword.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <ScrollArea className="max-h-[300px] mt-2">
            <div className="flex flex-wrap gap-2 p-1">
              {keywords.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  No keywords yet. Extract from the job description or add one above.
                </span>
              )}
              {keywords.map((k) => {
                const variant = keywordBadgeVariant(k.text);
                return (
                  <Badge
                    key={k.id}
                    variant={variant === "missing" ? "destructive" : "secondary"}
                    className={
                      variant === "matched"
                        ? "bg-green-600 hover:bg-green-600 text-white gap-1"
                        : "gap-1"
                    }
                  >
                    {k.text}
                    <button
                      type="button"
                      onClick={() => onRemoveKeyword(k.id)}
                      disabled={removingId === k.id}
                      className="ml-1 rounded-full hover:bg-black/10"
                      aria-label={`Remove ${k.text}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          </ScrollArea>

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
