// Shared naming for resume-rewrite output — the agreed convention is
// Dhruvil_Akbari_{CompanyName}_Resume(.docx). Used both for the saved
// RewrittenResume.title (resumeRewrite.actions.ts) and the downloaded file
// name (api/resume-rewrite/docx route), so the two never drift apart.

export function buildResumeDocumentName(companyName: string): string {
  const sanitizedCompany =
    companyName
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "Company";
  return `Dhruvil_Akbari_${sanitizedCompany}_Resume`;
}
