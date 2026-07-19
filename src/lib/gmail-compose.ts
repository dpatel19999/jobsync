// v1 "Send Email": Gmail compose-window deep link only — no OAuth, no Gmail
// API, no token handling. Opens https://mail.google.com/mail/?view=cm&... in
// a new tab, pre-filled; the user reviews and clicks Send themselves inside
// Gmail. See DECISIONS.md for why this is scoped separately from the future
// full-OAuth Gmail integration.

export type GmailComposeParams = {
  to?: string;
  subject?: string;
  body?: string;
};

// URLSearchParams percent-encodes every value it's given (spaces as "+",
// newlines as "%0A", "&"/"=" as themselves would be, etc.) so passing the
// raw multi-line body straight in is enough — no manual encodeURIComponent
// needed, and it can't be double-encoded or under-encoded by hand.
export function buildGmailComposeUrl({
  to = "",
  subject = "",
  body = "",
}: GmailComposeParams): string {
  const params = new URLSearchParams({ view: "cm" });
  if (to) params.set("to", to);
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export function buildDefaultEmailSubject(
  senderName: string | undefined | null,
  jobTitle: string | undefined | null,
): string {
  const name = senderName?.trim() || "Applicant";
  const title = jobTitle?.trim() || "Position";
  return `Application — ${name} — ${title}`;
}
