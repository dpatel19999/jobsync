// Static (non-AI) cold email template — instant, no Ollama call. One fixed
// body: German version first, then an "English version;" separator line,
// then the English version. Two placeholders, [Job Title] and
// [Company Name], appear multiple times across both language sections and
// are filled by plain string substitution (see fillColdEmailTemplate).
// Verbatim text supplied by the user — do not "fix" wording or the
// German/English sign-off difference (Dhruvil vs Dhruvil Akbari).
export const COLD_EMAIL_TEMPLATE = `Sehr geehrtes Personalteam,

ich hoffe, Sie sind bei guter Gesundheit.

Ich schreibe Ihnen, um mein Interesse an der Stelle als [Job Title] bei [Company Name] offiziell zu bekunden. Besonders interessiert mich die Möglichkeit, meine Erfahrung im Projektmanagement, in der Prozessoptimierung, Konstruktion und Automatisierungstechnik bei [Company Name] einzubringen. Anbei finden Sie meinen Lebenslauf, der einen umfassenden Überblick über meinen beruflichen Werdegang und meine Leistungen gibt.

Ich freue mich darauf, meine Fähigkeiten bei [Company Name] einzubringen, und würde mich über die Gelegenheit freuen, mit Ihnen zu besprechen, inwiefern meine Qualifikationen zu den Zielen Ihres Unternehmens passen.

Vielen Dank für die Berücksichtigung meiner Bewerbung.

Mit freundlichen Grüßen

Dhruvil

Mob: +49 1575 8744978
linkedin.com/in/dhruvil-akbari

English version;

Dear Hiring Team,

I trust this email finds you in good health.

I am writing to formally express my interest in the [Job Title] position at [Company Name]. I am especially interested in the opportunity to bring my experience in project management, process optimization, design engineering and automation to [Company Name]. Enclosed is my resume, providing a comprehensive overview of my professional background and achievements.

I am eager to contribute my skills to [Company Name], and would appreciate the opportunity to discuss how my qualifications align with the goals of your organization.

Thank you for considering my application.

Sincerely,

Dhruvil Akbari

Mob: +49 1575 8744978
linkedin.com/in/dhruvil-akbari`;

export function fillColdEmailTemplate(
  jobTitle: string,
  companyName: string,
): string {
  return COLD_EMAIL_TEMPLATE.replaceAll("[Job Title]", jobTitle).replaceAll(
    "[Company Name]",
    companyName,
  );
}
