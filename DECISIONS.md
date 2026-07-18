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
