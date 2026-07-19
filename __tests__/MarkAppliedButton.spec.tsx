import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkAppliedButton } from "@/components/myjobs/MarkAppliedButton";

const mockToggleJobApplied = vi.fn();
vi.mock("@/actions/job.actions", () => ({
  toggleJobApplied: (...args: any[]) => mockToggleJobApplied(...args),
}));

const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: any[]) => mockToast(...args),
}));

describe("MarkAppliedButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Mark as Applied' when the job is not yet applied", () => {
    render(<MarkAppliedButton jobId="job-1" initialApplied={false} />);
    expect(
      screen.getByRole("button", { name: /mark as applied/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mark as applied/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("renders 'Applied' when the job is already applied", () => {
    render(<MarkAppliedButton jobId="job-1" initialApplied={true} />);
    expect(screen.getByRole("button", { name: /^applied$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("toggles to applied: calls toggleJobApplied(true) and flips the label optimistically", async () => {
    mockToggleJobApplied.mockResolvedValue({
      success: true,
      job: { id: "job-1", applied: true },
    });
    const user = userEvent.setup();
    render(<MarkAppliedButton jobId="job-1" initialApplied={false} />);

    await user.click(screen.getByRole("button", { name: /mark as applied/i }));

    expect(mockToggleJobApplied).toHaveBeenCalledWith("job-1", true);
    expect(
      await screen.findByRole("button", { name: /^applied$/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "success" }),
      );
    });
  });

  it("toggles back to not-applied: calls toggleJobApplied(false)", async () => {
    mockToggleJobApplied.mockResolvedValue({
      success: true,
      job: { id: "job-1", applied: false },
    });
    const user = userEvent.setup();
    render(<MarkAppliedButton jobId="job-1" initialApplied={true} />);

    await user.click(screen.getByRole("button", { name: /^applied$/i }));

    expect(mockToggleJobApplied).toHaveBeenCalledWith("job-1", false);
    expect(
      await screen.findByRole("button", { name: /mark as applied/i }),
    ).toBeInTheDocument();
  });

  it("rolls back and shows an error toast when the server rejects the toggle", async () => {
    mockToggleJobApplied.mockResolvedValue({
      success: false,
      message: "Failed to update applied status.",
    });
    const user = userEvent.setup();
    render(<MarkAppliedButton jobId="job-1" initialApplied={false} />);

    await user.click(screen.getByRole("button", { name: /mark as applied/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
    // Reverted back to the pre-toggle label after the rejection.
    expect(
      screen.getByRole("button", { name: /mark as applied/i }),
    ).toBeInTheDocument();
  });
});
