# MEMORY.md — Session Handoff

## Last updated
Cold email generation feature complete and verified, on `feature/cold-email`.
Not merged to main — left for user review.

## Where we actually are right now
1. ✅ Baseline confirmed running: `npm install`, `.env`, migrations, `npm run dev`
   on port 3737 all work natively (no Docker).
2. ✅ **Cold email generation shipped** on branch `feature/cold-email`:
   - `ColdEmail` Prisma model added (mirrors `CoverLetter`), migration
     `20260718140521_add_cold_email` applied.
   - `Job.coldEmailId` relation added, same shape as `Job.coverLetterId`.
   - `generateColdEmail(profileId, jobId)` added to `src/actions/coverLetter.actions.ts`.
     Loads resume via job's resume → user's default resume → most recent resume
     on the profile (first one found). Calls `getModel()` + `generateText()`
     (the `automation.actions.ts` non-streaming pattern — `coverLetter.actions.ts`
     itself turned out to have zero AI generation, contrary to ARCHITECTURE.md's
     original assumption; see DECISIONS.md).
   - New prompt module `src/lib/ai/prompts/cold-email/` (system + user prompts):
     4-6 sentences, facts-only from the loaded resume, must name the company and
     one concrete JD detail, bans the CLAUDE.md AI-writing-tell list.
   - UI: `GenerateColdEmailButton` component, wired into `JobDetails.tsx` next to
     the existing "Match with AI" button. Simple dialog shows the generated text
     after save (no new page).
   - Added `getCurrentProfileId()` to `profile.actions.ts` (small helper so the
     client button can resolve the profileId without threading a new prop through
     the job detail page).
3. ✅ **Verified end-to-end for real**, not just compiled:
   - Fixed `.env`'s `OLLAMA_BASE_URL` (was `host.docker.internal`, unreachable
     outside Docker; now `127.0.0.1:11434`).
   - Tried a user-supplied Gemini key first — authenticated fine but every model
     (`gemini-2.0-flash-lite`, `gemini-1.5-flash`, `gemini-2.0-flash`) returned an
     immediate zero-quota free-tier error. Not pursued further per user's call.
   - Switched to local Ollama (`llama3.1`, confirmed running via `ollama list`).
     Ran a full signup → resume (contact info + summary + one work experience,
     synthetic test data) → job (Vector Robotics GmbH, Berlin, detailed JD) →
     click "Generate Cold Email" flow via a scripted Playwright session.
   - Real generated output referenced only resume facts (Northline Payments,
     "reduced API p95 latency by 40%"), named the company, referenced concrete
     JD details (robotic fleet coordination platform, Node.js/PostgreSQL,
     warehouse-automation team, real-time order-routing), stayed to ~4 sentences,
     no AI-writing tells. Confirmed saved in the `ColdEmail` table via direct
     Prisma query, correctly linked via `Job.coldEmailId`.
   - Leftover in local dev.db: one test user
     (`coldemail.test.1784385238710@example.com` / password `TestPassword123!`),
     with a test resume, job, and cold email under company "Vector Robotics
     GmbH" / "Northline Payments". Harmless (test-labeled), left in place rather
     than risk an ad-hoc multi-table delete — user can remove via the UI if
     wanted.
4. ⚠️ `.env` now has a real Gemini API key from the user (`GEMINI_API_KEY`) that
   hit zero quota — may be worth rotating/removing if unused going forward.
   `.env` is git-ignored (`*.env*` in `.gitignore`), so nothing leaked to the repo.
5. Pre-existing, unrelated to this feature: `npx tsc --noEmit` reports
   `date-fns`/`lucide-react` type errors across most of the codebase (stale
   `node_modules` types vs. installed versions). Not introduced by this session
   — confirmed zero new type errors from the cold-email changes specifically.

## Immediate next steps (in order)
1. User reviews `feature/cold-email` and merges to `main` manually (not done
   automatically, per working agreement).
2. Optionally clean up the leftover test account/data in dev.db (see above).
3. Start next feature: **ATS keyword scoring (EN)** — per ARCHITECTURE.md's
   planned module: `src/lib/ats/scorer.ts`, `src/actions/atsScore.actions.ts`,
   add `atsScoreBefore`/`atsScoreAfter` to the `Job` model. German scoring
   (compound-noun decomposition) is a separate follow-up module, not part of
   the first pass.

## Full feature list agreed (see ARCHITECTURE.md for technical detail)
Gmail auto-tracking (with confirm-on-downgrade), EN+DE ATS scoring, CV+cover
letter+cold email tailoring (docx+pdf output), JD-adaptive CV structure,
company-mismatch guardrail, bilingual EN/German-B1 output, DIN 5008 German
formatting, no-invented-facts guardrail, natural-writing pass, AI-writing-tell
ban list, recruiter-persona weighted scoring, interview prep Q&A module,
LinkedIn networking assistant (manual-send only).

## Corrections to ARCHITECTURE.md worth knowing
- `coverLetter.actions.ts` has **no AI generation** — it's pure manual CRUD
  (title/content typed into a Tiptap editor, linked to a Job via a Combobox in
  `AddJob.tsx`). The real AI-calling convention in this codebase lives in
  `automation.actions.ts` (`analyzeDiscoveredJob`, non-streaming) and in
  `src/app/api/ai/resume/match/route.ts` (streaming, client-picked model, used
  by `AiJobMatchSection`). Any future AI feature should pick whichever of those
  two shapes fits (streaming+picker for long-running user-facing analysis,
  non-streaming for a quick save-and-done action like cold email).

## Open items not yet decided
- None outstanding for cold email. ATS keyword scoring's exact keyword-matching
  approach (simple TF vs. something smarter) not yet decided — first thing to
  raise with the user when that feature starts.
