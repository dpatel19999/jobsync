import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { JobLanguageSelect } from "@/components/myjobs/JobLanguageSelect";

const mockUpdateJobLanguage = vi.fn();
vi.mock("@/actions/job.actions", () => ({
  updateJobLanguage: (...args: any[]) => mockUpdateJobLanguage(...args),
}));

const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: any[]) => mockToast(...args),
}));

// Radix Select relies on portals/pointer-capture APIs jsdom doesn't fully
// implement (same reason AddJob.spec.tsx mocks it out) — stub it down to a
// plain <select> so onValueChange can be driven directly and deterministically.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => (
    <select
      data-testid="language-select"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" disabled />
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectItem: ({ children, value }: any) => (
    <option value={value}>{children}</option>
  ),
}));

describe("JobLanguageSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with no value selected when the job has no detected language yet", () => {
    render(<JobLanguageSelect jobId="job-1" initialLanguage={null} />);
    expect(screen.getByTestId("language-select")).toHaveValue("");
  });

  it("renders the persisted language as the initial value", () => {
    render(<JobLanguageSelect jobId="job-1" initialLanguage="de" />);
    expect(screen.getByTestId("language-select")).toHaveValue("de");
  });

  it("overrides the language: calls updateJobLanguage and reflects the new value immediately", async () => {
    mockUpdateJobLanguage.mockResolvedValue({
      success: true,
      job: { id: "job-1", language: "de" },
    });
    render(<JobLanguageSelect jobId="job-1" initialLanguage="en" />);

    const select = screen.getByTestId("language-select");
    (select as HTMLSelectElement).value = "de";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => {
      expect(mockUpdateJobLanguage).toHaveBeenCalledWith("job-1", "de");
    });
    expect(select).toHaveValue("de");
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "success" }),
      );
    });
  });

  it("rolls back to the previous value and shows an error toast when the server rejects the override", async () => {
    mockUpdateJobLanguage.mockResolvedValue({
      success: false,
      message: "Failed to update job language.",
    });
    render(<JobLanguageSelect jobId="job-1" initialLanguage="en" />);

    const select = screen.getByTestId("language-select");
    (select as HTMLSelectElement).value = "de";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
    // Optimistic update reverted back to "en" after the rejection.
    expect(select).toHaveValue("en");
  });
});
