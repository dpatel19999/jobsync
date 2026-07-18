# MEMORY.md — Session Handoff

## Last updated
Working autonomously through a combined 2-phase task while the user was away:
Phase 1 (natural-writing + factual-accuracy guardrails) is done, verified, and
about to be committed + merged to `main`. Phase 2 (DIN 5008 + German B1
region/language logic) is next, on its own branch off updated `main`, and per
explicit instruction will be left uncommitted for review when the user's back.
See "Open items not yet decided" for the one thing flagged for review rather
than decided silently.

Previously: both `feature/cold-email` and `feature/ats-scoring` committed and
merged into `main` (fast-forward, no conflicts either time). Post-merge smoke
test passed: signup/login, cold email generation, ATS keyword extraction +
scoring all verified working on `main` itself.

## Where we actually are right now
1. ✅ Baseline confirmed running: `npm install`, `.env`, migrations, `npm run dev`
   on port 3737 all work natively (no Docker).
2. ✅ **Cold email generation**: built on `feature/cold-email` (`af65bc7`),
   **merged into `main`** via merge commit `c9b4621`. Confirmed post-merge:
   working tree clean, all `ColdEmail` files/model present, all migrations
   applied, `tsc` shows zero new errors. `main` is currently 4 commits ahead
   of `origin/main` (not pushed — never asked to).
3. ✅ **ATS keyword scoring (EN+DE)** built on `feature/ats-scoring`, branched
   from `feature/cold-email`. Committed as `cb0edb3`, fast-forwarded onto
   `main` after `main` had cold-email merged in (no rebase needed — its base
   was already an ancestor), then **merged into `main`** via fast-forward
   (`main` now points at `cb0edb3` too). Both feature branch refs
   (`feature/cold-email`, `feature/ats-scoring`) still exist locally but are
   now fully contained in `main`'s history — safe to delete, not done since
   never asked.

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
6. ✅ **Post-merge smoke test on `main`** (fresh `npm run dev`, fresh test
   account): signup PASS, login with existing credentials PASS, cold email
   generation PASS (real Ollama call, ~124s, genuine content referencing only
   resume facts), ATS keyword extraction PASS (7 keywords) + scoring PASS
   (71% — 5/7 matched, "REST API"/"Kubernetes" correctly reported missing
   since the test resume genuinely didn't mention them). All smoke-test data
   cleaned from `dev.db` afterward.
7. ✅ **Writing guardrails (factual-accuracy + natural-writing)** built on
   `feature/writing-guardrails` (branched from `main` after item 6). Full
   design in ARCHITECTURE.md's "Writing guardrails module" section,
   rationale in DECISIONS.md. Summary:
   - New `src/lib/ai/guardrails/` module: `writing-tells.ts` (shared
     `AI_WRITING_TELL_RULES` prompt text + `detectWritingTells()` heuristic
     detector), `factual-accuracy.ts` (`verifyFactualAccuracy()` — a second
     Ollama call that checks a draft against source resume/job text),
     `generate-verified.ts` (`generateVerifiedContent()` — orchestrates
     generate → verify → regenerate-once-on-failure → warn-if-still-failing).
   - `cold-email/system.ts` now imports `AI_WRITING_TELL_RULES` instead of
     embedding its own copy of the ban list.
   - `generateColdEmail` (`coverLetter.actions.ts`) calls
     `generateVerifiedContent` instead of `generateText` directly, and
     returns a `warning` field. `GenerateColdEmailButton.tsx` shows it as a
     destructive toast + an inline banner in the preview dialog.
   - Checked for other AI-generation features needing this: cover letters are
     still pure manual CRUD (no AI-gen), so cold email is the only feature
     wired in for now; job-match/resume-review analysis outputs were judged
     out of scope (they're recruiter-style feedback about the resume, not
     first-person outbound content making claims as the candidate).
   - **Verified via a real, temporary script run against local Ollama
     (deleted after use, not committed)**: `detectWritingTells` correctly
     fires on a cliche-loaded test string and stays quiet on clean
     hand-written text. `verifyFactualAccuracy` reliably caught an injected
     fully-fabricated draft (fake "led engineering org at Google," fake
     "Kubernetes certification," fake "NASA aerospace background") as
     unsupported, confirmed across two separate runs. A full
     `generateVerifiedContent` end-to-end call against real Ollama
     (llama3.1) produced usable cold-email content in both runs (203s and
     298s).
   - **Known limitation, flagged for review (see DECISIONS.md)**: the local
     8B `llama3.1` fact-checker also produced false positives on clearly
     legitimate content in testing — e.g. flagging the resume's own
     "Backend Engineer" headline and a reasonable "three years" duration
     paraphrase as unsupported. One prompt-tightening pass (explicit
     paraphrase-tolerance rules) did not eliminate this; further iteration
     was deliberately stopped rather than chased indefinitely, since it
     looks like a small-model comprehension limit rather than a prompt
     problem. Decision made and shipped: keep surfacing these as warnings
     (safer than silently missing a real fabrication) rather than block or
     discard content. Revisit only if real usage shows this is too noisy —
     see DECISIONS.md for the mitigation options already considered.
   - `npx tsc --noEmit` shows zero new errors from this phase (only the
     pre-existing unrelated `lucide-react`/`date-fns` type-declaration noise).

## Immediate next steps (in order)
1. `main` will be 6 commits ahead of `origin/main` once Phase 1 merges (still
   never pushed — no request to push yet).
2. **Feature order (user-specified):**
   1. ✅ Natural-writing + guardrail pass — done, see item 7 above. Committed
      on `feature/writing-guardrails`, merged to `main`.
   2. 🔄 Region/language logic — DIN 5008 German cover-letter/email formatting
      + B1 German cap, extending the Phase 1 guardrail module rather than
      duplicating it. IN PROGRESS on `feature/region-language` (branched from
      `main` after Phase 1 merged). Deliberately left **uncommitted** per
      explicit instruction — stop and report back for review before
      committing this one, unlike Phase 1.
   3. Gmail integration — auto-tracking with confirm-on-downgrade, last. Not
      started.

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
- DIN 5008/B1 region-language phase: where the persisted `Job.region`/
  `language` field finally gets built, and how it interacts with (vs.
  replaces) ATS scoring's own fresh-detection approach — being decided now on
  `feature/region-language`, see this file's top section once that phase
  updates it.
- **FLAGGED FOR REVIEW** (not silently decided): local `llama3.1`'s
  reliability as a strict fact-checker for the factual-accuracy guardrail —
  see DECISIONS.md's "FLAGGED FOR REVIEW" entry and item 7 above. Guardrail
  ships as designed (safe failure mode either way), but worth the user's own
  read once they're back.
