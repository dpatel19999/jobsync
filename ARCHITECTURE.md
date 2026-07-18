# ARCHITECTURE.md

## Base repo — what already exists (confirmed by reading actual source)
- `src/actions/job.actions.ts` — application CRUD, `JobStatus` is a data table (not
  a fixed enum), so custom statuses (Phone Screen, Technical Round, Final Round,
  Ghosted) are just rows, no code change needed.
- `src/actions/coverLetter.actions.ts` — pure manual CRUD (title/content typed
  into a Tiptap editor); **no AI generation lives here**, contrary to this
  file's earlier assumption. The real AI-calling convention is in
  `automation.actions.ts`'s `analyzeDiscoveredJob` (non-streaming `getModel()` +
  `generateText()`) and in `src/app/api/ai/resume/match/route.ts` (streaming,
  client-picked model). `generateColdEmail` (done — see MEMORY.md) lives in
  `coverLetter.actions.ts` as a sibling to the CRUD functions, but borrows its
  AI-calling shape from `automation.actions.ts`.
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
| ATS keyword scoring (EN+DE) ✅ done | See "ATS keyword scoring module" section below | `src/actions/atsScore.actions.ts` reuses `automation.actions.ts`'s AI-calling pattern for extraction |
| Cold email ✅ done | `generateColdEmail` in existing `coverLetter.actions.ts`, `ColdEmail` prisma model (mirrors `CoverLetter`), `src/lib/ai/prompts/cold-email/`, `GenerateColdEmailButton.tsx` | Reuses `automation.actions.ts`'s AI-calling pattern |
| Natural-writing + guardrail pass | New shared prompt layer in `src/lib/ai/`, applied to all three generation functions above | Prompt-layer only, no new UI |
| Recruiter-persona scoring | `src/lib/review/persona-score.ts` — weighted rubric from persona doc (Technical Fit 25%, Experience 20%, Cultural Fit 20%, Communication 15%, Motivation 10%, Availability 10%) | Runs after generation, before showing user the draft |
| Interview prep | `src/actions/interviewPrep.actions.ts`, new `PrepQuestion` model | New UI page, links to `Job` |
| LinkedIn networking assistant | `src/lib/linkedin/finder.ts` (manual-trigger search/draft only, no auto-send) | New UI section, reminder tied to `Job` |

## Data model additions needed (Prisma schema)
- `GmailAccount` (encrypted OAuth tokens, mirrors `ApiKey` pattern)
- `ColdEmail` (mirrors `CoverLetter`) — ✅ done
- `JobKeyword`, `Job.atsScore`/`atsScoreData` — ✅ done (see below)
- `PrepQuestion` (linked to `Job`, round type, question, draft answer)
- `region` field on `Job` (for DIN formatting / B1 German toggle) — still not
  built; ATS scoring's language detection is deliberately NOT this field, see
  below

## ATS keyword scoring module (done, branch `feature/ats-scoring`)

Layout under `src/lib/ats/`:
- `core/scorer.ts` — language-agnostic: pure set comparison, weighting
  (default 1 per keyword), and percentage math. Takes the resume's token
  `Set<string>` and a list of `{ keyword, tokens, weight? }`, returns
  `{ score, matched, missing }`. No tokenization/stemming/language logic here.
- `adapters/en.ts` — tokenize (word-boundary regex) + Snowball English stem
  (`snowball-stemmers`).
- `adapters/de.ts` + `de-compound.ts` + `de-dictionary.ts` — tokenize, then for
  words ≥8 chars try dictionary-driven recursive compound splitting (see
  DECISIONS.md for why this is self-built, not a library), then Snowball
  German stem. **Important**: a word's required match tokens are its
  decomposed-part stems *or* its whole-word stem, never both (see DECISIONS.md
  — combining them over-constrains matching against inflected forms).
- `language-detect.ts` — `franc-min`, EN/DE only, no persisted field (see
  DECISIONS.md).
- `index.ts` — orchestrator: `scoreResumeAgainstKeywords(resumeText, keywords,
  jobDescriptionText)` picks the adapter from detected language and runs it
  through the core.

`src/actions/atsScore.actions.ts`: `extractJobKeywords` (Ollama call via
`automation.actions.ts`'s non-streaming pattern, saves `JobKeyword` rows with
`source: "extracted"`, preserves any `source: "manual"` ones), `addJobKeyword`
/ `removeJobKeyword` (manual edit), `scoreJob` (resolves a resume the same way
`generateColdEmail` does — job's own, else user default, else most recent —
then scores and saves `Job.atsScore`/`atsScoreData`).

UI: `AtsScoreSection.tsx`, wired into `JobDetails.tsx` next to the cold-email
button. Dialog shows the score (reuses `CircularScore`), detected language,
resume used, and a badge list of keywords (green=matched, red=missing,
neutral=unscored) with add/remove.

New prompt module: `src/lib/ai/prompts/ats-keywords/` (system + user prompts),
wired into the `@/lib/ai` and `@/lib/ai/prompts` barrels the same way as
cold-email's.
