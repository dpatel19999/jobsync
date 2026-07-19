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
