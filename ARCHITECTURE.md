# ARCHITECTURE.md

## Base repo — what already exists (confirmed by reading actual source)
- `src/actions/job.actions.ts` — application CRUD, `JobStatus` is a data table (not
  a fixed enum), so custom statuses (Phone Screen, Technical Round, Final Round,
  Ghosted) are just rows, no code change needed.
- `src/actions/coverLetter.actions.ts` — cover letter CRUD (title/content typed
  into a Tiptap editor) started as pure manual entry; **now also has AI
  generation** — `generateColdEmail` ✅, `generateCoverLetter` ✅, and
  `generateTailoredSummary` ✅ (resume-tailoring snippet) all live here as
  siblings to the CRUD functions, sharing one resume/job-resolution +
  guardrail pipeline. The underlying AI-calling convention traces back to
  `automation.actions.ts`'s `analyzeDiscoveredJob` (non-streaming
  `getModel()` + `generateText()`) and `src/app/api/ai/resume/match/route.ts`
  (streaming, client-picked model).
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
- `language` field on `Job` — ✅ **done** (`feature/job-language`, merged).
  Nullable, populated once on first detection, manually overridable — see
  the "Job language persistence" section near the end of this file.
- `tailoredSummary` field on `Job` — ✅ done (`feature/cover-letter-resume-
  tailoring`) — see "Cover letter generation + resume tailoring" section.
- `MasterTemplate` (versioned master resume/cover-letter templates) — ✅ done
  (`feature/master-templates`) — see "Master templates" section near the end
  of this file.

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

## Static cold-email template (done, merged to `main`)

Replaces the AI generation as the *default* body for Send Email — instant,
no Ollama call. Full AI generation is kept as an opt-in.

- `src/lib/coldEmailTemplate.ts` — `COLD_EMAIL_TEMPLATE` (verbatim,
  user-supplied text: German section, `English version;` separator line,
  English section) and `fillColdEmailTemplate(jobTitle, companyName)`, which
  does plain `.replaceAll()` substitution of `[Job Title]`/`[Company Name]`
  across the whole string (2 and 6 occurrences respectively, once/thrice per
  language section).
- `SendEmailButton.tsx` now initializes its body state from
  `fillColdEmailTemplate(jobTitle, companyName)` instead of an existing
  `ColdEmail.content`. A "Generate custom draft instead" button next to the
  Body label calls the existing `generateColdEmail` action (same as
  `GenerateColdEmailButton`, which is unchanged and still exists separately
  on the page) and swaps the body to its output on success.
- Verified via a real Playwright click-through against a throwaway fixture
  job (title "Automation Engineer", company "Beispiel AG", deleted after):
  opening Send Email showed the template instantly filled correctly in
  *both* language sections (checked both the German and English paragraphs
  individually), with no AI call made. Clicking "Open in Gmail" and decoding
  Google's sign-in `continue=` redirect (same method as the Send Email
  verification above) confirmed the full body — both languages, umlauts,
  the "English version;" separator — arrived at Google exactly as rendered
  in the dialog.

## Cover letter generation + resume tailoring (done, branch `feature/cover-letter-resume-tailoring`)

Both features reuse the existing generation infrastructure exactly —
`getModel()`/`generateText()` via `generateVerifiedContent` (factual-accuracy
+ writing-tell + German B1 guardrails), `checkRateLimit`, `resolveJobLanguage`
(persisted `Job.language`, no fresh per-call re-detection), and
`truncateForProvider`. No new guardrail logic was written.

**Part 1 — `generateCoverLetter(profileId, jobId)`** (`coverLetter.actions.ts`):
line-for-line the same shape as `generateColdEmail` (same auth/rate-limit
gate, same resume resolution — job's own → user default → most recent
profile resume, same `resolveJobLanguage` call, same `generateVerifiedContent`
call) — only the prompt pair and the target model differ. New prompt module
`src/lib/ai/prompts/cover-letter/` (`system.ts`/`user.ts` EN,
`system-de.ts`/`user-de.ts` DE using `DIN_5008_EMAIL_STRUCTURE` +
`GERMAN_B1_LANGUAGE_RULES` + `GERMAN_WRITING_TELL_RULES`, same imports
`region-language.ts` already exposes for cold email). Structure: opening
(role + interest) → 2-3 body paragraphs (resume facts mapped to JD
requirements) → closing (call to action + sign-off), ~250-400 words. Saves a
`CoverLetter` row and links `Job.coverLetterId` — identical persistence
pattern to `ColdEmail`. UI: `GenerateCoverLetterButton.tsx`, a straight copy
of `GenerateColdEmailButton.tsx`'s dialog pattern, added next to it on the
job detail page.

**Part 2 — `generateTailoredSummary(profileId, jobId)`** (same file): same
pipeline again, but the output (2-3 sentences) is saved directly on
`Job.tailoredSummary` (new nullable field, no separate document model — it's
a snippet, not a standalone letter/email) rather than linked via a
foreign key. New prompt module `src/lib/ai/prompts/tailored-summary/` — EN
uses `AI_WRITING_TELL_RULES` same as everywhere else; DE uses
`GERMAN_B1_LANGUAGE_RULES` + `GERMAN_WRITING_TELL_RULES` but deliberately
*not* `DIN_5008_EMAIL_STRUCTURE`, since a resume summary snippet isn't a
letter/email and has no salutation/subject-line structure to follow. UI:
`TailoredSummarySection.tsx` — unlike the cold-email/cover-letter dialogs,
its textarea is **editable, not read-only** (per requirement: the user
tweaks wording before copying it into their actual resume by hand; nothing
here ever writes to the resume file itself, only to `Job.tailoredSummary`).

**Verified via a real, temporary script run against local Ollama + real
`dev.db`** (`scripts/verify-cover-letter-tailoring.ts`, deleted after use,
fixture rows cleaned up): both `generateVerifiedContent` calls exercised the
real guardrail pipeline end to end (factual-accuracy check, writing-tell
check) against a real fixture resume/job pair. Cover letter generation took
~541s, produced a real 172-word letter, and persisted correctly linked via
`Job.coverLetterId` → `CoverLetter.content`. Tailored summary generation
took ~286s, produced a real 3-sentence summary, and persisted directly on
`Job.tailoredSummary` — confirmed by construction to never touch the resume
object (Part 2 receives resume text only, never a resume ID/file handle it
could write to). Both calls surfaced the factual-accuracy guardrail's
warning on paraphrase-level claims — the same known llama3.1 false-positive
pattern already flagged for cold email, not a new issue.

Not built (out of scope for this pass, not requested): a "save my edits
back" action for the tailored-summary textarea — the field regenerates the
same way each time; user edits are copy-paste-out only, matching the
explicit requirement not to auto-edit the resume.

## "Generate All" (done, branch `feature/generate-all`)

`GenerateAllButton.tsx`, added to the job detail page alongside (not
replacing) every individual generate button. Pure sequencer, no new
guardrail/AI logic: runs `extractJobKeywords` → `scoreJob` →
`generateTailoredSummary` → `generateCoverLetter` → `generateColdEmail` in
order, awaiting each and checking `.success`. `generateColdEmail` is
skipped if `job.ColdEmail` already exists (checked via a `hasColdEmail`
prop derived from `!!job.ColdEmail` at render time). A failure at any step
stops the sequence immediately — since every action persists its own
result independently, whatever succeeded before the failure stays saved;
no rollback exists or is needed.

Progress UI: a `StepState[]` array (`pending`/`running`/`done`/`error`/
`skipped`) rendered in a dialog, with a headline ("Step X of 5: [name]...",
"Failed at step X of 5: [name]", or "All steps completed.") plus a
per-step list showing status icon + any error message. On success,
`router.refresh()` runs once so the page's other sections (ATS score,
tailored summary, cover letter/cold email buttons) reflect the fresh data
without a manual reload.

**Verified two ways**: `GenerateAllButton.spec.tsx` (React Testing Library,
real component render + real click) proves the sequencing, the
skip-on-existing-ColdEmail branch, and stop-on-failure/keep-earlier-results
behavior, with the five underlying actions mocked. A real, temporary script
(`scripts/verify-generate-all.ts`, deleted after use) replicated the same
five actions in the same order against a real fresh job + real Ollama +
real `dev.db`: ~81s keyword extraction (11 keywords), ~69ms scoring (real
score 55, no Ollama call), ~311s tailored summary, ~524s cover letter (192
words), ~322s cold email (112 words) — **~20.6 minutes end to end**. Final
DB read confirmed all five outputs correctly saved together on one Job row
with no cross-step clobbering.

## Master templates (done, branch `feature/master-templates`)

Storage layer for the four master-template slots the user imports once and
reuses as source wording for a *future* AI-tailoring generation step (not
built yet — this pass is storage + upload UI + availability check only, no
generation reads these yet).

- `prisma/schema.prisma`'s `MasterTemplate` model (migration
  `20260719194821_add_master_template`): `userId`, `slot` (string:
  `"RESUME_EN"` | `"RESUME_DE"` | `"COVER_LETTER_EN"` | `"COVER_LETTER_DE"`),
  `version` (int, per-slot sequential), `isCurrent` (bool), `fileName`,
  `filePath`, `extractedText`, `createdAt`. `@@unique([userId, slot,
  version])` + `@@index([userId, slot, isCurrent])`.
- `src/models/template.model.ts` — `TemplateSlot`/`TemplateKind` enums,
  `TEMPLATE_SLOT_LABELS`, `templateSlotFor(kind, language)`, and
  `languageToTemplateLanguage()` (bridges `Job.language`'s persisted
  lowercase `"en"|"de"` to the slot naming's uppercase suffix — the one
  place that conversion happens).
- `src/actions/templates.actions.ts`:
  - `uploadMasterTemplate(slot, formData)` — same validation chain as resume
    upload (size cap, MIME allow-list, magic-byte content check reusing
    `PDF_MAGIC`/`ZIP_MAGIC` from the resume-import module), then reuses
    `extractText()` from `src/lib/ai/import/extract-text.ts` verbatim (no AI
    rewriting at import time, per requirement — the raw extracted text is
    stored as-is; tailoring happens at a future generation step, not here).
    Files land in `data/files/templates/` (mirrors `data/files/resumes/`).
    Versioning is a single `$transaction`: read the slot's current max
    version, flip any existing `isCurrent:true` row for that slot to
    `false`, then create the new row at `version+1, isCurrent:true` — the
    prior version's DB row and on-disk file are both left in place, never
    deleted.
  - `getMasterTemplates()` — current-version row per slot the user has
    uploaded at least once; unfilled slots simply don't appear (four slots
    aren't required).
  - `getTemplateForJobLanguage(kind, language)` — returns `data: null` (not
    an error) when the language is unset/undetected or no matching template
    exists for that kind+language; this is what backs the job-detail
    empty-state message.
- UI: `src/components/settings/TemplatesSettings.tsx`, added as a new
  "Templates" tab in `SettingsSidebar.tsx`/`dashboard/settings/page.tsx`
  (same `Card`-per-item layout as `ApiKeySettings.tsx`). Each of the four
  slots shows current filename + version + upload date (via `date-fns`
  `format`) or "No template uploaded yet", with an explicit "Import
  template" / "Import new version" button per slot (hidden file input,
  triggered on click — no drag-drop/auto-detect, per requirement).
- `src/components/myjobs/TemplateAvailabilityNote.tsx` — job-detail-page
  indicator, one instance each for `RESUME` and `COVER_LETTER`, wired into
  `JobDetails.tsx` right under the button toolbar (only rendered once
  `job.language` is set — before language detection there's nothing
  meaningful to check yet). Calls `getTemplateForJobLanguage` client-side on
  mount/language-change: renders "No {German|English} {resume|cover letter}
  template uploaded yet." in amber when missing, or a muted "Using {language}
  {kind} template: {fileName}" note when one exists. This is the mechanism
  that satisfies "don't silently fall back to the wrong language" — the gap
  is stated plainly rather than the (not-yet-built) generation step guessing.

**Verified via a real, temporary script** (`scripts/verify-master-templates.ts`,
deleted after use, same `server-only`-stub auth-bypass pattern as every
other verification script this session) against real Prisma + a real
previously-uploaded PDF resume file (213KB, from the resume-upload-bug-fix
item's fixture account): uploaded v1 into `RESUME_EN` (5,552 extracted
chars, correctly retrievable via the current-templates query), confirmed
`getTemplateForJobLanguage(COVER_LETTER, "de")` correctly returned `null`
before any German cover-letter template existed, uploaded v2 into the same
`RESUME_EN` slot and confirmed both v1 (`isCurrent:false`, still present —
not deleted) and v2 (`isCurrent:true`) rows existed side by side, uploaded
`COVER_LETTER_DE` and confirmed the same lookup now found it by filename,
and confirmed `COVER_LETTER_EN` (never uploaded) still correctly resolved to
`null`. Fixture rows and files cleaned up after (0 leftover rows confirmed).
`__tests__/templates.actions.spec.ts` (12 tests, mocked Prisma/fs/extractText)
covers the same scenarios plus validation-failure edge cases (invalid slot,
no file, disallowed MIME, magic-byte mismatch, extraction failure) faster
and deterministically for regression coverage going forward.

**Not built (explicitly out of scope for this pass)**: anything that reads
`extractedText` back out for actual generation — no cover-letter/resume
draft today pulls from a `MasterTemplate` row. That's the natural next step
once this storage layer exists.

## Position-locked resume rewrite (done, branch `feature/resume-rewrite`)

Replaces the old "Tailor Resume Summary" button/flow. Reads the master
template's `extractedText` (see above), not the structured
`Resume`/`ResumeSection` model — the AI may only reword existing wording,
never reorder or invent sections.

- `RewrittenResume` Prisma model (migration `20260719200941_add_rewritten_
  resume`), same shape as `CoverLetter`/`ColdEmail` (`profileId`, `title`,
  `content`, timestamps), linked via `Job.rewrittenResumeId`. `Job.
  tailoredSummary` and `generateTailoredSummary` (`coverLetter.actions.ts`)
  are **kept, unwired from the UI** — not deleted — so a user's previously
  generated summaries aren't destroyed by this change; nothing calls that
  action anymore.
- `src/lib/ai/guardrails/position-lock.ts` — `checkPositionLock(original,
  rewritten)`, a soft/advisory heuristic post-check (same category as
  `detectWritingTells`/`detectGermanB1Violations`, not a second AI call):
  splits both texts into non-empty lines and compares counts.
  **Line-based, not blank-line-paragraph-based** — real PDF/DOCX extraction
  (confirmed against a real extracted PDF) does not reliably produce blank
  lines between resume sections at all; a blank-line "block" heuristic tried
  first during verification showed 1 block vs 14, a false signal. Also
  exports `countNonEmptyLines()`, used by the prompt builders to tell the
  model the exact required line count up front (see below).
- `src/lib/ai/prompts/resume-rewrite/` (EN + DE `system`/`user` pairs) —
  system prompt frames the model as "a copy editor, not an author": may
  reword, may not add/remove/reorder. User prompt states the template's
  exact non-empty line count and instructs the model to hit that number
  exactly, plus an explicit warning not to rejoin/reflow PDF-wrapped lines
  into fewer, denser ones (the real failure mode found during verification
  — see below). DE path reuses `GERMAN_B1_LANGUAGE_RULES`/
  `GERMAN_WRITING_TELL_RULES`, not `DIN_5008_EMAIL_STRUCTURE` (a resume
  isn't a letter/email).
- `src/actions/resumeRewrite.actions.ts` — `rewriteResume(profileId,
  jobId)`: same shape as `generateCoverLetter`/`generateTailoredSummary`
  (rate limit, `resolveJobLanguage`, `callWithGeminiFallback`,
  `generateVerifiedContent` — the shared guardrail pipeline, unchanged),
  except the "resume text" source is `MasterTemplate.extractedText` for the
  job's language (via `templateSlotFor(RESUME, language)`), not a resolved
  `Resume` row. If no matching template exists, fails with a clear message
  ("No German resume template uploaded yet...") **before** attempting
  generation — same message text `TemplateAvailabilityNote` shows. After
  generation, runs `checkPositionLock` against the *actually-sent* (i.e.
  post-`truncateForProvider`) template text, not the raw stored template —
  the model can only preserve lines it actually received. A mismatch
  appends a warning (combined with any factual-accuracy warning) rather
  than blocking, matching every other soft guardrail in this codebase.
  `truncateForProvider` gained a new `"RESUME_REWRITE"` kind with a much
  larger budget than the existing `"RESUME"` kind (`TEXT_LIMITS` in
  `config.ts`: Ollama 6,000 / Cloud 20,000 vs. 1,500 / 4,000) — truncating a
  full resume down to a highlights-sized excerpt would itself violate
  "don't remove content" before the model even runs.
- Output title follows the agreed naming convention:
  `Dhruvil_Akbari_{CompanyName}_Resume` (sanitized company name). **Not
  built**: an actual downloadable `.docx` file at that filename, with or
  without the original template's visual formatting reconstructed — flagged
  per the task's own instruction rather than guessed at. Today's output is
  plain rewritten text in a read-only dialog (same UX pattern as
  `GenerateCoverLetterButton`), stored as `RewrittenResume.content`. Real
  DOCX generation (and the harder question of whether to reconstruct the
  original template's visual formatting or produce a clean new layout) is a
  separate, not-yet-scoped task.
- UI: `RewriteResumeButton.tsx` replaces `TailoredSummarySection.tsx`
  (deleted). Checks template availability itself on mount/language-change
  (`getTemplateForJobLanguage`); if the job's language is known and no
  template exists, renders `TemplateAvailabilityNote` (missing-state) in
  place of the button instead of offering a button that can only fail —
  satisfies "don't silently fall back to the wrong language." The generic
  `TemplateAvailabilityNote` row on the job detail page now only shows the
  Cover Letter one; the Resume one moved into this button. `GenerateAll
  Button.tsx`'s step 3 (`generateTailoredSummary`, run in `Promise.all` with
  step 4's `generateCoverLetter`) is now `rewriteResume`, same concurrency.
- **Verified via a real, temporary script** (`scripts/verify-resume-
  rewrite.ts`, deleted after use) against real Prisma, a real German-language
  PDF resume (the same one backfilled in the resume-upload-bug-fix item —
  confirmed to genuinely be German content, "AUSBILDUNG"/"BERUFSERFAHRUNG"
  headers etc.), a real pre-existing tracked job (Goldwind, `language: "de"`
  already persisted), and real Gemini (`gemini-flash-lite-latest`). Full
  guardrail pipeline ran for real: `generateVerifiedContent` returned
  `verified: true` on the first attempt (no fabricated claims), and the
  German B1 soft-check correctly fired a non-blocking warning for one
  over-length sentence — guardrails working exactly as designed, nothing
  new here. **Position-lock, honest result**: the *first* real run (before
  the exact-line-count prompt addition) showed real, significant drift —
  87 template lines vs. 66 rewritten (a 24% reduction, the model had
  rejoined several PDF-line-wrapped bullets into denser lines). Adding the
  explicit "the input has exactly N lines, hit N exactly" instruction (one
  round of prompt tightening, matching the precedent already set for the
  factual-accuracy/B1 guardrails elsewhere in this codebase) improved this
  to 87 vs. 86 — a single line off, not zero. **This is a real, reproducible
  small-model-compliance gap, not a code defect** — same category as the
  already-documented German-B1/Konjunktiv-II and factual-accuracy-false-
  positive limitations. The guardrail correctly caught and flagged even
  this small residual mismatch rather than silently accepting it, which is
  the entire point of having it as a post-check rather than trusting the
  prompt alone. Not chased further this pass (see DECISIONS.md) — matches
  this codebase's established practice of one tightening pass, then
  document and revisit only if real usage shows it's too noisy.

## Resume rewrite .docx export (done, branch `feature/resume-rewrite-docx-export`)

Closes the "not built" gap flagged at the end of the previous section — a
real, downloadable `.docx` at the agreed
`Dhruvil_Akbari_{CompanyName}_Resume.docx` naming, reconstructing the
original master template's formatting where that's actually possible.

- **New dependencies** (all previously only transitive, now explicit since
  this code imports them directly): `jszip` (unzip/rezip a .docx — a .docx
  is a ZIP archive of XML parts), `@xmldom/xmldom` (parse/serialize
  `word/document.xml`), `docx` (build a clean document from scratch for the
  fallback path — a different, complementary problem from editing an
  existing one).
- `src/lib/docx/rewrite-docx.ts`:
  - `buildFormattedDocx(originalDocxBuffer, rewrittenLines)` — the primary,
    formatting-preserving path, used only when the original master
    template was itself uploaded as a `.docx`. Unzips the original, parses
    `word/document.xml`, finds every `<w:p>` paragraph (wherever it occurs
    — body, table cells, etc.; headers/footers live in separate XML parts
    and are correctly left untouched, since `extractText()`'s mammoth-based
    extraction — what the AI actually rewrote from — doesn't cover them
    either), filters to paragraphs with non-empty text, and requires that
    count to exactly match `rewrittenLines.length` — otherwise throws
    `DocxStructureMismatchError` rather than writing into a misaligned
    paragraph. For each aligned paragraph, only the `<w:t>` text-node
    content is replaced (new text goes on the first run, later runs in the
    same paragraph are cleared) — `<w:pPr>`/`<w:rPr>` (paragraph/run
    formatting: font, bold, size, spacing) are never touched, which is what
    makes fonts/headers/spacing/layout survive. Re-zips and returns the new
    file.
    **Known, flagged limitation**: a paragraph with *mixed* run formatting
    on one line (e.g. a bold word followed by plain text in the same
    sentence) collapses onto the first run's formatting for the whole
    reworded line — there's no general way to know which reworded words
    should keep which original run's styling, so this takes the simpler,
    honest option rather than guessing at a word-level mapping. Complex
    table-heavy layouts are walked the same as body paragraphs but may not
    line up with how `extractText()` linearized that content, in which case
    it throws (see fallback below) rather than corrupting the file.
  - `buildPlainDocx(rewrittenLines)` — fallback, used when the original
    template wasn't a `.docx`, its paragraph count no longer matches the
    rewritten line count (e.g. re-uploaded after the rewrite was
    generated), or the source file is missing from disk. Builds a clean
    document from scratch with the `docx` package — all-caps lines
    (matching the real fixture resume's own section-heading convention)
    get bolded, everything else is plain. **Not visually the original** —
    this is the honest "best available approach" for a case where 1:1
    reconstruction genuinely isn't possible (a PDF has no editable
    paragraph structure to reconstruct into), not a silent approximation.
- **`RewrittenResume.sourceTemplateId`** (new nullable FK to
  `MasterTemplate`, migration `20260719205222_add_rewritten_resume_source_
  template`) — pins the *exact* template version a rewrite was generated
  from. Without this, downloading later would re-resolve "the current
  template for this slot," which could have changed (a new version
  uploaded) since the rewrite was generated — silently misaligning
  `buildFormattedDocx`'s paragraph mapping. Resolvable indefinitely because
  `MasterTemplate` rows are never deleted on re-upload (see the master-
  templates section above).
- `src/lib/resume-naming.ts` — `buildResumeDocumentName(companyName)`
  extracted out of `resumeRewrite.actions.ts` (which used it for
  `RewrittenResume.title`) so the download route's filename can't drift
  from the saved title; both call the same function now.
- `src/app/api/resume-rewrite/docx/route.ts` (GET, `?jobId=`) — generates
  the `.docx` on demand (nothing cached on disk), following the same
  auth-in-the-route-handler + middleware-protected-by-default pattern as
  the existing `/api/profile/resume` download route. Resolves
  `RewrittenResume` + its pinned `sourceTemplate`, sniffs the original
  file's real type (magic bytes, reusing `sniffFileType` from the resume-
  import module — not the file extension), and picks `buildFormattedDocx`
  or `buildPlainDocx` accordingly; a caught `DocxStructureMismatchError`
  also falls back rather than erroring the whole request. Signals fallback
  usage to the client via `X-Docx-Formatting-Fallback`/`X-Docx-Fallback-
  Reason` response headers (URI-encoded) rather than baking it into the
  binary response body.
- UI: `RewriteResumeButton.tsx` gained a "Download .docx" button in the
  dialog footer, enabled once `content` exists (works for a resume rewrite
  generated in an earlier session too, not just the current one — the
  route re-reads from the DB by `jobId`). Uses the same
  fetch→blob→`createObjectURL`→synthetic-`<a download>` pattern already
  established by `DownloadFileButton.tsx`, reading the suggested filename
  from a custom `X-Docx-Filename` header (blob URLs don't carry
  `Content-Disposition` through to the anchor's `download` attribute, so
  the filename has to be passed explicitly). Shows a non-blocking toast
  with the fallback reason when the formatting-preserving path wasn't used.
- **Verified via a real, temporary script**
  (`scripts/verify-resume-rewrite-docx.ts`, deleted after use): since no
  real `.docx`-format resume exists in this repo's fixture data (only the
  PDF used in the earlier plain-text resume-rewrite verification), built a
  genuinely realistic `.docx` — the real fixture resume's actual German
  wording/structure (name bold, `AUSBILDUNG`/`BERUFSERFAHRUNG` headers
  bold), not placeholder text — using the same `docx` package the fallback
  path uses, which is the honest stand-in given the constraint. Ran the
  full real pipeline: real mammoth extraction (11 non-empty lines), real
  Gemini rewrite against the real Goldwind job (`language: "de"`,
  guardrail pipeline needed one regenerate attempt, then `verified: true`),
  real `buildFormattedDocx` — **this time the position-lock line count
  matched exactly (11 vs. 11)**, formatting-preserving path used, not the
  fallback. Confirmed the output is a structurally valid `.docx` (all
  three required OOXML parts present), round-tripped it back through the
  app's own trusted `mammoth.extractRawText()` and confirmed the output
  contains the exact rewritten German text, and confirmed the name line's
  bold formatting (`<w:b/>`) survived the rewrite. `__tests__/rewrite-
  docx.spec.ts` (7 tests) covers the same ground deterministically
  (formatting preservation, empty-paragraph handling, structure-mismatch
  error, invalid-file error, plain-fallback validity) plus edge cases not
  worth spending a real Gemini call on. Fixture rows/files cleaned up
  after (0 leftover rows confirmed).
- **Honest ceiling of this verification**: no Word/LibreOffice GUI is
  available in this environment, so "confirm it opens correctly" is proven
  by (a) the zip/XML structural checks and (b) round-tripping through this
  app's own already-trusted extraction pipeline — not by visually opening
  the file. This is the strongest automated proxy available here, not a
  claim of pixel-perfect visual confirmation.
