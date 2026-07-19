# DECISIONS.md

Format: Decision — Rationale

- **Fork JobSync instead of building from scratch** — MIT licensed, actively
  maintained, already has tracker/resume/cover-letter/AI-match features built.
  Faster to extend than rebuild.

- **Stack is TypeScript/Next.js, not Python** — JobSync itself is TS/Next.js.
  Forking means inheriting its stack rather than rewriting it in Python.

- **Fully local, no cloud deployment** — user's explicit requirement, data privacy.

- **JobStatus stays as JobSync's existing data-table pattern** — don't hardcode an
  enum; custom statuses (Phone Screen, Technical Round, etc.) are just new rows.

- **"ATS" in JobSync's existing code (`atsCompany.actions.ts`) is unrelated to our
  ATS scoring feature** — it means job-board (Greenhouse/Lever) integration. Our
  keyword-match scorer is a separate, new module. Don't conflate the two.

- **German ATS scoring needs its own algorithm** — literal keyword matching fails
  on German compound nouns and case endings. Needs compound-decomposition +
  stemming, scored separately from the English keyword-match scorer.

- **Gmail auto-updates: confident-positive auto-applies, downgrades need confirm**
  — user wants full automation, but status *downgrades* (e.g. Rejected) or
  low-confidence classifications pause for a one-tap human confirm, to avoid
  false positives silently corrupting the tracker.

- **No automated LinkedIn connection-request sending** — violates LinkedIn ToS,
  risks account restriction. Built the "finder + draft message + reminder"
  alternative instead; sending stays a manual human action.

- **CV section order is JD-adaptive, not fixed** — but content itself only ever
  reorders/re-weights real master-profile facts, never invents new content.

- **Master profile facts extracted into an explicit allow-list** — every generated
  draft is checked against it post-generation, not just prompted to "be honest."
  Guardrail is a validation step, not a trust assumption.

- **Company-specific content regenerated fresh per application, with a mismatch
  check** — triggered by a real bug found in the user's own MBDA draft (leftover
  wind-turbine-industry line from an unrelated application).

- **AI-writing-tell ban list is a concrete pattern list**, sourced from
  Wikipedia's "Signs of AI Writing" essay — not just a vague "sound human" prompt.

- **Recruiter-persona scoring rubric** uses the exact weighted dimensions from the
  user's uploaded persona doc (Technical Fit 25% / Experience 20% / Cultural Fit
  20% / Communication 15% / Motivation 10% / Availability 10%).

- **Adopted a context-file workflow** (CLAUDE.md / ARCHITECTURE.md / DECISIONS.md /
  MEMORY.md) inspired by the "How Senior Engineers Actually Build With AI in 2026"
  methodology (JavaScript Mastery) — reduces re-explaining context every session,
  and gives an explicit signal for when to start a fresh chat.

- **Cold email generation mirrors the `analyzeDiscoveredJob` AI-calling pattern
  from `automation.actions.ts`** (getModel + non-streaming generateText), not
  `coverLetter.actions.ts` — ARCHITECTURE.md's assumption that cover letters had
  AI generation was wrong; that file turned out to be pure manual CRUD (Tiptap
  editor, no model call). `generateColdEmail` still lives in
  `coverLetter.actions.ts` as instructed (sibling to the cover letter CRUD), it
  just borrows its AI-calling convention from automation.actions.ts instead.

- **`OLLAMA_BASE_URL` fixed from `host.docker.internal` to `127.0.0.1`** in
  `.env` — the checked-in default assumed Docker, but CLAUDE.md's stack rule is
  native npm/Prisma with no Docker for local dev, so the Docker-only hostname
  never resolved.

- **`feature/ats-scoring` branches off `feature/cold-email`, not `main`** —
  the ATS UI sits next to the cold-email button on the job detail page, which
  only exists on the unmerged cold-email branch. Rebase onto `main` after
  cold-email merges, or merge cold-email first.

- **ATS scoring architecture: language-agnostic core + per-language adapters**
  (`src/lib/ats/core/scorer.ts` does pure set/weight/score math; `adapters/en.ts`
  and `adapters/de.ts` each turn text into normalized match tokens). Keeps the
  scoring math identical across languages and isolates all German-specific
  complexity in one place.

- **No maintained JS/npm library exists for German compound-noun
  decomposition** (checked npm registry + GitHub for `nnsplit`, `charsplit`,
  `german_compound_splitter` ports — none exist or `nnsplit` turned out to be
  sentence segmentation, not compounds, from a now-Python-only successor
  project). Built a dictionary-driven recursive splitter instead
  (`src/lib/ats/adapters/de-compound.ts`), using the `dictionary-de` npm
  package (maintained German Hunspell wordlist, same source LibreOffice/Firefox
  spellcheckers use) to validate split candidates, with linking-morpheme
  (Fugenelement: -s/-es/-n/-en/-e) stripping applied to *both* sides of a
  candidate split — the tail of a German compound still inflects in running
  text (e.g. "Datenanalysen", plural), so only stripping the left side missed
  real splits. This is user-approved: presented three options (self-built
  dictionary splitter / LLM-based via Ollama / Python subprocess bridge), user
  picked the dictionary splitter.

- **`snowball-stemmers` (npm) chosen for both EN and DE stemming** — a
  maintained transpile of the official Snowball algorithms covering 20+
  languages including English and German, so one dependency covers both
  adapters instead of two separate stemmer libraries.

- **`franc-min` (npm) chosen for EN/DE language detection** — lightweight,
  maintained, and this phase deliberately doesn't add a persistent
  `language`/`region` field to the Job model (that's the later DIN-formatting
  phase per ARCHITECTURE.md); detection just runs fresh each time from the
  job description text.

- **A keyword's required match tokens are either its whole-word stem OR its
  decomposed compound-part stems — never both together.** Requiring both
  over-constrains matching: a resume's inflected form of the same word (e.g.
  a plural that doesn't itself decompose cleanly) would fail the whole-word
  check even though the compound parts clearly match, and vice versa. Found
  via testing: "Datenanalysen" (resume, plural) failed to match "Datenanalyse"
  (keyword) until the whole-word-stem requirement was dropped in favor of
  parts-only once a split succeeds.

- **ATS keyword extraction reuses `automation.actions.ts`'s non-streaming
  `getModel()` + `generateText()` pattern** (same convention as cold email),
  not a new AI-calling shape — extraction is a quick save-and-done action, not
  a long-running streamed analysis.

- **Factual-accuracy guardrail is a second lightweight Ollama call, not just a
  stricter prompt** (`src/lib/ai/guardrails/factual-accuracy.ts`) — a prompt
  asking the model to "only use real facts" is still just a request; verifying
  the actual generated output against the source resume/job text is the only
  way to catch a violation after the fact. On failure it regenerates once with
  the specific unsupported claims appended to the prompt, then if still
  failing returns the content anyway with a non-null `warning` rather than
  silently returning unverified content as if it were clean — matches
  CLAUDE.md's "flag anything unverified instead of including it," which
  describes flagging, not blocking.

- **Natural-writing ban list extracted into one shared module
  (`src/lib/ai/guardrails/writing-tells.ts`)**, not duplicated per feature —
  `cold-email/system.ts`'s prompt now imports `AI_WRITING_TELL_RULES` instead
  of embedding its own copy. Kept as a soft/advisory constraint (embedded in
  the generation prompt, logged via `console.warn` if `detectWritingTells`
  still finds a hit post-generation) rather than a hard regenerate-and-block
  gate like the factual-accuracy guardrail — tone is subjective enough that
  auto-rejecting a draft over a heuristic regex match would produce more false
  rejections than it prevents bad tone.

- **FLAGGED FOR REVIEW: local `llama3.1` (8B, CPU-only) is an unreliable
  strict fact-checker** — confirmed via direct testing (see MEMORY.md) that
  it reliably catches genuinely fabricated claims (invented employer,
  invented certification) but also produces false positives on legitimate
  paraphrased content (e.g. flagged a resume's own "Backend Engineer"
  headline as unsupported, flagged "three years" as unsupported for a
  2022–2025 role). One round of prompt tightening (explicit
  paraphrase-tolerance rules, added during this session) did not eliminate
  it — this reads as a small-model attention/reading-comprehension limit,
  not a prompt-wording problem, so further prompt iteration was stopped
  rather than chased indefinitely. Sensible choice made and shipped: keep the
  guardrail (over-flagging is a safer failure mode than under-flagging, and
  the design surfaces a warning rather than blocking/discarding), document
  the limitation, and revisit only if it proves too noisy in real usage.
  Future options if it does: swap the verifier model, require 2/2 agreement
  across two independent fact-check calls before warning, or let the user
  dismiss/suppress a specific flagged claim.

- **RESOLVED (`feature/job-language`, merged to `main`)**: German cold-email
  language selection originally reused ATS scoring's fresh `detectAtsLanguage`
  (franc-min) per call, flagged below as a real gap. Built the persisted
  field: nullable `Job.language` ("en"|"de"), populated once on first
  detection (whichever of cold-email generation or ATS scoring runs first)
  via `resolveJobLanguage(userId, job, jobText)` in `job.actions.ts`, reused
  by every later call instead of re-detecting. UX decision made: a manual
  override dropdown (`JobLanguageSelect.tsx`) on the job detail page via
  `updateJobLanguage`, so a wrong guess is a one-click fix rather than
  needing a new job. `scoreResumeAgainstKeywords` gained an optional
  `languageOverride` param so scoring also skips re-detection once set.
  Verified end-to-end against real Ollama + real `dev.db` (fixture data
  cleaned up after): detect → persist → reuse-despite-mismatched-text →
  manual override → override-wins-over-original-text → real ATS scoring and
  a real live cold-email generation both honored the override.

- **DIN 5008 applied to cold email covers only the plain-text email
  conventions (Betreff line, salutation/closing formulas, paragraph
  structure), not DIN 5008's postal-letter page-layout rules** (margins,
  address window, page count) — those apply to a printed/attached
  Anschreiben, and cold email is plain email body text with no page. Cover
  letters (where page-layout rules would actually matter) are still pure
  manual CRUD with no AI generation, so there's nothing to apply DIN's
  layout rules to yet — this waits for cover-letter AI generation to exist.

- **`AI_WRITING_TELL_RULES` (English) is extended, not replaced, for German
  output** (`GERMAN_WRITING_TELL_RULES` = the same constant plus
  German-specific additions) — the underlying anti-patterns (rule-of-three
  stacking, formal-transition overuse, inflated closers) are largely
  language-agnostic in concept even though their exact trigger phrases
  differ per language, so duplicating the whole list per language would
  just be copy-paste drift waiting to happen.

- **FLAGGED FOR REVIEW: the local `llama3.1` model does not reliably follow
  the "no Konjunktiv II" instruction for German B1 output** — confirmed via
  direct testing: a real generated cold email used `würde`/`könnten` three
  times despite an explicit ban in the system prompt. Same category of
  issue as the factual-accuracy false-positive limitation above (a small
  local model not perfectly following an instruction) but here the failure
  direction is the opposite — under-enforcement of a stylistic rule rather
  than over-flagging a factual one. Mitigated the same way: a soft,
  non-blocking `detectGermanB1Violations` heuristic check now runs inside
  `generateVerifiedContent` for the German path and logs a warning, so the
  gap is at least visible rather than silent. Not escalated to a hard
  regenerate-on-violation gate (matching the Phase 1 decision to keep
  natural-writing/style constraints soft, not hard) — revisit if B1
  violations prove frequent enough in real usage to warrant blocking.

- **Test-hardening pass done on `feature/region-language` itself, not a
  separate `feature/test-hardening` branch** — a queued task asked for a new
  branch "based on whatever's latest once prior work is merged," but Phase 2
  was explicitly instructed to stay uncommitted pending review. Merging it
  just to satisfy the new task's branch-naming instruction would have broken
  that explicit hold. Flagged rather than guessed: kept everything on
  `feature/region-language`, still uncommitted, so the user reviews one
  consistent diff instead of two branches with overlapping/duplicated code.

- **`jsdom` installed as a devDependency** — `vitest.config.ts` already
  declared `environment: "jsdom"`, but the package was never actually
  installed, so the entire test suite failed to start at all (confirmed:
  zero test files existed in the repo before this session, and running
  vitest with zero tests errored with `Cannot find package 'jsdom'`). This
  is the missing half of an already-checked-in config, not a new tooling
  choice.

- **`TEXT_LIMITS` (already defined in `src/lib/ai/config.ts`, provider-aware
  resume/job character caps) wired into cold email and ATS keyword
  extraction via a new `truncateForProvider()` helper** — a repo-wide search
  confirmed `TEXT_LIMITS` was never referenced anywhere before this session,
  meaning long resumes/job descriptions were going into prompts completely
  uncapped. Fixed only within this session's three assigned features
  (cold email, ATS extraction); deliberately left job-match/resume-review/
  automation-match untouched since wiring those in too is a broader,
  unscoped change (touches prompt builders outside cold-email/ATS/
  guardrails) — flagged here rather than silently expanded to more files.

- **FLAGGED FOR REVIEW / FIXED: `hasContactPatterns` (in
  `src/lib/ai/tools/text-processing.ts`, shared by resume and job
  preprocessing) had a real ReDoS-shaped performance bug** — its email regex
  (`[\w.-]+@[\w.-]+\.\w+`) backtracks quadratically against long text with no
  `@` character. Confirmed directly: 60,000 characters of plain text took
  ~6.2 seconds in `extractMetadata` alone, and this runs on every resume/job
  *before* length validation even happens, blocking Node's single-threaded
  event loop for the whole request. Fixed by scanning only a bounded prefix
  (2,000 chars — contact info is always in a document's header) rather than
  rewriting the regex itself, since that's the smaller, more obviously-safe
  change. A regression test locks in that a 200,000-character run of
  contact-free text stays under 1 second. Found while testing the "very long
  job descriptions" edge case specifically requested for this pass — exactly
  the kind of thing that edge case was meant to surface.

- **Fixed two real bugs in `detectWritingTells`'s regexes while writing its
  test suite** (not just test-writing mistakes — the detector itself was
  wrong): the "not just X, it's Y" check only matched literal "not just",
  missing the equally-common contraction "isn't just X, it's Y" that
  CLAUDE.md's own ban-list wording explicitly calls out; and the
  rule-of-three adjective-stack check's suffix list (`-ing`/`-ive`/`-ed`)
  didn't match CLAUDE.md's own canonical example
  ("innovative, scalable, and robust" — "scalable" doesn't end in any of
  those). Replaced the suffix-matching approach with a case-sensitive
  three-lowercase-words-joined-by-comma-and pattern, which catches the
  canonical example while still avoiding false-positives on genuine
  capitalized tech lists ("Node.js, PostgreSQL, and AWS").

- **New test files moved from colocated `src/**/*.test.ts` to
  `__tests__/*.spec.ts` after discovering the established convention** —
  an initial repo scan for existing tests searched `*.test.ts` only and
  missed the ~78 pre-existing `__tests__/*.spec.ts` files entirely. Once
  found, all newly-written tests were relocated/rewritten to match: flat
  `__tests__/` directory, `@/` alias imports, `vi.mock("@prisma/client",
  ...)` for DB mocking (not `vi.mock("@/lib/db", ...)`), and the plain
  `vi.mock("ai", () => ({ generateText: vi.fn() }))` style (not
  `vi.hoisted`) already used by `ats-runner.spec.ts`/`greenhouse-
  runner.spec.ts`. `generateColdEmail`'s new tests were merged into the
  existing `__tests__/coverLetter.actions.spec.ts` rather than left in a
  separate file, since that file already covers the rest of the same
  action module. Two tests that would have duplicated existing
  `__tests__/text-processing.spec.ts` coverage were merged into that file
  instead of kept as a second, competing spec file.

- **`AddJob.spec.tsx`'s two form-submission tests are flaky under
  full-suite parallel load, not a regression from this session** —
  confirmed: both time out at the default 5000ms only when running all 97
  spec files together (CPU contention across worker processes), but pass
  reliably (17/17) when run in isolation. Not modified — the timeout is a
  pre-existing tight bound on a component test unrelated to any file this
  session touched, and patching it (e.g. raising the timeout) would mask
  environmental flakiness rather than fix a real bug. Flagged here in case
  it becomes a recurring CI annoyance as the suite continues to grow.

- **Secrets audit finding (informational, already remediated upstream): a
  hardcoded `AUTH_SECRET` default lived in `Dockerfile`/`docker-compose.yml`
  in this repo's inherited history** (value starting `Cft42e...`, from the
  upstream jobsync project; introduced and later removed before this fork's
  own work began). It is NOT present in any current file — today's
  docker-compose uses `${AUTH_SECRET:-your-auth-secret}` env interpolation —
  and the user's local `.env` AUTH_SECRET was checked (boolean match only,
  value never printed) and confirmed NOT to be that leaked default. No
  rotation needed since the app is local-only and the secret in use isn't
  the exposed one; the only way to purge it from history would be a rewrite,
  which is not worth it for an inherited, unused default on a local repo.
  Nothing else found: no AWS/Google/Slack/Stripe/GitHub token patterns, no
  private keys, no credential files, no `.env` or `dev.db` ever committed
  (both properly gitignored; only the placeholder `.env.example` is tracked).

- **npm audit: 14 → 6 vulnerabilities via plain `npm audit fix` (no
  breaking changes)** — fixed ws/engine.io/socket.io-adapter (high DoS),
  brace-expansion + markdown-it (moderate ReDoS), diff + esbuild (low).
  Remaining 6 all require semver-major changes and are FLAGGED, not forced:
  (a) 4 high in the `promptfoo` chain (`@huggingface/transformers`,
  `adm-zip`, `onnxruntime-node`) — dev-only eval tooling, never shipped or
  run in the app itself, and every newer promptfoo also depends on the
  vulnerable versions, so the only "fix" npm offers is a downgrade;
  (b) `next`/`postcss` (moderate) — Next.js is already at the latest 15.5.x
  patch; the advisory targets Next's *bundled* postcss copy and npm's
  proposed fix is `next@9.3.3`, an absurd 6-major downgrade. Real fix
  arrives whenever Next bumps its bundled postcss. Neither is worth
  breaking the app over on a local-only deployment.

- **Rate limiting added to the three Ollama-calling server actions
  (`generateColdEmail`, `extractJobKeywords`, `analyzeDiscoveredJob`) by
  reusing the existing `checkRateLimit`** (in-memory, 5 req/min/user, same
  limiter the AI API routes already used) rather than writing a second
  mechanism. The gap: the API routes were protected but the newer
  action-based generate buttons weren't, and each click can hold a CPU-only
  Ollama call for 30–130s — rapid duplicate clicks would stack them.
  `scoreJob` deliberately NOT rate-limited: it's pure local scoring math,
  no model call.

- **Prompt-injection fencing added as a guardrails module
  (`src/lib/ai/guardrails/prompt-fencing.ts`)** — resume text and job
  descriptions are untrusted input (scraped from job boards or pasted), and
  instruction-shaped text inside them ("ignore previous instructions...")
  goes straight into prompts. `fenceUntrustedContent()` wraps them in
  explicit `<<<UNTRUSTED_DATA>>>` markers (stripping any embedded markers so
  the input can't break out of its own fence), and `PROMPT_FENCING_RULES`
  in each system prompt (cold email EN/DE, ATS keywords) instructs the
  model to treat fenced content as data, never instructions.
  Defense-in-depth alongside the existing factual-accuracy post-check, not
  a replacement — chose delimiter fencing over pattern-based "sanitization"
  (stripping suspicious phrases) because filtering text out of a resume/JD
  corrupts legitimate content and is trivially bypassed.

- **Auth review conclusions (NextAuth v5 beta, credentials provider):**
  session handling now has an explicit `session: { strategy: "jwt", maxAge:
  30 days }` in `auth.config.ts` (previously implicit framework default —
  no behavior change, just documented intent; fine for a local single-user
  app). Verified: CSRF protection and `httpOnly` cookies are NextAuth
  built-ins; `secure` cookie flag auto-enables on HTTPS only, which is
  correct for localhost HTTP; every server action file checks
  `getCurrentUser()` except `auth.actions.ts` itself (signup/login — the
  one file that must be unauthenticated); middleware protects
  `/dashboard/*` and `/api/*` (except auth/mcp which have their own);
  bcrypt cost 10 for password hashing; login failures return a generic
  "Invalid credentials" (no user-existence oracle in the message itself).
  FLAGGED, not fixed (bigger than this pass): (a) no rate limiting on
  login/signup attempts — credential stuffing is theoretical on a local
  app but worth doing when Gmail lands; (b) the signup flow has no
  password-strength requirement beyond zod's 6-char minimum; (c) timing
  difference between "user not found" (no bcrypt compare) and "wrong
  password" (bcrypt compare) is a subtle user-enumeration side channel —
  standard fix is comparing against a dummy hash, noted for later.

- **Gmail-integration security prep (flagged for the upcoming phase, none
  implemented now):** (a) store Gmail OAuth tokens exactly like the
  existing `ApiKey` pattern — AES-encrypted at rest via `ENCRYPTION_KEY`,
  never plaintext in the DB (the planned `GmailAccount` model in
  ARCHITECTURE.md already assumes this; hold to it); (b) request the
  narrowest scopes that work — `gmail.readonly` for auto-tracking;
  `gmail.send` only if/when send-from-app is actually built, and prefer
  starting readonly-only; (c) the OAuth redirect/callback route must
  validate the `state` parameter (CSRF on the OAuth flow itself — NextAuth
  handles this for login providers, but a custom Gmail-connect flow would
  need its own); (d) never log token contents; add the callback route to
  the middleware matcher exclusions deliberately, not accidentally; (e)
  the email classifier will feed *email text* (fully attacker-controlled,
  anyone can email the user) into an LLM — the prompt-fencing module built
  this session should wrap ALL email content from day one, and
  status-downgrade confirmations (already decided) are also the right
  backstop against a malicious email steering the tracker; (f) login/signup
  rate limiting (see auth review above) becomes non-theoretical once a
  Gmail-connected app holds OAuth tokens worth stealing.

- **`feature/email-send` (v1) is a Gmail compose-window deep link only —
  deliberately separate from the full-OAuth "Gmail integration" scoped
  above.** No token, no scope, no API call: `buildGmailComposeUrl`
  (`src/lib/gmail-compose.ts`) builds `https://mail.google.com/mail/?view=cm&
  to=...&su=...&body=...` via `URLSearchParams` (which percent-encodes
  everything, including line breaks, correctly on its own — no manual
  `encodeURIComponent` needed) and the button just `window.open`s it in a new
  tab. The user reviews and clicks Send inside their own logged-in Gmail;
  nothing here ever touches their credentials or inbox. Default subject is
  `Application — {sender name} — {job title}`, sender name pulled from
  `job.Resume.ContactInfo` (added to the `getJobDetails` include) rather than
  a new profile field, since that's already the resume tied to the job.
- **`Job.emailTo` captured via the Send Email dialog itself, not added to the
  full Add/Edit Job form.** Scope call for a "lightweight v1" — the dialog
  already needs a recipient input, and `updateJobEmailTo` persists it there
  so later opens prefill; adding a redundant field to the large existing
  job form would be scope creep for no behavior gain.
- **"Mark as Applied" is a standalone toggle (`toggleJobApplied`), separate
  from `updateJobStatus`'s existing applied-on-status-change side effect.**
  The existing status dropdown already flips `Job.applied` when status
  becomes "applied"/"interview" — but that requires opening the status
  submenu. The new toggle button lets applied be set/unset directly (e.g.
  right after using Send Email) without also forcing a status change;
  toggling off clears `appliedDate` back to null rather than leaving a stale
  timestamp.
- **Click-through verification method for the Gmail link**: no real Google
  account is available to this session, so a Playwright run against a
  throwaway fixture user/job showed the actual behavior of an unauthenticated
  browser opening the built URL — Google's own `accounts.google.com` sign-in
  gateway, which preserves the full original destination byte-for-byte in its
  `continue=` param. Decoding that param and reading its `to`/`su`/`body`
  confirmed exact matches (including the umlaut/`&`/line-break body content)
  against what the button was given. This is the honest ceiling of automated
  proof without real Google credentials: it confirms Google's servers
  received the exact correct compose parameters, not that Gmail's own
  compose UI visually renders them (that step needs the user's real login).

- **`feature/email-template`: the Send Email button's default body is now a
  fixed, user-supplied static template (German section, then an "English
  version;" separator, then English) with `[Job Title]`/`[Company Name]`
  filled by plain string substitution — no Ollama call, instant.** Stored
  verbatim in `src/lib/coldEmailTemplate.ts`, including the deliberate
  German/English sign-off difference ("Dhruvil" vs "Dhruvil Akbari") — not a
  typo to fix. `generateColdEmail` (full AI) is kept as an opt-in "Generate
  custom draft instead" button inside the same dialog rather than removed;
  it always re-generates fresh rather than reusing a previously-saved
  `ColdEmail`, since the task scoped this as fast/minimal and a stale-vs-
  fresh cache policy wasn't asked for.

- **`feature/cover-letter-resume-tailoring`: both `generateCoverLetter` and
  `generateTailoredSummary` reuse the existing generation pipeline verbatim**
  (`generateVerifiedContent`, `checkRateLimit`, `resolveJobLanguage`,
  `truncateForProvider`) rather than building any new guardrail or
  AI-calling logic — task explicitly asked to move fast and not rebuild
  infrastructure that already exists and is tested. `generateCoverLetter` is
  structurally identical to `generateColdEmail` (copy-pasted shape, not
  extracted into a shared helper — three near-identical ~90-line functions
  in one file was judged acceptable for "move fast," an extraction can
  happen later if a fourth generation feature needs the same shape).
- **Tailored resume summary saved directly on `Job.tailoredSummary`, not as
  a new standalone document model** — unlike `ColdEmail`/`CoverLetter`, it's
  a short snippet with no independent identity (title, list view, etc.), so
  a plain nullable string field was the simpler, faster fit. It is
  deliberately never written back into the actual `Resume` record — the
  task explicitly required manual copy-paste only, and the UI textarea is
  editable (not read-only, unlike the cold-email/cover-letter dialogs) so
  the user can adjust wording before copying, but those in-browser edits
  are not persisted anywhere; only a fresh `generateTailoredSummary` call
  overwrites the saved value.
- **Tailored summary's German prompt uses `GERMAN_B1_LANGUAGE_RULES` +
  `GERMAN_WRITING_TELL_RULES` but not `DIN_5008_EMAIL_STRUCTURE`** — DIN 5008
  governs letter/email structure (Betreff line, salutation, closing), which
  doesn't apply to a resume-summary snippet with no such structure. The B1
  language cap still applies since it's a language-quality rule, not a
  structural one.
- **Verified via a real, temporary script (`scripts/verify-cover-letter-
  tailoring.ts`, deleted after use) against local Ollama + real `dev.db`**,
  reusing the same auth-bypass approach as the prior `feature/job-language`
  verification (`getCurrentUser()`'s `auth()` needs a real Next.js request
  context a plain script doesn't have — confirmed again here; every other
  step, including both live `generateVerifiedContent` calls and the Prisma
  writes, is the real production code path). Cover letter generation took
  **~541s (~9 min)**, produced a real 172-word multi-paragraph English
  letter referencing the fixture resume's Node.js/PostgreSQL/Docker
  experience and "Acme GmbH" by name, and correctly persisted
  (`Job.coverLetterId` → `CoverLetter.content`, both confirmed via a fresh
  DB read). Tailored summary generation took **~286s (~4.8 min)**, produced
  a real 3-sentence summary, and correctly persisted directly on
  `Job.tailoredSummary` (confirmed via a fresh DB read); the resume object
  passed in was never mutated (Part 2 receives resume *text*, never a
  resume ID or file handle it could write to). Both calls triggered the
  factual-accuracy guardrail's warning path on paraphrase-level claims
  (e.g. "from December 2021" vs. resume's "Dec 2021 - Present", "downtown
  office" vs. job description's non-identical phrasing) — this is the same
  known llama3.1 false-positive pattern already flagged for the cold-email
  guardrail (see the writing-guardrails entries above), not a new bug;
  content was still returned with the warning surfaced, per the
  warn-don't-block design. All fixture rows (job, cover letter, profile,
  job title, company) cleaned up afterward.

- **`feature/generate-all`: "Generate All" is a pure client-side sequencer,
  zero new business logic** — `GenerateAllButton.tsx` just calls
  `extractJobKeywords` → `scoreJob` → `generateTailoredSummary` →
  `generateCoverLetter` → `generateColdEmail` (skipped if `job.ColdEmail`
  already exists) in order, checking `.success` after each and stopping on
  the first failure. No rollback logic needed or added — each action
  already persists its own result independently, so a failure partway
  through simply leaves earlier steps' results saved, which is what "don't
  roll back" asked for by construction.
- Progress state is a plain `StepState[]` array (`pending`/`running`/
  `done`/`error`/`skipped`) driven entirely by the sequencer's own
  `updateStep` calls between awaits — no polling, no separate progress
  action. `router.refresh()` runs once at the end (success path only) so
  the other job-detail sections (ATS score, tailored summary, cover
  letter/cold email buttons) pick up the fresh data without a manual reload.
- **Verified two ways**: (1) `GenerateAllButton.spec.tsx` renders the real
  component with React Testing Library and drives a real click — this
  proves the actual sequencing, the skip-on-existing-ColdEmail branch, and
  the stop-on-failure/keep-earlier-results behavior as real component state
  transitions, with the five actions mocked. (2) A real, temporary script
  (`scripts/verify-generate-all.ts`, deleted after use) replicated the same
  five actions' internal steps in the same order against a real fresh
  fixture job + real Ollama + real `dev.db` (same auth-bypass reason as
  the prior two verification scripts this session — `getCurrentUser()`
  needs a real Next.js request context). Real timings: keyword extraction
  ~81s (11 keywords), scoring ~69ms (score 55, real ATS core, no Ollama),
  tailored summary ~311s, cover letter ~524s (192 words), cold email ~322s
  (112 words) — **~20.6 minutes total**. Final DB read confirmed all five
  outputs correctly saved together on one Job row (`Keywords`, `atsScore`,
  `tailoredSummary`, `coverLetterId`→`CoverLetter.content`,
  `coldEmailId`→`ColdEmail.content`) with no clobbering between steps.
  Fixture rows cleaned up afterward.

- **Resume upload bug fix**: `ResumeContainer.tsx`'s "Structure with AI"
  button gated on `aiReady`, which only flipped true if a `UserSettings.ai`
  row existed — silently unreachable for any user (including the real
  account) who never saved AI Settings once. This is why uploaded resumes
  stayed empty (`27`-char normalized text) even though PDF/DOCX extraction
  and AI-structuring already worked end to end. Fixed by defaulting
  `aiReady` to `true` off `defaultModel`, same as `AiResumeReviewSection`/
  `AiJobMatchSection`. Decision: don't add a "raw text" storage field yet
  for future verbatim-wording tailoring — re-extracting from the retained
  uploaded file on demand is simpler and the file is never deleted out from
  under a `Resume` row today.

- **Gemini as default provider (cover letter + tailored summary only)**: the
  full Gemini provider integration (registry, factory, verifier, models
  route, env-var resolution) already existed — the actual change was a new
  `resolveCoverLetterAi()` helper in `coverLetter.actions.ts` that defaults
  to Gemini unless the user has explicitly saved a provider in AI Settings,
  scoped to only `generateCoverLetter`/`generateTailoredSummary`. ATS keyword
  extraction and cold email generation were deliberately left on the
  Ollama-default path — not mentioned in the request, and changing them
  would've been unrequested scope creep. Decision: use `"gemini-flash-
  latest"` instead of the requested `"gemini-2.5-flash"` for
  `DEFAULT_GEMINI_MODEL` — verified live (2026-07-19) that `gemini-2.5-flash`
  404s ("no longer available to new users") and `gemini-2.0-flash` 429s
  (quota exceeded) on this account's API key, while `gemini-flash-latest`
  works. If the account's model access changes later, this is a one-line
  swap in `src/lib/ai/config.ts`. `GenerateAllButton.tsx`'s tailored-summary
  and cover-letter steps now run via `Promise.all` (independent outputs, no
  reason to serialize) instead of sequentially.

- **ATS scoring crash on German jobs**: fixed via `serverExternalPackages:
  ["dictionary-de"]` in `next.config.mjs` rather than rewriting
  `de-dictionary.ts` to avoid the `new URL(x, import.meta.url)` + `fs`
  pattern, because that pattern is the package's own upstream code (not
  ours) and excluding it from bundling is the standard, documented fix for
  this exact Turbopack/webpack quirk — lower-risk than patching or
  vendoring a third-party dictionary package. Also added a 15s timeout
  around the scoring call as defense in depth, independent of whether this
  specific root cause was the whole story. Decision: ship this fix on
  code-level reasoning (exact error signature, only fs+URL touchpoint in
  the call chain) without a live authenticated repro, since closing that
  gap would have required resetting a real account's password or forging a
  session — both treated as out of bounds. Flagged in MEMORY.md as a
  verification gap to revisit if the crash resurfaces.

- **Gemini default extended to ATS extraction + cold email**: extracted the
  provider-default resolution (previously a private `resolveCoverLetterAi`
  helper duplicated in intent across 3 call sites) into a shared
  `src/lib/ai/default-provider.ts`, rather than copy-pasting a 4th near-
  identical block into `extractJobKeywords` — this is the same logic four
  different actions need, not feature-specific. Decision: leave the
  fallback-model-when-no-explicit-model-saved test coverage in
  `default-provider.spec.ts` only, not re-duplicated in every consumer's
  spec file, since it's now genuinely shared logic with its own single
  source of truth. Known risk (see MEMORY.md #15): this account's Gemini
  key hit a 20-requests/day free-tier quota wall mid-E2E-test — Generate
  All's ~4 base calls plus guardrail fact-check calls can exhaust that in
  2-3 runs. Not fixed here; flagged for whoever revisits this next.

- **`feature/master-templates`: template slots are `slot: String` on a single
  `MasterTemplate` table, not four separate models or a `kind`+`language`
  compound key** — `"RESUME_EN"`/`"RESUME_DE"`/`"COVER_LETTER_EN"`/
  `"COVER_LETTER_DE"` as plain string values, same pattern `JobKeyword.source`
  already uses (`"extracted"` | `"manual"`) rather than a Prisma enum (SQLite
  has no native enum type; Prisma enums on SQLite still just become a checked
  string column, so a plain string with an app-level `TemplateSlot` TS enum
  is equally safe and simpler to extend if a third language is ever added).
- **Versioning via `isCurrent: Boolean` + monotonic `version: Int` per slot,
  not a separate "history" table** — re-importing a slot never deletes the
  previous row or its on-disk file; it just flips the old row to
  `isCurrent: false` and inserts a new one at `version + 1`, both inside one
  `$transaction` so a crash mid-upload can't leave two rows marked current.
  Simpler than a parent/child history-table split for what is, today, just
  "keep old versions around, always read the latest" — no version-diffing or
  restore-a-prior-version UI was requested.
- **No AI rewriting at import time — `extractedText` is exactly what
  `extractText()` (the existing PDF/DOCX extraction module built for resume
  upload) returns**, reused as-is rather than re-implemented. This was an
  explicit requirement ("preserve exact original wording/structure at this
  stage — no AI rewriting during import, that happens later at generation
  time"); the future tailoring step is a separate, not-yet-built pass that
  reads `extractedText` rather than the raw file.
- **Empty-state check (`getTemplateForJobLanguage`) returns `data: null` as a
  *successful* result, not an error** — "no template for this language yet"
  is an expected, normal state (most users won't fill all four slots
  immediately), not a failure. `TemplateAvailabilityNote.tsx` only renders
  once `job.language` is set (before that, there's nothing meaningful to
  check — showing "no template" for a language that hasn't even been
  detected yet would be a false signal, not a helpful one).
- **`TemplateAvailabilityNote` built once and used for both `RESUME` and
  `COVER_LETTER` kinds**, not a cover-letter-only component — the requirement
  language ("a job's language... no matching template uploaded yet") reads
  as a general rule the four-slot design implies applies to both kinds
  equally, and the component is a few lines of shared logic either way; this
  isn't scope creep, it's applying the same already-scoped rule consistently
  rather than arbitrarily only wiring up one of the two kinds it naturally
  covers.
- **Verified via a real, temporary script (`scripts/verify-master-templates.ts`,
  deleted after use) against real Prisma + a real previously-uploaded PDF
  resume file**, reusing the same `server-only`-stub auth-bypass pattern as
  every other verification script this session (`getCurrentUser()`/`auth()`
  needs a real Next.js request context a plain script doesn't have). Real
  upload → real extraction (5,552 chars) → real versioning (v1 kept,
  isCurrent flipped, v2 created) → real empty-state-then-found-state
  transition for `COVER_LETTER_DE`, all against real `dev.db`. Fixture rows
  and files cleaned up after (0 leftover rows confirmed by a final count
  query). `__tests__/templates.actions.spec.ts` (12 tests) covers the same
  ground plus validation-failure edges with mocked Prisma/fs for fast
  regression coverage.

- **gemini-flash-lite-latest + automatic Ollama fallback**: switched
  `DEFAULT_GEMINI_MODEL` to a Flash-Lite variant (materially higher free-
  tier daily quota, verified live) rather than paying for a Gemini tier or
  building per-user quota tracking — simplest fix that directly addresses
  the observed failure mode. Also added `callWithGeminiFallback()` as
  defense in depth: even a higher quota can be exhausted under heavier
  real usage, so every Gemini call site now retries once against Ollama on
  a 429/quota error rather than failing the step outright, with a visible
  "using offline mode" note so the fallback is never silent. Decision: the
  `run` callback receives the provider being attempted (not just the
  resolved model) so callers re-truncate prompt text with the correct
  per-provider budget on each attempt, including the fallback — Ollama's
  smaller context budget is respected even mid-fallback, not just on a
  native Ollama call.
