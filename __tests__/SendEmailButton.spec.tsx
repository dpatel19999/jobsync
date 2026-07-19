import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SendEmailButton } from "@/components/myjobs/SendEmailButton";
import { fillColdEmailTemplate } from "@/lib/coldEmailTemplate";

const mockUpdateJobEmailTo = vi.fn();
vi.mock("@/actions/job.actions", () => ({
  updateJobEmailTo: (...args: any[]) => mockUpdateJobEmailTo(...args),
}));

const mockGenerateColdEmail = vi.fn();
vi.mock("@/actions/coverLetter.actions", () => ({
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

// Radix Dialog needs these in jsdom (same stubs AddJob.spec.tsx uses).
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

document.createRange = () => {
  const range = new Range();
  range.getBoundingClientRect = vi.fn().mockReturnValue({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
  });
  range.getClientRects = () => ({
    item: () => null,
    length: 0,
    [Symbol.iterator]: vi.fn(),
  });
  return range;
};

describe("SendEmailButton", () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it("pre-fills the body with the static template (job title/company substituted), instantly, with no AI call", async () => {
    const user = userEvent.setup();
    render(
      <SendEmailButton
        jobId="job-1"
        jobTitle="Backend Engineer"
        companyName="Acme GmbH"
        senderName="Dhruvil Patel"
        initialEmailTo="recruiter@example.com"
      />,
    );

    await user.click(screen.getByRole("button", { name: /send email/i }));

    expect(await screen.findByLabelText(/^to$/i)).toHaveValue(
      "recruiter@example.com",
    );
    expect(screen.getByLabelText(/subject/i)).toHaveValue(
      "Application — Dhruvil Patel — Backend Engineer",
    );
    expect(screen.getByLabelText(/body/i)).toHaveValue(
      fillColdEmailTemplate("Backend Engineer", "Acme GmbH"),
    );
    expect(mockGenerateColdEmail).not.toHaveBeenCalled();
  });

  it("opens a correctly-encoded Gmail compose URL containing the filled template", async () => {
    mockUpdateJobEmailTo.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      <SendEmailButton
        jobId="job-1"
        jobTitle="Backend Engineer"
        companyName="Acme GmbH"
        senderName="Dhruvil Patel"
        initialEmailTo="recruiter@example.com"
      />,
    );

    await user.click(screen.getByRole("button", { name: /send email/i }));
    await screen.findByLabelText(/^to$/i);
    await user.click(screen.getByRole("button", { name: /open in gmail/i }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target, features] = openSpy.mock.calls[0];
    expect(target).toBe("_blank");
    expect(features).toBe("noopener,noreferrer");

    const parsed = new URL(url as string);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://mail.google.com/mail/",
    );
    expect(parsed.searchParams.get("to")).toBe("recruiter@example.com");
    expect(parsed.searchParams.get("body")).toBe(
      fillColdEmailTemplate("Backend Engineer", "Acme GmbH"),
    );
  });

  it("blocks sending and shows an error toast when the recipient is empty", async () => {
    const user = userEvent.setup();
    render(<SendEmailButton jobId="job-1" jobTitle="Backend Engineer" />);

    await user.click(screen.getByRole("button", { name: /send email/i }));
    await screen.findByLabelText(/^to$/i);
    await user.click(screen.getByRole("button", { name: /open in gmail/i }));

    expect(openSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
  });

  it("persists a changed recipient via updateJobEmailTo, keyed to this job", async () => {
    mockUpdateJobEmailTo.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(
      <SendEmailButton
        jobId="job-42"
        jobTitle="Backend Engineer"
        initialEmailTo="old@example.com"
      />,
    );

    await user.click(screen.getByRole("button", { name: /send email/i }));
    const toField = await screen.findByLabelText(/^to$/i);
    await user.clear(toField);
    await user.type(toField, "new@example.com");
    await user.click(screen.getByRole("button", { name: /open in gmail/i }));

    await waitFor(() => {
      expect(mockUpdateJobEmailTo).toHaveBeenCalledWith(
        "job-42",
        "new@example.com",
      );
    });
  });

  it("'Generate custom draft instead' replaces the body with the AI-generated content", async () => {
    mockGetCurrentProfileId.mockResolvedValue("profile-1");
    mockGenerateColdEmail.mockResolvedValue({
      success: true,
      content: "A fully custom AI-written cold email.",
    });
    const user = userEvent.setup();
    render(
      <SendEmailButton
        jobId="job-1"
        jobTitle="Backend Engineer"
        companyName="Acme GmbH"
      />,
    );

    await user.click(screen.getByRole("button", { name: /send email/i }));
    await screen.findByLabelText(/^to$/i);
    await user.click(
      screen.getByRole("button", { name: /generate custom draft instead/i }),
    );

    expect(mockGenerateColdEmail).toHaveBeenCalledWith("profile-1", "job-1");
    await waitFor(() => {
      expect(screen.getByLabelText(/body/i)).toHaveValue(
        "A fully custom AI-written cold email.",
      );
    });
  });

  it("shows an error and keeps the template body when generating a custom draft fails", async () => {
    mockGetCurrentProfileId.mockResolvedValue("profile-1");
    mockGenerateColdEmail.mockResolvedValue({
      success: false,
      message: "No resume found.",
    });
    const user = userEvent.setup();
    render(
      <SendEmailButton
        jobId="job-1"
        jobTitle="Backend Engineer"
        companyName="Acme GmbH"
      />,
    );

    await user.click(screen.getByRole("button", { name: /send email/i }));
    await screen.findByLabelText(/^to$/i);
    const templateBody = fillColdEmailTemplate("Backend Engineer", "Acme GmbH");
    await user.click(
      screen.getByRole("button", { name: /generate custom draft instead/i }),
    );

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
    expect(screen.getByLabelText(/body/i)).toHaveValue(templateBody);
  });
});
