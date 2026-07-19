# MEMORY.md — Session Handoff

## Last updated
Everything below is **committed and merged into `main`**. No feature
branches exist right now — only `main`. `main` is ahead of
`origin/main`, never pushed (no request to). Targeted tests for the newest
feature (below) confirmed passing; full suite not re-run this session per
explicit instruction ("targeted tests only").

**Recurring verification note**: `getCurrentUser()` (via next-auth's
`auth()`) needs a real Next.js request context — it always fails when a
verification script calls an exported server action directly. The working
pattern (used for job-language and cover-letter/tailoring verification):
stub a local no-op `node_modules/server-only` package, then call the
*internal* steps a server action performs (preprocessing, `resolveJobLanguage`,
`getModel`, `generateVerifiedContent`, the Prisma writes) directly against
real `dev.db` + real Ollama, skipping only the `getCurrentUser()`/auth line
itself. Always delete the script and the `server-only` stub afterward.

**Important note on the previous session's chat-shift summary**: a later
session was asked for a full audit of a supposed `feature/email-send`
(emailTo field, Send Email button, Mark as Applied) and found **none of it
had actually been built** — no branch, no code, no tests existed anywhere,
despite a prior chat-shift summary implying otherwise. That branch/feature
name never appeared in this file, DECISIONS.md, or ARCHITECTURE.md before
that point. It has since been built fresh (see #8 below) — but if a future
summary references work that isn't independently verifiable in the repo
(git log, actual files), re-verify before trusting it rather than assuming
a past session's account was accurate.

## What's shipped, in order
1. **Cold email generation** (`feature/cold-email`) — non-streaming
   `getModel()`+`generateText()`, Tiptap-free plain content, saved to a new
   `ColdEmail` model linked from `Job`.
2. **ATS keyword scoring, EN+DE** (`feature/ats-scoring`) —
   `src/lib/ats/`: language-agnostic scoring core + EN/DE adapters
   (self-built German compound splitter, dictionary-driven; `franc-min` for
   detection at the time). `Job.atsScore`/`atsScoreData` + `JobKeyword`
   model. UI: `AtsScoreSection.tsx`.
3. **Writing guardrails** (`feature/writing-guardrails`) —
   `src/lib/ai/guardrails/`: `writing-tells.ts` (AI-tell heuristic ban
   list), `factual-accuracy.ts` (second-Ollama-call fact check),
   `generate-verified.ts` (`generateVerifiedContent()`: generate → verify →
   regenerate-once → warn-if-still-failing, never silently blocks). Wired
   into `generateColdEmail` only (cover letters have no AI generation; other
   AI features are recruiter-feedback-style, judged out of scope).
   **Flagged, unresolved**: local `llama3.1` fact-checker throws false
   positives on legitimate paraphrases — mitigated by warn-don't-block, not
   eliminated by prompt tightening.
4. **Region/language: DIN 5008 + German B1** (`feature/region-language`) —
   `src/lib/ai/guardrails/region-language.ts` extends (not duplicates)
   guardrails module 3: DIN 5008 email structure, German B1 language rules,
   `detectGermanB1Violations()` (soft/logged, same pattern as writing-tells).
   Separate `system-de.ts`/`user-de.ts` cold-email prompts so the English
   path stays untouched. **Flagged, unresolved**: local model doesn't
   reliably honor the "no Konjunktiv II" instruction (confirmed würde/
   könnten leaking through) — mitigated the same soft-check way.
5. **Test-hardening pass** (built on `feature/region-language`) — repo-wide
   test suite was previously **non-functional** (jsdom never installed
   despite being configured) — fixed, ~90 new tests added across guardrails/
   ATS/preprocessing, plus real bugs found+fixed: a ReDoS-shaped regex in
   contact-info extraction, dead-code `TEXT_LIMITS` never wired in (long
   resumes/JDs were going to the model uncapped), two real `detectWritingTells`
   regex misses.
6. **Security hardening** (`feature/security-hardening`, reviewed and
   merged) — secrets audit (one inherited-but-already-removed upstream
   Docker `AUTH_SECRET` default; confirmed not in use), `npm audit` 14→6
   (remaining need semver-majors, flagged not forced), explicit session
   config, rate limiting added to the three previously-unguarded
   Ollama-calling actions, prompt-injection fencing module
   (`<<<UNTRUSTED_DATA>>>` markers) wired into all generation prompts,
   Gmail-integration security prep documented (see DECISIONS.md — read
   before starting Gmail work).
7. **Job language persistence** (`feature/job-language`) — closes the gap
   flagged in #4/#6: nullable `Job.language` field, populated once on first
   detection (cold-email generation or ATS scoring, whichever runs first)
   via `resolveJobLanguage()`, reused thereafter instead of re-detecting per
   call. Manual override dropdown (`JobLanguageSelect.tsx`) on the job
   detail page via `updateJobLanguage()`. Verified end-to-end against real
   Ollama + real `dev.db`: detect → persist → reuse-despite-mismatched-text
   → override → override-wins, through both real ATS scoring and a real
   live cold-email generation. Full detail in ARCHITECTURE.md's "Job
   language persistence" section.
8. **Send Email + Mark as Applied** (`feature/email-send`) — v1, lightweight
   by design: Gmail compose-window deep link only, no OAuth/Gmail API/token
   handling (separate scope from the future full "Gmail integration" below).
   `Job.emailTo` field, `src/lib/gmail-compose.ts` URL builder (unit-tested
   for encoding correctness including line breaks/umlauts/`&`),
   `SendEmailButton.tsx` + `MarkAppliedButton.tsx` on the job detail page,
   standalone `toggleJobApplied` action separate from the status-dropdown's
   existing applied side effect. Verified via a real Playwright
   click-through against a throwaway fixture (deleted after): dialog
   pre-fill, exact recipient/subject/body recovered from Google's own
   sign-in redirect `continue=` param, and Mark as Applied confirmed against
   real `dev.db` (not just the optimistic UI — see ARCHITECTURE.md for a
   false-positive this caught and fixed). Full detail in ARCHITECTURE.md's
   "Send Email + Mark as Applied" section.
9. **Static (non-AI) cold-email template** (`feature/email-template`) —
   Send Email's default body is now an instant, no-Ollama-call static
   template (`src/lib/coldEmailTemplate.ts`, verbatim German+English text
   the user supplied, `[Job Title]`/`[Company Name]` filled by plain string
   substitution). Full AI generation kept as an opt-in "Generate custom
   draft instead" button in the same dialog. Verified via a real Playwright
   click-through (fixture deleted after): both language sections filled
   correctly, Gmail-redirect decoding confirmed exact full-body match. Fast,
   scoped task — full detail in ARCHITECTURE.md's "Static cold-email
   template" section.
10. **Cover letter generation + resume tailoring**
    (`feature/cover-letter-resume-tailoring`) — explicitly scoped as "move
    fast, reuse infrastructure": `generateCoverLetter(profileId, jobId)` is
    a structural copy of `generateColdEmail` (same guardrail pipeline, rate
    limiting, resume resolution, `resolveJobLanguage`-based EN/DE routing),
    saving a `CoverLetter` linked via `Job.coverLetterId`. New DIN 5008 +
    B1-aware `src/lib/ai/prompts/cover-letter/` prompt pair, same pattern as
    cold email's. `generateTailoredSummary(profileId, jobId)` reuses the
    exact same pipeline again for a 2-3 sentence resume-tailoring snippet,
    saved directly on a new nullable `Job.tailoredSummary` field (no
    separate document model — it's a snippet, not a letter). UI: an
    editable (not read-only) textarea (`TailoredSummarySection.tsx`) — user
    copies it into their resume manually, nothing here ever writes to the
    actual resume. No new guardrail logic was written for either feature.
    Verified via a real, temporary script against local Ollama + real
    `dev.db` (deleted after, fixtures cleaned up): cover letter generation
    ~541s (172 words, correctly linked+persisted), tailored summary ~286s
    (3 sentences, correctly persisted, resume object confirmed untouched).
    Both surfaced the known llama3.1 fact-checker false-positive warning on
    paraphrase-level claims (same pattern as cold email — not a new bug).
    Full detail in ARCHITECTURE.md's "Cover letter generation + resume
    tailoring" section.
11. **"Generate All" button** (`feature/generate-all`) — pure client-side
    sequencer, no new guardrail/AI logic: `extractJobKeywords` → `scoreJob`
    → `generateTailoredSummary` → `generateCoverLetter` → `generateColdEmail`
    (skipped if `job.ColdEmail` already exists), stopping on first failure
    with earlier results kept (no rollback — each step already persists
    independently). Added alongside every existing individual button, not
    replacing any. Progress dialog shows "Step X of 5: [name]..." live,
    updating per step, plus a per-step status list; `router.refresh()` on
    success so other page sections show fresh data without a manual reload.
    Verified two ways: `GenerateAllButton.spec.tsx` (real RTL component
    render + click, mocked actions) proves the sequencing/skip/stop-on-
    failure logic; a real, temporary script against local Ollama + real
    `dev.db` (deleted after) ran all 5 steps for real on one fresh fixture
    job — ~81s keyword extraction, ~69ms scoring, ~311s tailored summary,
    ~524s cover letter, ~322s cold email (**~20.6 min total**) — and
    confirmed all 5 outputs correctly saved together on one Job row. Full
    detail in ARCHITECTURE.md's "'Generate All'" section.

12. **Resume upload/extraction bug fix** (`feature/fix-resume-upload-extraction`)
    — user reported an uploaded PDF resume showing as "27 characters,
    essentially empty" for ATS scoring/AI generation. Root cause was **not**
    missing PDF/DOCX extraction — that infrastructure (`src/lib/ai/import/
    extract-text.ts`: `unpdf` for PDF, `mammoth` for DOCX, magic-byte
    sniffing, decompression-bomb preflight, timeout) and the AI-structuring
    pipeline (`/api/ai/resume/import` → `ResumeImportSchema` → review cards →
    `resolveImportCard` writes `ContactInfo`/`ResumeSections`) already existed
    and worked correctly. The actual bug: `ResumeContainer.tsx`'s "Structure
    with AI" button was gated behind an `aiReady` flag that only became `true`
    inside a `getUserSettings()` callback, and **only if** a `UserSettings`
    row with a saved `ai` settings blob existed. A user who never opened AI
    Settings (the default state — confirmed zero `UserSettings` rows for the
    real account) never saw the button at all, so a plain file upload
    (`/api/profile/resume` POST) just creates a title-only `Resume` row with
    no `ContactInfo`/`ResumeSections` — `convertResumeToText` then produces
    literally `# {title}` (~27 chars for this title), matching the report
    exactly. Fixed by defaulting `aiReady` to `true` using `defaultModel`
    (same pattern `AiResumeReviewSection`/`AiJobMatchSection` already use —
    button always available, Ollama connectivity checked async, never gated
    on a saved-settings row existing). Backfilled the two pre-existing empty
    resumes via a temporary script running the real extraction+AI-structuring
    pipeline against the real uploaded PDF (`llama3.2:3b`, ~760s and ~533s):
    both now have real `ContactInfo` (name, real email), 3 work experiences,
    2 education entries, 3 certifications, and skills — `preprocessResume`
    output went from 27 chars to ~3,850 chars on both. Script + `server-only`
    stub deleted after. **Not done**: raw extracted text is not persisted
    anywhere — the AI-structuring step reformats it into schema fields, which
    is fine for ATS/generation today, but a future "tailor using the user's
    exact original wording" feature would need to either re-extract from the
    file on demand or add a raw-text cache field; flagged, not built.

13. **Gemini as default provider for cover letter + tailored summary**
    (`feature/gemini-default-provider`) — provider abstraction, registry
    entry, factory (`createGoogleGenerativeAI`), verifier, models API route,
    and `resolveApiKey`'s env-var fallback for `GEMINI_API_KEY` **already
    existed in full** before this change (this app already supported Gemini
    as a selectable provider everywhere). What was missing was making it the
    *default* for `generateCoverLetter`/`generateTailoredSummary` specifically
    (not ATS keyword extraction or cold email — both untouched, still
    Ollama-default), while leaving Ollama fully available as an explicit
    user override in AI Settings. Added `resolveCoverLetterAi()` in
    `coverLetter.actions.ts`: defaults to `{provider: gemini, model:
    DEFAULT_GEMINI_MODEL}` unless a `UserSettings.ai.provider` is explicitly
    saved, in which case that's honored (including falling back to
    `DEFAULT_OLLAMA_MODEL` if a saved Ollama preference omits a model).
    **Model name discrepancy, verified live 2026-07-19**: the requested
    `gemini-2.5-flash` returns `404 "no longer available to new users"` on
    this account's key, and `gemini-2.0-flash`/`gemini-2.0-flash-001` return
    `429` quota-exceeded (this is the same "zero-quota" issue noted in .env
    on 2026-07-18 — still true for those specific models). `gemini-flash-
    latest` is the model that actually works (confirmed via direct API call
    and a full generation test) — used as `DEFAULT_GEMINI_MODEL` in
    `src/lib/ai/config.ts` instead. `GenerateAllButton.tsx`'s steps 3+4
    (tailored summary, cover letter) now run via `Promise.all` instead of
    sequentially, since neither depends on the other's output; the progress
    headline was extended to show multiple simultaneously-running/failed
    step indices. Guardrail pipeline (`generateVerifiedContent`, writing-
    tells, factual-accuracy) untouched — only the model call underneath
    changed. **Verified for real**: a fixture job under the akbaridhruvil53
    account (using its now-backfilled resume from item #12) ran the actual
    parallel Gemini calls — both `verified: true` on the first attempt,
    11.7s total wall-clock (well under the 60s target), real grounded
    content (16% downtime reduction, 51%→60% OEE, actual certs — no
    fabrication). Fixture job deleted after; script + `server-only` stub
    deleted per the established verification pattern.

14. **ATS scoring crash on German job descriptions** (`feature/fix-ats-
    scoring-de-dictionary`) — "Generate All" failed at the scoring step
    (not keyword extraction) with a Node TypeError: `"The 'path' argument
    must be of type string or an instance of Buffer or URL. Received an
    instance of URL"`. Root cause: `dictionary-de` (the German Hunspell
    wordlist package used by `src/lib/ats/adapters/de-dictionary.ts`, German-
    only) does `fs.readFile(new URL('index.dic', import.meta.url))` — valid
    in plain Node ESM, but Turbopack's bundling of `import.meta.url` in
    server code produces a URL instance Node's fs internals reject. This is
    the only fs+URL touchpoint anywhere in the ATS scoring call chain, and
    only reachable from the scoring step (keyword extraction is a separate
    Ollama call that never loads the German wordlist) — matches the exact
    symptom. Fixed via `serverExternalPackages: ["dictionary-de"]` in
    `next.config.mjs` (excludes it from bundling so Node's native loader
    handles it) plus a new 15s timeout around the scoring call
    (`APP_CONSTANTS.ATS_SCORING_TIMEOUT_MS` in `src/lib/constants.ts`,
    wrapping `scoreResumeAgainstKeywords` in `atsScore.actions.ts`) so a
    hung load fails fast instead of blocking. **Verification gap, be
    aware**: could not get a live authenticated-browser reproduction —
    resetting a test account's password and forging a session cookie were
    both off-limits as credential/auth-sensitive actions (the former was
    explicitly blocked by the sandbox's safety classifier). Two synthetic
    repro attempts (an isolated `scoreResumeAgainstKeywords` call, and a full
    replica of `scoreJob`'s exact internals against a real German job + the
    real backfilled resume from item #12, both run inside the actual
    Turbopack dev server via a temporary debug API route) did **not** crash
    either before or after the fix — plausibly because Turbopack bundles
    code differently when reached via a genuine Server Action RPC (real
    button click) vs. a plain route.ts import. If this resurfaces, that
    action-vs-route bundling distinction is the next thing to chase — don't
    assume the fix is fully confirmed end-to-end just because it's merged.

15. **Gemini default extended to ATS extraction + cold email**
    (`feature/gemini-default-ats-extraction`) — Ollama was still loading a
    local model into RAM (system-wide lag on a 16GB machine) whenever
    "Generate All" ran, because 2 of its 5 steps — `extractJobKeywords` and
    `generateColdEmail` — still defaulted to Ollama even after cover letter/
    tailored summary were switched to Gemini in the prior session. Extracted
    the provider-default logic into a shared `src/lib/ai/default-provider.ts`
    (`resolveDefaultAi`) and switched both remaining call sites. `scoreJob`
    makes no AI call at all — pure local ATS core computation, never a
    factor. **Confirmed via grep audit**: no `getModel` call in
    `atsScore.actions.ts`/`coverLetter.actions.ts`/`GenerateAllButton.tsx`
    falls back to `DEFAULT_OLLAMA_MODEL`/Ollama unless `resolveDefaultAi`
    found an explicit saved provider in `UserSettings`. **Real E2E result,
    important caveat**: ran the actual 5-step sequence for real (fixture job,
    real backfilled resume) — step 1 (extract keywords) succeeded in 10.8s
    (17 keywords), step 2 (score, local) in 86ms, but steps 3+4 (parallel
    summary + cover letter) hit a **Gemini free-tier 429 quota error**
    ("limit: 20... model: gemini-3.5-flash" — that's what `gemini-flash-
    latest` currently resolves to on this account) after 3 retries. Full
    "ALL 5 STEPS PASSED" could **not** be confirmed end-to-end on this test
    run because of the exhausted daily quota, not a code defect — each
    Generate All run makes ~4 base Gemini calls plus extra
    `generateVerifiedContent` fact-check calls on top, so a 20-req/day
    free-tier cap can be exhausted in as few as 2-3 runs. **This is a real,
    live operational risk to flag, not just a one-off test-day fluke** —
    revisit if a paid Gemini tier or per-user quota tracking becomes
    necessary; don't assume "Ollama lag is gone" fully solves the UX problem
    without also solving for this.

## Known, accepted flakiness
`AddJob.spec.tsx` — 2 form-submission tests time out at 5000ms **only**
under full-suite parallel load (CPU contention across ~97 test files);
17/17 pass in isolation. Confirmed pre-existing, not caused by any session's
changes. Not modified — don't "fix" this without re-confirming it's still
just load-related.

## Immediate next steps
1. **Full-OAuth Gmail integration is next** (auto-tracking, not the compose
   link built in #8). Read DECISIONS.md's "Gmail-integration security prep"
   entry *before* designing anything — it has concrete requirements (encrypt
   tokens like the existing `ApiKey` pattern, minimal scopes, OAuth `state`
   validation, fence all email content through the prompt-fencing module
   from day one, login rate limiting becomes non-theoretical once real
   tokens exist).
2. `main` is ahead of `origin/main` — push only if/when asked.
3. Two flagged-but-unresolved local-model limitations remain open (see
   items 3 and 4 above) — revisit if real usage shows either is too noisy,
   not proactively.

## Full feature list agreed (see ARCHITECTURE.md for technical detail)
Gmail auto-tracking (confirm-on-downgrade, full OAuth) — next up. EN+DE ATS
scoring ✅, cold email ✅, writing guardrails ✅, DIN 5008 + German B1 ✅,
job-language persistence ✅, security hardening ✅, Send Email (compose-link
v1) + Mark as Applied ✅, cover letter generation ✅, resume-tailoring
summary ✅. Still not started: docx/pdf CV export, JD-adaptive CV structure,
company-mismatch guardrail, recruiter-persona weighted scoring, interview
prep Q&A module, LinkedIn networking assistant (manual-send only).

## Corrections to keep in mind
- `coverLetter.actions.ts` now has **three AI-generation functions**
  (`generateColdEmail`, `generateCoverLetter`, `generateTailoredSummary`)
  alongside the original manual CRUD — if you see an old note claiming this
  file has no AI generation, that's stale.
- Language is now a **persisted per-job field** (`Job.language`), not
  fresh-detected per call — if you see code still calling `detectAtsLanguage`
  directly from an action (rather than through `resolveJobLanguage`), that's
  a regression, not the current design.
