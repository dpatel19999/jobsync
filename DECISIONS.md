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
