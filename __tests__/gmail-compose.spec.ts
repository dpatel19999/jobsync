import { describe, expect, it } from "vitest";
import {
  buildDefaultEmailSubject,
  buildGmailComposeUrl,
} from "@/lib/gmail-compose";

describe("buildGmailComposeUrl", () => {
  it("builds a basic compose URL with view=cm and all fields", () => {
    const url = buildGmailComposeUrl({
      to: "recruiter@example.com",
      subject: "Application — Dhruvil Patel — Backend Engineer",
      body: "Dear Hiring Team,\n\nPlease find my application attached.",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://mail.google.com/mail/",
    );
    expect(parsed.searchParams.get("view")).toBe("cm");
    expect(parsed.searchParams.get("to")).toBe("recruiter@example.com");
    expect(parsed.searchParams.get("su")).toBe(
      "Application — Dhruvil Patel — Backend Engineer",
    );
    expect(parsed.searchParams.get("body")).toBe(
      "Dear Hiring Team,\n\nPlease find my application attached.",
    );
  });

  it("percent-encodes line breaks in the body", () => {
    const url = buildGmailComposeUrl({
      to: "a@b.com",
      subject: "s",
      body: "line one\nline two\r\nline three",
    });
    expect(url).toContain("body=line+one%0Aline+two%0D%0Aline+three");
  });

  it("percent-encodes special characters (&, =, +, #) in every field", () => {
    const url = buildGmailComposeUrl({
      to: "a+jobs@example.com",
      subject: "R&D role = great fit",
      body: "50% match & #1 pick",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("to")).toBe("a+jobs@example.com");
    expect(parsed.searchParams.get("su")).toBe("R&D role = great fit");
    expect(parsed.searchParams.get("body")).toBe("50% match & #1 pick");
    // Raw string must not contain a literal unencoded '&' inside a param value
    // (that would break the query string into extra params).
    expect(url.split("&").length).toBe(4); // view, to, su, body
  });

  it("preserves German umlauts round-trip", () => {
    const url = buildGmailComposeUrl({
      to: "a@b.de",
      subject: "Bewerbung für die Stelle als Softwareentwickler",
      body: "Sehr geehrte Damen und Herren,\n\nmit großem Interesse...",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("su")).toBe(
      "Bewerbung für die Stelle als Softwareentwickler",
    );
    expect(parsed.searchParams.get("body")).toBe(
      "Sehr geehrte Damen und Herren,\n\nmit großem Interesse...",
    );
  });

  it("omits empty fields instead of adding blank params", () => {
    const url = buildGmailComposeUrl({});
    expect(url).toBe("https://mail.google.com/mail/?view=cm");
  });
});

describe("buildDefaultEmailSubject", () => {
  it("builds 'Application — {name} — {title}'", () => {
    expect(buildDefaultEmailSubject("Dhruvil Patel", "Backend Engineer")).toBe(
      "Application — Dhruvil Patel — Backend Engineer",
    );
  });

  it("falls back to 'Applicant' when sender name is missing", () => {
    expect(buildDefaultEmailSubject(null, "Backend Engineer")).toBe(
      "Application — Applicant — Backend Engineer",
    );
  });

  it("falls back to 'Position' when job title is missing", () => {
    expect(buildDefaultEmailSubject("Dhruvil Patel", "")).toBe(
      "Application — Dhruvil Patel — Position",
    );
  });
});
