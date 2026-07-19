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
