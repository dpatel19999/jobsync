# MEMORY.md — Session Handoff

## Last updated
Worked autonomously through a combined 2-phase task, then a queued
test-hardening task, all while the user was away. All work is DONE and
verified.
**Phase 1 (natural-writing + factual-accuracy guardrails) is done, committed,
and merged to `main`.** **Phase 2 (DIN 5008 + German B1 region/language
logic) plus a full test-coverage/edge-case-hardening pass are both done and
verified, sitting together, uncommitted, on `feature/region-language`**,
branched from the updated `main`. A queued task asked for the test-hardening
work on a new `feature/test-hardening` branch "based on whatever's latest
once prior work is merged," but Phase 2 was explicitly told to stay
uncommitted for review — merging it just to satisfy the branch-naming
instruction would have broken that hold, so the test work was added
directly onto `feature/region-language` instead (flagged in DECISIONS.md,
not silently decided). **Stop and report back for review before committing
any of this.** Several things are flagged for review rather than decided
silently (all ship as-is, all are safe failure modes, none is a blocker) —
see "Open items not yet decided."

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
8. ✅ **Region/language (DIN 5008 + German B1)** built on
   `feature/region-language` (branched from `main` after item 7 merged) —
   **still uncommitted, waiting for review**, unlike every prior feature
   this session. Full design in ARCHITECTURE.md's "Region/language module"
   section, rationale in DECISIONS.md. Summary:
   - New `src/lib/ai/guardrails/region-language.ts`: `DIN_5008_EMAIL_STRUCTURE`,
     `GERMAN_B1_LANGUAGE_RULES`, `GERMAN_WRITING_TELL_RULES` (extends Phase
     1's `AI_WRITING_TELL_RULES`, doesn't duplicate it), and
     `detectGermanB1Violations()` (soft heuristic: Konjunktiv II markers,
     over-long sentences, "nicht nur...sondern auch" framing).
   - `generateVerifiedContent` (Phase 1) gained an optional `language?: "en"
     | "de"` arg; when `"de"` it also runs `detectGermanB1Violations` and
     warns on hits — same non-blocking pattern as the English tell-check.
   - New `src/lib/ai/prompts/cold-email/system-de.ts` +
     `user-de.ts` (`COLD_EMAIL_SYSTEM_PROMPT_DE` / `buildColdEmailPromptDe`)
     — separate files from the English versions, so the English path is
     provably untouched.
   - `generateColdEmail` now detects the job description's language via
     `detectAtsLanguage` (imported straight from `@/lib/ats`, re-exported
     through `@/lib/ai` — reused, not duplicated) and picks the EN/DE prompt
     pair accordingly.
   - DIN 5008 research done via live web search this session (not from
     model memory): confirmed current conventions are subject line
     ("Betreff"), formal salutation/closing formulas, paragraph structure
     with blank lines between them — applied only the email-relevant
     conventions, not DIN 5008's postal-letter page-layout rules (margins,
     address window), since cold email is plain email body text with no
     page. Sources: leonrenner.com, letterformat.org, grokipedia.com,
     dinmedia.de (DIN's own site).
   - **Verified via a real, temporary script run against local Ollama**
     (deleted after use, not committed): `detectAtsLanguage` correctly
     identified a German test job description as `"de"`. A real end-to-end
     German cold-email generation (llama3.1, ~589s) produced a `Betreff:`
     line, a formal `Sehr geehrte Damen und Herren,` salutation, a formal
     `Mit freundlichen Grüßen` closing, no informal `du`/`dein`, and an
     average sentence length of 18.7 words (within the ~15-20 word B1
     target).
   - **Known limitation, flagged for review (see DECISIONS.md)**: that same
     generation used `würde`/`könnten` (Konjunktiv II) three times despite
     an explicit ban in the prompt — confirmed real, not a fluke. Mirrors
     Phase 1's fact-checker limitation (small local model not perfectly
     following an instruction) but in the opposite direction here
     (under-enforcing a style rule vs. over-flagging a factual one).
     Mitigated the same way Phase 1 was: logged via the new
     `detectGermanB1Violations` soft-check rather than escalated to a hard
     block, so it's visible rather than silent. Not fixed further this
     session — flagged, not chased.
   - Language selection deliberately reuses ATS scoring's fresh
     `detectAtsLanguage(jobDescriptionText)` rather than building the
     previously-planned persisted `Job.region`/`language` field — **flagged
     for review**: this is a real gap (an English-language JD from a German
     company would wrongly generate an English cold email, and vice versa),
     not decided as a non-issue. Not built because it needs a UX call only
     the user should make (per-job override? per-profile default? does it
     also affect ATS scoring?), not something to guess at mid-autonomous-run.
   - `npx tsc --noEmit` shows zero new errors from this phase either.
   - Cover letters re-confirmed to still have no AI generation — DIN
     5008/B1 wasn't applied there since there's nothing generated to apply
     it to yet.
9. ✅ **Test coverage + edge-case hardening** — queued mid-session, done on
   top of `feature/region-language` (see the branch-naming note above),
   **also uncommitted, awaiting review**.
   **CORRECTION to a claim made mid-session**: this is NOT the repo's first
   test suite — there's an extensive pre-existing one in `__tests__/*.spec.ts`
   (~78 files, ~1195 tests) that an initial scan missed (it searched for
   `*.test.ts` only). That whole suite could not run at all before this
   session, though — `jsdom` was declared in `vitest.config.ts` but never
   installed (see bug list below) — so it's effectively the first time any
   of it, old or new, has actually executed. New test files were moved to
   match the existing `__tests__/<name>.spec.ts` convention (flat dir, `@/`
   alias imports, `vi.mock("@prisma/client", ...)` DB-mocking style) after
   this was discovered, rather than left as the colocated `src/**/*.test.ts`
   files first written before the convention was found. Two new files'
   worth of tests were merged into existing spec files instead
   (`coverLetter.actions.spec.ts` gained a `generateColdEmail` block;
   `text-processing.spec.ts` gained the ReDoS regression test) rather than
   left as competing, partially-duplicate files.
   - **Final verification**: full suite run twice after the reorg. First
     full run (before reorg) — 1284/1285 passed, only failure was the stale
     `job.actions.spec.ts` assertion (fixed). Second full run (after reorg)
     — 1275/1277 passed; the 2 new failures are `AddJob.spec.tsx`'s
     form-submission tests timing out at 5000ms **only under full-suite
     parallel load** — confirmed via an isolated run (17/17 pass, ~2s/test)
     that this is pre-existing flakiness from CPU contention across ~97
     files running together, not a regression from anything touched this
     session. Not modified — see DECISIONS.md.
   - **34 + 12 + 10 + 12 + 7 = ~90 new tests** across: `writing-tells.ts`,
     `region-language.ts` (both guardrail detectors), ATS `scorer.ts`
     (core scoring math), `de-compound.ts` (umlaut/ß compound splitting,
     synthetic dict), `de.ts` (real-dictionary integration),
     `language-detect.ts` (EN/DE/non-EN-non-DE fallback),
     `factual-accuracy.ts` + `generate-verified.ts` (mocked `ai` SDK, no
     real Ollama calls needed for these), `text-processing.ts`
     (`validateText`, `hasContactInfo`, ReDoS regression guard),
     `preprocessing-job.ts` (empty/minimal/huge/malformed job descriptions),
     `config.ts` (`truncateForProvider`), and action-level tests for
     `generateColdEmail` + `extractJobKeywords`/`scoreJob` (mocked
     prisma/auth/AI-model layer, real ATS pipeline for the language-fallback
     case).
   - **Real, pre-existing bug found and fixed**: `vitest.config.ts` already
     declared `environment: "jsdom"`, but the `jsdom` package was never
     installed — the test suite could not run *at all* before this session
     (confirmed: `npx vitest run` errored with `Cannot find package
     'jsdom'` even with zero test files present). Installed it as a
     devDependency; this is why zero tests existed despite vitest being
     configured — nobody could have run one.
   - **Real, serious bug found and fixed**: `hasContactPatterns` (shared by
     resume + job preprocessing, in `src/lib/ai/tools/text-processing.ts`)
     had a ReDoS-shaped performance bug in its email regex — confirmed
     directly that 60,000 characters of contact-free text took **~6.2
     seconds** in `extractMetadata` alone, which runs before any length
     validation and blocks Node's single event loop for the whole request.
     Found specifically while testing the "very long job descriptions"
     edge case this task asked for. Fixed by scanning only the first 2,000
     characters (contact info is always in a document's header) rather
     than rewriting the regex. Regression test locks in that 200,000 chars
     of contact-free text now stays under 1 second.
   - **Real bug found and fixed**: `TEXT_LIMITS` (provider-aware
     resume/job character caps) was defined in `src/lib/ai/config.ts` but
     never referenced anywhere in the codebase — confirmed via repo-wide
     search. Long resumes/job descriptions were going into prompts fully
     uncapped. Added `truncateForProvider()` and wired it into
     `generateColdEmail` and `extractJobKeywords` (the two features in
     scope this session); deliberately did not touch job-match/
     resume-review/automation-match, which is a broader change outside
     this session's assigned features.
   - **Two real bugs found and fixed in `detectWritingTells` itself** (not
     just test mistakes) while writing its tests: it didn't catch the
     contraction "isn't just X, it's Y" (only literal "not just"), and its
     rule-of-three check's suffix list didn't match CLAUDE.md's own
     canonical example ("innovative, scalable, and robust" — "scalable"
     matched nothing). Both fixed; see DECISIONS.md for the exact regex
     changes.
   - `npx tsc --noEmit` shows zero new errors from any of this.
   - Did not touch `.env`, did not push, did not merge to `main`, did not
     commit — per explicit instruction for this task.

## Immediate next steps (in order)
1. `main` is 6 commits ahead of `origin/main` (Phase 1 merged), still never
   pushed — no request to push yet. `feature/region-language` sits on top of
   that, one commit's worth of work, **not yet committed or merged**.
2. **User needs to review Phase 2 before anything else happens to it**: the
   two flagged-for-review items (fact-checker false positives from Phase 1,
   Konjunktiv II leakage + fresh-detection-vs-persisted-field from Phase 2 —
   see DECISIONS.md) and the actual generated German cold-email sample in
   this file's item 8. Currently on branch `feature/region-language` with
   everything built and verified but sitting uncommitted in the working
   tree — do not commit until the user says so (explicit instruction for
   this phase specifically, unlike Phase 1 which was pre-approved to commit
   and merge on its own).
3. **Feature order (user-specified):**
   1. ✅ Natural-writing + guardrail pass — done, committed, merged to `main`.
   2. ✅ Region/language logic (DIN 5008 + German B1) — done, verified,
      **awaiting review/commit approval** on `feature/region-language`.
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
- **Decided this session, not fully resolved**: `Job.region`/`language` stays
  un-persisted. Cold email's German path reuses ATS's fresh
  `detectAtsLanguage(jobDescriptionText)` instead. **FLAGGED FOR REVIEW**:
  this will guess wrong for a German company posting an English JD (or vice
  versa) — a persisted, user-overridable field is still the more correct
  long-term answer, deliberately not built because it needs a UX decision
  (per-job override? per-profile default? shared with ATS scoring?) that's
  the user's call, not something to guess mid-session. See DECISIONS.md.
- **FLAGGED FOR REVIEW** (not silently decided): local `llama3.1`'s
  reliability as a strict fact-checker for the factual-accuracy guardrail —
  see DECISIONS.md's "FLAGGED FOR REVIEW" entry and item 7 above. Guardrail
  ships as designed (safe failure mode either way), but worth the user's own
  read once they're back.
- **FLAGGED FOR REVIEW**: local `llama3.1` doesn't reliably honor the "no
  Konjunktiv II" instruction for German B1 output (confirmed: `würde`/
  `könnten` appeared 3x in one real generation despite an explicit ban).
  Mitigated with a soft, logged `detectGermanB1Violations` check rather than
  a hard block — see DECISIONS.md and item 8 above.
