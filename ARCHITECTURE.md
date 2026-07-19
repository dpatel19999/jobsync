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
| Natural-writing + guardrail pass ✅ done | See "Writing guardrails module" section below | `coverLetter.actions.ts`'s `generateColdEmail` calls `generateVerifiedContent` instead of `generateText` directly |
| Region/language (DIN 5008 + German B1) ✅ done | See "Region/language module" section below | Extends the Phase 1 guardrail module; `coverLetter.actions.ts`'s `generateColdEmail` branches EN/DE |
| Recruiter-persona scoring | `src/lib/review/persona-score.ts` — weighted rubric from persona doc (Technical Fit 25%, Experience 20%, Cultural Fit 20%, Communication 15%, Motivation 10%, Availability 10%) | Runs after generation, before showing user the draft |
| Interview prep | `src/actions/interviewPrep.actions.ts`, new `PrepQuestion` model | New UI page, links to `Job` |
| LinkedIn networking assistant | `src/lib/linkedin/finder.ts` (manual-trigger search/draft only, no auto-send) | New UI section, reminder tied to `Job` |

## Data model additions needed (Prisma schema)
- `GmailAccount` (encrypted OAuth tokens, mirrors `ApiKey` pattern)
- `ColdEmail` (mirrors `CoverLetter`) — ✅ done
- `JobKeyword`, `Job.atsScore`/`atsScoreData` — ✅ done (see below)
- `PrepQuestion` (linked to `Job`, round type, question, draft answer)
- `region`/`language` field on `Job` — **still not built, still deliberately
  deferred** even now that the DIN-formatting phase has landed. Cold email's
  EN/DE branch (see "Region/language module" below) reuses the ATS module's
  fresh per-call language detection instead of a persisted field, same
  choice ATS scoring made. A persisted, user-overridable field is a real
  gap (a German company can post an English JD, or vice versa, and
  detection-from-JD-text would guess wrong) but adding it means a schema
  migration plus a UX decision on where a user overrides it — flagged for
  review in DECISIONS.md rather than built without the user's input on the
  UX question.

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

## Test suite additions (done, built on top of `feature/region-language`)

Test files added, all following the established `__tests__/<name>.spec.ts`
convention (see "Test suite additions" note below for how that convention
was found):
- `__tests__/writing-tells.spec.ts`, `region-language.spec.ts` — pure
  detector unit tests for the two guardrail modules.
- `__tests__/factual-accuracy.spec.ts`, `generate-verified.spec.ts` — mock
  the `ai` SDK's `generateText`, so these run fast/deterministically with
  no real Ollama calls needed to test the orchestration logic (regenerate-
  once-on-failure, warning surfacing, soft-check wiring).
- `__tests__/scorer.spec.ts`, `de-compound.spec.ts` (synthetic dictionary,
  umlaut/ß focused), `ats-de-adapter.spec.ts` (integration-style, real
  `dictionary-de` package), `language-detect.spec.ts` (EN/DE plus the
  non-EN/non-DE fallback edge case).
- `__tests__/text-processing.spec.ts` — extended (not duplicated) with a
  ReDoS regression guard and a documented cap-tradeoff test (see bug list
  below); the rest of that file's coverage already existed.
- `__tests__/preprocessing-job.spec.ts`, `ai-config.spec.ts` — job-
  description edge cases (empty/minimal/huge/malformed) and
  `truncateForProvider`.
- `__tests__/coverLetter.actions.spec.ts` — extended (not duplicated) with
  a `generateColdEmail` describe block covering missing-job/missing-resume/
  too-short-resume error paths, EN/DE prompt routing, `TEXT_LIMITS`
  truncation, warning surfacing, and two-concurrent-calls behavior.
- `__tests__/atsScore.actions.spec.ts` — new file (no prior ATS-scoring
  tests existed); covers the same category of edge cases for
  `extractJobKeywords`/`scoreJob`, plus a non-EN/non-DE `scoreJob` test that
  deliberately does NOT mock `@/lib/ats`, exercising the real scoring
  pipeline end to end.

Real bugs found and fixed while writing this suite (full rationale in
DECISIONS.md):
1. `jsdom` missing devDependency — `vitest.config.ts` declared it as the
   test environment, but it was never installed, so `npx vitest run` failed
   outright regardless of which tests existed.
2. `hasContactPatterns`'s email regex — ReDoS-shaped quadratic backtracking
   against long text with no `@`; confirmed ~6.2s on 60,000 chars inside
   `extractMetadata`, which runs before any length validation. Fixed with a
   bounded 2,000-char prefix scan; regression test added.
3. `TEXT_LIMITS` dead code — defined, never wired into any prompt builder.
   Added `truncateForProvider()`, wired into `generateColdEmail` and
   `extractJobKeywords` only (this session's assigned features).
4. Two real bugs in `detectWritingTells` itself — missed the "isn't just X"
   contraction, and the rule-of-three regex didn't match CLAUDE.md's own
   canonical example.
5. A stale assertion in the pre-existing `__tests__/job.actions.spec.ts`
   (expected `getJobDetails`'s `include` shape from before `ColdEmail`/
   `Keywords` were added in earlier, already-merged sessions) — this only
   surfaced now because the entire pre-existing suite couldn't run before
   bug #1 was fixed.

**Known, confirmed-non-regression flakiness**: `__tests__/AddJob.spec.tsx`'s
two form-submission tests time out at the default 5000ms only when the
full 97-file suite runs together (CPU contention); they pass reliably
(17/17) in isolation. Not modified — unrelated to any file this session
touched, and the timeout is a pre-existing tight bound, not a logic bug.

## Writing guardrails module (done, branch `feature/writing-guardrails`)

Layout under `src/lib/ai/guardrails/`, exported via the `@/lib/ai` barrel so
any generation feature imports it rather than duplicating logic:
- `writing-tells.ts` — `AI_WRITING_TELL_RULES`, a single shared prompt-text
  constant with the CLAUDE.md AI-writing-tell ban list (expanded from the
  copy that used to live directly inside `cold-email/system.ts`). Also
  exports `detectWritingTells(text)`, a regex-based heuristic detector for
  the same patterns (rule-of-three adjective stacking, em-dash overuse,
  "not just X, it's Y", Furthermore/Moreover openers, inflated-significance
  closers, buzzword filler) — soft/advisory only, used by
  `generateVerifiedContent` to `console.warn` (non-blocking) and by
  verification scripts, not to gate/regenerate.
- `factual-accuracy.ts` — `verifyFactualAccuracy(model, draft, { resumeText,
  jobText })`, a second non-streaming Ollama call whose only job is to read
  a generated draft against the source resume/job text and report any claim
  about the candidate that isn't supported by those source facts. This is a
  hard constraint (CLAUDE.md rule #1) — a stricter generation prompt alone
  isn't a check, it verifies the actual output.
- `generate-verified.ts` — `generateVerifiedContent({ model, system, prompt,
  temperature, facts })` orchestrates: generate → verify → on failure,
  regenerate once with the unsupported claims appended to the prompt →
  verify again → if still failing, return the content anyway with a
  non-null `warning` string instead of silently returning it as clean. Every
  free-text outbound content generator (cold email now; future cover-letter
  AI-gen / CV tailoring) should call this instead of `generateText` directly.

`generateColdEmail` in `coverLetter.actions.ts` now calls
`generateVerifiedContent` instead of `generateText`, and returns a `warning`
field alongside `content`; `GenerateColdEmailButton.tsx` surfaces it as both
a destructive toast and an inline banner in the preview dialog if present.
Cover letters were checked and confirmed to still have zero AI generation
(pure manual CRUD) — so cold email is currently the only feature wired to
this module; the module itself doesn't assume that will stay true.

**Known limitation (flagged for review, see DECISIONS.md)**: the local 8B
`llama3.1` model used as the fact-checker is prone to false positives —
flagging reasonable paraphrases, rounded durations, or a job title that
appears elsewhere in the source text as "unsupported." Confirmed via direct
testing: it reliably catches genuinely fabricated claims (a fake employer,
a fake certification) but also sometimes flags legitimate, fact-supported
phrasing. The design already treats a failed check as "surface a warning for
human review," not "block/discard," which keeps this failure mode safe
(over-flagging costs a manual glance; under-flagging would let a fabrication
through silently) but it does mean warnings should be read as "worth a
second look," not "definitely wrong."

## Security hardening (done, merged to `main`)

Scope: secrets audit, dependency vulnerabilities, auth review, rate
limiting, prompt-injection fencing. Full findings/rationale in DECISIONS.md
(six entries); summary of code changes:
- `src/lib/ai/guardrails/prompt-fencing.ts` (new) — `fenceUntrustedContent()`
  wraps resume/JD text in `<<<UNTRUSTED_DATA>>>` markers (embedded markers
  stripped so input can't escape its fence); `PROMPT_FENCING_RULES` added to
  all three generation system prompts (cold email EN/DE, ATS keywords).
  Fourth guardrails file, exported via the same barrel.
- Rate limiting: the existing `checkRateLimit` (5 req/min/user, in-memory)
  now also guards `generateColdEmail`, `extractJobKeywords`, and
  `analyzeDiscoveredJob` — previously only the streaming API routes had it,
  leaving the slow (30–130s) Ollama-backed action buttons stackable via
  rapid clicks. `scoreJob` exempt (no model call).
- `auth.config.ts`: session strategy/expiry made explicit (`jwt`, 30 days —
  was already the implicit default, no behavior change).
- `npm audit fix` (non-breaking only): 14 → 6 vulnerabilities. The
  remaining 6 need semver-major changes and are documented/flagged in
  DECISIONS.md (promptfoo dev-tool chain + Next's bundled postcss), not
  forced.
- New `__tests__/prompt-fencing.spec.ts`; rate-limit rejection tests added
  to `coverLetter.actions.spec.ts` / `atsScore.actions.spec.ts`.
- Secrets audit across all 567 commits: clean except one inherited,
  already-removed hardcoded AUTH_SECRET default from upstream Docker files
  (details + why no rotation needed in DECISIONS.md). `.env`/`dev.db`
  properly ignored, never committed.
- Gmail-phase security prep flagged in DECISIONS.md (OAuth token
  encryption via the ApiKey pattern, minimal scopes, state validation,
  fencing email content, login rate limiting).

## Region/language module (done, branch `feature/region-language`)

Extends the writing guardrails module rather than duplicating it — new file
`src/lib/ai/guardrails/region-language.ts`:
- `DIN_5008_EMAIL_STRUCTURE` — prompt fragment: mandatory "Betreff:" subject
  line as the first line, formal salutation ("Sehr geehrte Damen und
  Herren," by default, or a named "Sehr geehrte Frau/Herr [Nachname]," if
  the job description names a contact), blank-line-separated body
  paragraphs, "Mit freundlichen Grüßen" formal closing, always "Sie" not
  "du". Based on current DIN 5008 email-correspondence conventions (subject
  line, salutation/closing formulas, paragraph structure) researched via web
  search this session — DIN 5008's page-layout rules (margins, address
  window, A4 page count) don't apply here since cold email is plain email
  body text, not a printed/attached letter.
- `GERMAN_B1_LANGUAGE_RULES` — prompt fragment for CLAUDE.md's B1 cap:
  simple vocabulary, ~15-20 word sentences, no Konjunktiv II, no idioms, no
  heavy Nominalstil.
- `GERMAN_WRITING_TELL_RULES` — `AI_WRITING_TELL_RULES` (Phase 1) plus
  German-specific additions ("nicht nur X, sondern auch Y", stacked German
  formal transitions, German adjective-triplet stacking) — literally
  extends the Phase 1 constant rather than a parallel list.
- `detectGermanB1Violations(text)` — same soft/advisory role as Phase 1's
  `detectWritingTells`: regex heuristic for Konjunktiv II markers
  (würde/hätte/wäre/könnte), sentences over ~25 words, and "nicht nur ...
  sondern auch" framing. Wired into `generateVerifiedContent` (see below) —
  not a new parallel check path.

`generateVerifiedContent` (Phase 1) gained an optional `language?: "en" |
"de"` arg; when `"de"`, it also runs `detectGermanB1Violations` and
`console.warn`s any hits, the same non-blocking pattern as the English
writing-tell check.

New prompt variants under `src/lib/ai/prompts/cold-email/`: `system-de.ts`
(`COLD_EMAIL_SYSTEM_PROMPT_DE`, composed from the three fragments above) and
`user-de.ts` (`buildColdEmailPromptDe`) — separate files/functions rather
than branching inside the existing `system.ts`/`user.ts`, so the English
path is untouched.

`generateColdEmail` (`coverLetter.actions.ts`) originally called
`detectAtsLanguage` fresh on every call; **superseded by the persisted
`Job.language` field** — see "Job language persistence" section below.
Cover letters were re-confirmed to still have no AI generation, so language
selection only touches cold email and ATS scoring.

**Verified via a real, temporary script run against local Ollama** (deleted
after use, not committed): `detectAtsLanguage` correctly identified a German
job description as `"de"`. A full German cold email generated end-to-end
included a `Betreff:` line, a formal `Sehr geehrte Damen und Herren,`
salutation, a formal `Mit freundlichen Grüßen` closing, and no informal
`du`/`dein` — DIN 5008 structure held up well. Average sentence length was
18.7 words (within the ~15-20 word B1 target).

**Known limitation (flagged for review, see DECISIONS.md)**: the same
generation, despite the explicit "no Konjunktiv II" instruction, still used
`würde`/`könnten` three times. This is a real, reproducible instruction-
following gap in the local 8B model on a negative style constraint, not a
one-off — this is exactly why `detectGermanB1Violations` exists as a
runtime soft-check rather than only a prompt instruction.

CORRECTION to an initial claim made mid-session (see the "Test suite
additions" section near the top of this file for the accurate version):
this is NOT the repo's first test suite — an extensive pre-existing suite
already lives in `__tests__/*.spec.ts` (~78 files, ~1195 tests). An initial
scan missed it (searched `*.test.ts` only). That whole suite couldn't run
at all before this session (missing `jsdom`), which is also how a stale
assertion in `__tests__/job.actions.spec.ts` surfaced and got fixed.

## Job language persistence (done, merged to `main`)

Closes the gap flagged in the region/language module above (fresh per-call
detection would guess wrong for a German company posting an English JD, or
vice versa).

- `Job.language` — new nullable `String?` field (`"en" | "de"`), migration
  `20260718231153_add_job_language`.
- `resolveJobLanguage(userId, job, jobDescriptionText)` in `job.actions.ts`
  — reuses `job.language` if already set; otherwise detects via
  `detectAtsLanguage` and persists it. Called from `generateColdEmail`
  (`coverLetter.actions.ts`) and `scoreJob` (`atsScore.actions.ts`) instead
  of their old direct `detectAtsLanguage` calls, so first detection sticks
  and every later cold-email/ATS-scoring call for that job reuses it.
- `scoreResumeAgainstKeywords` (`src/lib/ats/index.ts`) gained an optional
  `languageOverride` param — when passed, skips its own `detectAtsLanguage`
  call entirely.
- `updateJobLanguage(jobId, language)` — manual override action, backing a
  new `JobLanguageSelect.tsx` dropdown (EN/German) on the job detail page,
  next to the cold-email and ATS-score buttons. Optimistic UI update with
  rollback-on-failure.
- Verified end-to-end against real Ollama + real `dev.db` (temporary script,
  fixture data cleaned up after): detect-and-persist on first call, reuse
  despite a deliberately mismatched-language JD on the second call, manual
  override persists and wins over the original JD text on a third call, and
  both real ATS scoring and a real live cold-email generation honored the
  override.

## Send Email + Mark as Applied (done, merged to `main`)

v1, deliberately lightweight: Gmail compose-window deep link only — no
OAuth, no Gmail API, no token handling. Separate in scope from the future
full-OAuth "Gmail integration" (see DECISIONS.md's "Gmail-integration
security prep" — that entry applies only to a possible later version, not
this one).

- `Job.emailTo` — new nullable `String?` field, migration
  `20260719112742_add_job_email_to`. Captured/edited directly from the Send
  Email dialog (not added to the Add/Edit Job form) via `updateJobEmailTo`.
- `src/lib/gmail-compose.ts` — pure, unit-tested URL builder:
  `buildGmailComposeUrl({ to, subject, body })` returns
  `https://mail.google.com/mail/?view=cm&to=...&su=...&body=...` using
  `URLSearchParams`, which percent-encodes every field (including line
  breaks as `%0A`, `&`/`=`/umlauts, etc.) correctly without any manual
  `encodeURIComponent`. `buildDefaultEmailSubject(senderName, jobTitle)`
  builds `Application — {name} — {title}`.
- `SendEmailButton.tsx` (job detail page, next to the cold-email/ATS-score
  buttons) — opens a dialog pre-filled from `job.emailTo`, a subject default
  computed from `job.Resume.ContactInfo` (added to `getJobDetails`'s Resume
  include) + `job.JobTitle`, and body pre-filled from
  `job.ColdEmail?.content` if one's been generated. "Open in Gmail" builds
  the URL, `window.open`s it in a new tab, and persists a changed recipient
  via `updateJobEmailTo`.
- `MarkAppliedButton.tsx` — standalone toggle backed by a new
  `toggleJobApplied(jobId, applied)` action, independent of
  `updateJobStatus`'s existing side effect of flipping `applied` when status
  changes to "applied"/"interview". Optimistic UI update with
  rollback-on-failure, same pattern as `JobLanguageSelect`.
- **Verified via a real Playwright click-through** against a throwaway
  fixture user/profile/resume/job in real `dev.db` (all fixture rows deleted
  after): logged in as the fixture user, opened the job detail page, clicked
  Send Email — the dialog was pre-filled with the exact expected
  recipient/subject/body (subject computed from the fixture's real
  firstName/lastName, body pulled from a real `ColdEmail.content` containing
  actual line breaks and an `&`). Clicking "Open in Gmail" opened a real new
  tab; since no Google account was signed into that browser, Google's own
  gateway redirected to `accounts.google.com`'s real sign-in page, preserving
  the entire original compose URL byte-for-byte in its `continue=` param —
  decoding it confirmed `to`/`su`/`body` matched exactly, umlauts and line
  breaks included. That is the honest ceiling of what's automatable without
  real Google credentials: it proves Google's own servers received the
  exact correct URL, not that Gmail's compose UI visually renders it.
  Separately confirmed Mark as Applied against the real database (not just
  the optimistic UI): the first attempt at asserting on the button's label
  alone was a false positive (the label flips before the server round-trip
  resolves), caught by checking `dev.db` directly afterward and finding
  `applied` still `false`; fixed by waiting for the success toast (which
  only fires after the awaited action resolves) before reading the DB, which
  then correctly showed `applied: true` with a real `appliedDate`.
