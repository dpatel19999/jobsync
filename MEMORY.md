# MEMORY.md — Session Handoff

## Last updated
`feature/cold-email` merged into `main`. ATS keyword scoring (EN+DE) feature
complete and verified, still uncommitted on `feature/ats-scoring` (based on
`feature/cold-email`'s commit, which is now part of `main`'s history) — user
hasn't given the go-ahead to commit it yet.

## Where we actually are right now
1. ✅ Baseline confirmed running: `npm install`, `.env`, migrations, `npm run dev`
   on port 3737 all work natively (no Docker).
2. ✅ **Cold email generation**: built on `feature/cold-email` (`af65bc7`),
   **merged into `main`** via merge commit `c9b4621`. Confirmed post-merge:
   working tree clean, all `ColdEmail` files/model present, all migrations
   applied, `tsc` shows zero new errors. `main` is currently 4 commits ahead
   of `origin/main` (not pushed — never asked to).
3. ✅ **ATS keyword scoring (EN+DE)** built on `feature/ats-scoring`, branched
   from `feature/cold-email` (not `main` at the time) because its UI sits next
   to the cold-email button. Now that cold-email is merged into `main`,
   `feature/ats-scoring`'s base commit is an ancestor of `main`, so it's
   already correctly positioned — **no rebase needed**, it can go straight to
   `main` whenever it's committed and approved. Still fully uncommitted
   (working tree has the changes; verified this survives branch-switching —
   was stashed during the merge work and popped back cleanly afterward).

   What was built:
   - `JobKeyword` Prisma model + `Job.atsScore`/`atsScoreData` fields,
     migration `20260718153558_add_ats_keyword_scoring`.
   - `src/lib/ats/` — language-agnostic scoring core (`core/scorer.ts`, pure
     set/weight/percentage math) + EN/DE adapters (`adapters/en.ts`,
     `adapters/de.ts` + `de-compound.ts` + `de-dictionary.ts`) + language
     detection (`language-detect.ts`, `franc-min`). Full design rationale in
     ARCHITECTURE.md's "ATS keyword scoring module" section.
   - German compound splitting is **self-built** (dictionary-driven recursive
     splitter against the `dictionary-de` npm package's Hunspell wordlist) —
     no maintained JS library exists for this; researched and confirmed
     before building, user picked this approach over an LLM-based or Python-
     subprocess alternative. Stemming for both EN and DE uses
     `snowball-stemmers` (one dependency, real Snowball algorithms).
   - New deps added: `snowball-stemmers`, `dictionary-de`, `franc-min`,
     `@types/snowball-stemmers` (dev).
   - `src/actions/atsScore.actions.ts` — `extractJobKeywords` (Ollama call,
     same non-streaming `getModel()`+`generateText()` convention as
     `automation.actions.ts`/cold email), `addJobKeyword`/`removeJobKeyword`
     (manual edit, `source: "manual"` vs `"extracted"`), `scoreJob` (resolves
     a resume the same way `generateColdEmail` does: job's own → user default
     → most recent, then scores and saves).
   - New prompt module `src/lib/ai/prompts/ats-keywords/` wired into the
     `@/lib/ai` barrels the same way cold-email's is.
   - UI: `AtsScoreSection.tsx` (dialog: score via `CircularScore`, detected
     language, resume used, keyword badges with add/remove), wired into
     `JobDetails.tsx` next to the cold-email button.
4. ✅ **Verified end-to-end for real, twice over**:
   - Direct unit-style verification (via `tsx`, against the actual repo
     modules, not mocks) of the tricky German logic: plural/case stemming
     ("Datenanalysen" resume text correctly matches "Datenanalyse" keyword),
     multi-part compound decomposition ("Datenanalyseprojekten" → daten +
     analyse + projekt, recursively), and correct rejection of over-permissive
     matches (a keyword genuinely missing a required part is still reported
     missing). Also confirmed English stemming and EN/DE language detection.
   - One bug caught and fixed during this direct testing: the DE adapter
     originally required *both* a word's whole-word stem *and* its compound
     sub-part stems simultaneously, which over-constrained matching against
     inflected forms. Fixed to use one or the other, never both (see
     DECISIONS.md). Also fixed the compound splitter to apply linking-
     morpheme stripping to *both* sides of a candidate split (it only did the
     left side originally), and to recurse properly for 3+-part compounds.
   - Full scripted Playwright UI run: signup → resume (contact info + summary
     + one work experience mentioning Node.js/PostgreSQL/AWS/Docker,
     synthetic test data) → job at "Meridian Cloud Systems" with a detailed
     English JD → clicked "Extract Keywords" (real Ollama/llama3.1 call, took
     ~36s, produced 15 sensible keywords: Node.js, PostgreSQL, AWS,
     Kubernetes, GraphQL, CI/CD, REST API design, etc.) → clicked "Score
     Resume" → got 27% (4/15 matched: Node.js, PostgreSQL, AWS, and "Backend
     engineering" via stemming against the resume's "Backend Engineer"
     headline). Verified the exact matched/missing breakdown in the DB
     matches what a careful manual read of the resume vs. keyword list would
     predict — no logic surprises.
   - All test data (test user, resume, job, 15 keywords, test
     companies/titles/locations) cleaned up from local `dev.db` afterward via
     direct Prisma queries, same careful multi-table teardown as the
     cold-email session. Confirmed via sweep queries: zero leftover rows.
5. Pre-existing, unrelated to this feature: `npx tsc --noEmit` reports
   `date-fns`/`lucide-react` type errors across most of the codebase (stale
   `node_modules` types vs. installed versions) — confirmed zero *new* type
   errors from the ATS scoring changes specifically.

## Immediate next steps (in order)
1. Currently on branch `feature/ats-scoring` with the ATS scoring work
   uncommitted in the working tree (verified it survives branch-switching via
   `git stash`/`stash pop`, so it's safe, just not yet a commit). Waiting on
   the user to say "commit this" before doing so — same pattern as cold email.
2. Once committed and approved: merge `feature/ats-scoring` straight into
   `main` (no rebase needed — its base commit is already an ancestor of
   `main` now that cold-email merged).
3. `main` itself is 4 commits ahead of `origin/main`, never pushed — no
   request to push yet either.
4. Next planned feature per the original list: recruiter-persona weighted
   scoring, or Gmail auto-tracking — not yet started, no decisions made.

## Full feature list agreed (see ARCHITECTURE.md for technical detail)
Gmail auto-tracking (with confirm-on-downgrade), EN+DE ATS scoring ✅ done,
CV+cover letter+cold email tailoring (docx+pdf output), JD-adaptive CV
structure, company-mismatch guardrail, bilingual EN/German-B1 output, DIN 5008
German formatting, no-invented-facts guardrail, natural-writing pass,
AI-writing-tell ban list, recruiter-persona weighted scoring, interview prep
Q&A module, LinkedIn networking assistant (manual-send only).

## Corrections to ARCHITECTURE.md worth knowing
- `coverLetter.actions.ts` has **no AI generation** — it's pure manual CRUD
  (title/content typed into a Tiptap editor, linked to a Job via a Combobox in
  `AddJob.tsx`). The real AI-calling convention in this codebase lives in
  `automation.actions.ts` (`analyzeDiscoveredJob`, non-streaming) and in
  `src/app/api/ai/resume/match/route.ts` (streaming, client-picked model, used
  by `AiJobMatchSection`). Cold email and ATS keyword extraction both use the
  non-streaming convention.
- ARCHITECTURE.md's original ATS scoring plan assumed a fixed
  `atsScoreBefore`/`atsScoreAfter` pair on `Job` (for before/after CV-tailoring
  comparison) and a persisted `region`/`language` field — neither was built.
  Current scoring is a single current `atsScore`/`atsScoreData`, and language
  is detected fresh each time from the job description text via `franc-min`,
  not stored. The before/after comparison and persisted region/language field
  are still open for whenever the CV-tailoring and DIN-formatting phases
  actually start.

## Open items not yet decided
- Whether/when to add a persisted before/after ATS score comparison (ties
  into the not-yet-built CV-tailoring feature).
- Which feature to build next after ATS scoring is merged — not yet raised
  with the user.
