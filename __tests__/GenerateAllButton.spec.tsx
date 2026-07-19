import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GenerateAllButton } from "@/components/myjobs/GenerateAllButton";

const mockExtractJobKeywords = vi.fn();
const mockScoreJob = vi.fn();
vi.mock("@/actions/atsScore.actions", () => ({
  extractJobKeywords: (...args: any[]) => mockExtractJobKeywords(...args),
  scoreJob: (...args: any[]) => mockScoreJob(...args),
}));

const mockGenerateTailoredSummary = vi.fn();
const mockGenerateCoverLetter = vi.fn();
const mockGenerateColdEmail = vi.fn();
vi.mock("@/actions/coverLetter.actions", () => ({
  generateTailoredSummary: (...args: any[]) => mockGenerateTailoredSummary(...args),
  generateCoverLetter: (...args: any[]) => mockGenerateCoverLetter(...args),
  generateColdEmail: (...args: any[]) => mockGenerateColdEmail(...args),
}));

const mockGetCurrentProfileId = vi.fn();
vi.mock("@/actions/profile.actions", () => ({
  getCurrentProfileId: (...args: any[]) => mockGetCurrentProfileId(...args),
}));

const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: any[]) => mockToast(...args),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// Radix Dialog needs these in jsdom (same stubs SendEmailButton.spec.tsx uses).
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

document.createRange = () => {
  const range = new Range();
  range.getBoundingClientRect = vi.fn().mockReturnValue({
    bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0,
  });
  range.getClientRects = () => ({
    item: () => null,
    length: 0,
    [Symbol.iterator]: vi.fn(),
  });
  return range;
};

function mockAllSucceed() {
  mockGetCurrentProfileId.mockResolvedValue("profile-1");
  mockExtractJobKeywords.mockResolvedValue({ success: true, data: [] });
  mockScoreJob.mockResolvedValue({ success: true, score: 80 });
  mockGenerateTailoredSummary.mockResolvedValue({ success: true, content: "Summary text." });
  mockGenerateCoverLetter.mockResolvedValue({ success: true, content: "Cover letter text." });
  mockGenerateColdEmail.mockResolvedValue({ success: true, content: "Cold email text." });
}

describe("GenerateAllButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs all five steps in order when no cold email exists yet, then refreshes and shows success", async () => {
    mockAllSucceed();
    const user = userEvent.setup();
    render(<GenerateAllButton jobId="job-1" hasColdEmail={false} />);

    await user.click(screen.getByRole("button", { name: /generate all/i }));

    await waitFor(() => {
      expect(screen.getByTestId("generate-all-headline")).toHaveTextContent(
        "All steps completed.",
      );
    });

    expect(mockExtractJobKeywords).toHaveBeenCalledWith("job-1");
    expect(mockScoreJob).toHaveBeenCalledWith("job-1");
    expect(mockGenerateTailoredSummary).toHaveBeenCalledWith("profile-1", "job-1");
    expect(mockGenerateCoverLetter).toHaveBeenCalledWith("profile-1", "job-1");
    expect(mockGenerateColdEmail).toHaveBeenCalledWith("profile-1", "job-1");

    // Order matters: keywords -> score -> summary -> cover letter -> cold email.
    const order = [
      mockExtractJobKeywords,
      mockScoreJob,
      mockGenerateTailoredSummary,
      mockGenerateCoverLetter,
      mockGenerateColdEmail,
    ].map((m) => m.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    expect(mockRefresh).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("shows a non-blocking offline-mode note when a step's result reports usedOfflineFallback, and mentions it in the final toast", async () => {
    mockAllSucceed();
    mockExtractJobKeywords.mockResolvedValue({ success: true, data: [], usedOfflineFallback: true });
    const user = userEvent.setup();
    render(<GenerateAllButton jobId="job-1" hasColdEmail={false} />);

    await user.click(screen.getByRole("button", { name: /generate all/i }));

    await waitFor(() => {
      expect(screen.getByTestId("generate-all-headline")).toHaveTextContent(
        "All steps completed.",
      );
    });

    expect(screen.getAllByText(/using offline mode.*gemini quota reached/i).length).toBeGreaterThan(0);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        description: expect.stringMatching(/using offline mode.*gemini quota reached/i),
      }),
    );
  });

  it("skips the cold email step (does not call generateColdEmail) when hasColdEmail is true", async () => {
    mockAllSucceed();
    const user = userEvent.setup();
    render(<GenerateAllButton jobId="job-1" hasColdEmail={true} />);

    await user.click(screen.getByRole("button", { name: /generate all/i }));

    await waitFor(() => {
      expect(screen.getByTestId("generate-all-headline")).toHaveTextContent(
        "All steps completed.",
      );
    });

    expect(mockGenerateCoverLetter).toHaveBeenCalled();
    expect(mockGenerateColdEmail).not.toHaveBeenCalled();
    expect(screen.getByText(/skipped — cold email already exists/i)).toBeInTheDocument();
  });

  it("stops after the parallel summary/cover-letter pair when one fails, keeping the other's success, and does not run the cold email step", async () => {
    mockAllSucceed();
    mockGenerateTailoredSummary.mockResolvedValue({
      success: false,
      message: "No resume found to tailor.",
    });
    const user = userEvent.setup();
    render(<GenerateAllButton jobId="job-1" hasColdEmail={false} />);

    await user.click(screen.getByRole("button", { name: /generate all/i }));

    await waitFor(() => {
      expect(screen.getByTestId("generate-all-headline")).toHaveTextContent(
        "Failed at step 3 of 5: Generate tailored summary",
      );
    });
    expect(screen.getByText("No resume found to tailor.")).toBeInTheDocument();

    // Steps 1 and 2 (keywords, score) ran. Cover letter runs concurrently
    // with the summary (not gated on its result) and succeeds; cold email
    // must not run since the pair didn't both succeed.
    expect(mockExtractJobKeywords).toHaveBeenCalled();
    expect(mockScoreJob).toHaveBeenCalled();
    expect(mockGenerateCoverLetter).toHaveBeenCalled();
    expect(mockGenerateColdEmail).not.toHaveBeenCalled();
  });

  it("runs tailored summary and cover letter concurrently, not waiting for one before starting the other", async () => {
    mockAllSucceed();
    let resolveSummary: (v: any) => void;
    let resolveCoverLetter: (v: any) => void;
    mockGenerateTailoredSummary.mockReturnValue(
      new Promise((resolve) => {
        resolveSummary = resolve;
      }),
    );
    mockGenerateCoverLetter.mockReturnValue(
      new Promise((resolve) => {
        resolveCoverLetter = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<GenerateAllButton jobId="job-1" hasColdEmail={false} />);
    await user.click(screen.getByRole("button", { name: /generate all/i }));

    // Both calls fire before either resolves — proves Promise.all, not a
    // sequential await between them.
    await waitFor(() => {
      expect(mockGenerateCoverLetter).toHaveBeenCalled();
    });
    expect(mockGenerateTailoredSummary).toHaveBeenCalled();

    resolveSummary!({ success: true, content: "Summary text." });
    resolveCoverLetter!({ success: true, content: "Cover letter text." });

    await waitFor(() => {
      expect(screen.getByTestId("generate-all-headline")).toHaveTextContent(
        "All steps completed.",
      );
    });
  });

  it("shows an error toast and runs nothing when no profile exists", async () => {
    mockGetCurrentProfileId.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<GenerateAllButton jobId="job-1" hasColdEmail={false} />);

    await user.click(screen.getByRole("button", { name: /generate all/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
    expect(mockExtractJobKeywords).not.toHaveBeenCalled();
  });
});
