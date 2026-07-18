# MEMORY.md — Session Handoff

## Last updated
Setup phase, before any feature code written.

## Where we actually are right now
1. ✅ Forked github.com/Gsync/jobsync → github.com/dpatel19999/jobsync
2. ✅ Cloned locally to Windows machine, path under
   `Desktop\Dhruvil Docs\Job Tracker\jobsync`
3. ✅ Opened in VS Code
4. ✅ `npm install` was run — hit PowerShell execution-policy error, fixed with
   `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
5. ⚠️ **UNCONFIRMED**: `npm install` was last seen actively progressing (verbose
   log showed real package resolution, not stuck). **Never got final confirmation
   it finished.** This is the first thing to verify in the next session.
6. ❌ NOT DONE YET: `.env` setup (Step 6), `npx prisma generate` / `migrate dev`
   (Step 8), first `npm run dev` (Step 9), confirming baseline app runs.
7. ❌ NO FEATURE CODE WRITTEN YET. All work so far has been planning/requirements.

## Immediate next steps (in order)
1. Confirm `npm install` finished cleanly (`added N packages in Xm` message).
2. `copy .env.example .env`, fill in `AUTH_SECRET` / `ENCRYPTION_KEY` (generate via
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`),
   uncomment `DATABASE_URL`.
3. `npx prisma generate` then `npx prisma migrate dev`.
4. `npm run dev`, open http://localhost:3737, create account, confirm baseline
   works (add a job manually, upload CV, try AI resume review).
5. Commit baseline: `git add -A && git commit -m "chore: confirmed baseline runs"`.
6. Start Feature 1 build: **cold email generation** (smallest change, extends
   `coverLetter.actions.ts`) — per build order in ARCHITECTURE.md.

## Full feature list agreed (see ARCHITECTURE.md for technical detail)
Gmail auto-tracking (with confirm-on-downgrade), EN+DE ATS scoring, CV+cover
letter+cold email tailoring (docx+pdf output), JD-adaptive CV structure,
company-mismatch guardrail, bilingual EN/German-B1 output, DIN 5008 German
formatting, no-invented-facts guardrail, natural-writing pass, AI-writing-tell
ban list, recruiter-persona weighted scoring, interview prep Q&A module,
LinkedIn networking assistant (manual-send only).

## Source documents already analyzed (don't re-ask for these)
- User's real CV (EN + DE Lebenslauf) — structure confirmed, section order noted.
- Cover_Letter_3.docx (EN, Rheinmetall) — reviewed.
- Anschreiben.docx (DE, MBDA) — reviewed, found the wind-turbine leftover bug.
- german_european_recruiter_persona.txt — full rubric extracted into
  ARCHITECTURE.md / DECISIONS.md.

## Open items not yet decided
- None outstanding — requirements phase is considered complete as of this file's
  creation. Next work is implementation, starting with confirming the local
  baseline runs.
