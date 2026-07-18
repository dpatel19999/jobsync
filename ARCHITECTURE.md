# ARCHITECTURE.md

## Base repo — what already exists (confirmed by reading actual source)
- `src/actions/job.actions.ts` — application CRUD, `JobStatus` is a data table (not
  a fixed enum), so custom statuses (Phone Screen, Technical Round, Final Round,
  Ghosted) are just rows, no code change needed.
- `src/actions/coverLetter.actions.ts` — AI cover letter generation via `getModel()`
  / `generateText()` (from the `ai` SDK). Cold email generation will be a sibling
  function here, same pattern.
- `src/actions/resumeImport.actions.ts`, `profile.actions.ts` — Resume/CoverLetter
  models under a `Profile`, resumes have structured `ResumeSection`s already.
- `src/actions/atsCompany.actions.ts` — NOTE: this "ATS" means Greenhouse/Lever job
  board scraping, unrelated to keyword-match scoring. Don't confuse with Feature 2.
- `src/actions/automation.actions.ts` — AI job-match scoring (`parseJobMatch`,
  `JOB_MATCH_SYSTEM_PROMPT`) against a resume. Closest existing thing to ATS scoring,
  but framed as match %, not keyword-gap analysis.
- `Contact` / `Interview` models — recruiter names already supported.
- `Note` / `Question` models — notes and question bank already supported.
- Zero Gmail integration anywhere (confirmed via grep).

## Planned additions (net-new modules, don't touch existing files except where noted)

| Module | New files | Plugs into |
|---|---|---|
| Gmail auto-tracking | `src/lib/gmail/client.ts`, `classifier.ts`, `src/actions/gmail.actions.ts`, `GmailAccount` prisma model | Calls existing `job.actions.ts` to update status |
| ATS keyword scoring (EN) | `src/lib/ats/scorer.ts`, `src/actions/atsScore.actions.ts`, add `atsScoreBefore/After` to `Job` model | Runs alongside existing `automation.actions.ts` match flow |
| ATS keyword scoring (DE) | `src/lib/ats/scorer-de.ts` — compound-noun decomposition + stemming, separate from EN scorer | Same as above, different algorithm |
| Cold email | New function in existing `coverLetter.actions.ts`, `ColdEmail` prisma model (mirrors `CoverLetter`) | Reuses cover letter's AI pattern |
| Natural-writing + guardrail pass | New shared prompt layer in `src/lib/ai/`, applied to all three generation functions above | Prompt-layer only, no new UI |
| Recruiter-persona scoring | `src/lib/review/persona-score.ts` — weighted rubric from persona doc (Technical Fit 25%, Experience 20%, Cultural Fit 20%, Communication 15%, Motivation 10%, Availability 10%) | Runs after generation, before showing user the draft |
| Interview prep | `src/actions/interviewPrep.actions.ts`, new `PrepQuestion` model | New UI page, links to `Job` |
| LinkedIn networking assistant | `src/lib/linkedin/finder.ts` (manual-trigger search/draft only, no auto-send) | New UI section, reminder tied to `Job` |

## Data model additions needed (Prisma schema)
- `GmailAccount` (encrypted OAuth tokens, mirrors `ApiKey` pattern)
- `ColdEmail` (mirrors `CoverLetter`)
- `atsScoreBefore`, `atsScoreAfter` fields on `Job`
- `PrepQuestion` (linked to `Job`, round type, question, draft answer)
- `region` field on `Job` (for DIN formatting / B1 German toggle)
