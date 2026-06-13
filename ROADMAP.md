# SettleWell — Product Roadmap & Running Backlog

This is the single source of truth for what SettleWell should become and what's
left to do. Brian and Claude both edit this. Nothing gets worked on that isn't
captured here; nothing here gets silently dropped.

---

## Vision

SettleWell is **not a checklist app**. It's the expert estate advisor a
first-time executor has never had. Someone who has never closed an estate opens
it and immediately sees things they'd never have known to worry about — granular,
anticipatory, educational.

> Example: not "stop recurring payments," but — "The house is now vacant. Is
> someone mowing the lawn? (Vacant homes draw code violations and signal
> burglars.) Here are the recurring bills tied to the property — utilities, HOA,
> security, pool, pest control — decide keep / transfer / cancel for each."

### Core principles
- **One dynamic task list.** No duplicate checklist + tasks. A single list.
- **Forward-thinking & exhaustive.** Surface what the user doesn't know to ask.
- **Dynamic.** Tailored to *this* estate (property tasks only if there's
  property) and it *grows itself* as new information arrives.
- **AI safety net, running live in the background.** While the user works in the
  app, AI reviews everything entered — documents, notes, intake answers,
  financials — and generates tasks so nothing slips through. The next user
  *will* miss something; the AI should catch it (e.g. a note mentioning an
  attorney meeting should spawn a task even if the user didn't make one).
- **State-scoped.** Intake captures where the deceased lived; probate guidance
  and generated tasks are scoped to **that one state's** rules.
- **Not a substitute for an attorney.** The app assists; it is not legal advice.
  It must say so clearly at appropriate, relevant moments (not as constant noise).
- **Human-in-the-loop.** AI suggests and flags; the executor confirms.

### What "multi-estate" means (scope)
Multi-estate = **one family unit with several related decedents** whose probates
are intertwined (e.g. mom *and* dad passed; here Dan *and* his wife Traci). It is
NOT a tool for managing unrelated estates (your mom + a friend down the street).
An unrelated estate = a **separate account/login** (to be designed at the end).
Because related estates share a household, cross-estate work (checking the mail,
the residence, shared bills) should not be entered redundantly per estate.

---

## Backlog

Status key: ☐ todo · ◐ in progress · ☑ done

### P0 — Monday-critical (must be solid to "hit the door running")
- ☐ **Consolidate to ONE list.** Retire the Estate Checklist; Tasks is the
  single system. Remove the duplication that currently causes confusion.
- ☐ **Rich, dynamic, educational task template.** Each task carries a short
  "why this matters / what to check" detail. Seed conditionally off intake
  answers + extracted data so the list is exhaustive *for this estate*.
  (Requires a `detail` column on `estate_tasks`.)
  - Content notes: Digital Assets must distinguish **memorialize/close** an
    account from **set up a legacy contact / create a memorial page** (different
    actions). Real Property must include granular upkeep prompts (lawn mowing,
    each recurring bill: utilities/HOA/security/pool/pest — keep/transfer/cancel).
- ☐ **Restore Dan's real estate data.** Real contacts (Paul Mullin + phone,
  Cotts Law, Guardian Funeral, PNC, Truist, Goodleap) and the specific
  outstanding tasks, so Monday is real work, not a demo. (Backup captured.)
- ☐ **Documents ↔ tasks.** Uploaded documents auto-attach to the relevant task,
  and recognized completed items (death certificates, obituary) auto-note or
  check off the matching task instead of leaving it open.
- ☐ **Verify & split data before migrating.** Dan's original record mixes items
  that actually belong to Traci's estate (e.g. Guardian Funeral Home = Traci;
  PNC mortgage = Dan). Create Traci's estate, sort each backup item to the
  correct estate WITH Brian's verification, then migrate. Don't restore blindly.

### P1 — The "invaluable to the next person" differentiators
- ☐ **AI Forensic Financial Audit.** Upload financial statements → Claude
  surfaces recurring payees, unknown transfers, subscriptions, and signs of
  unaccounted accounts/assets → each actionable finding becomes a task.
  (This is what Brian did by hand on Dan's estate — the "investigate Cash App
  payment," "WA child support" tasks were forensic-audit findings.)
- ☐ **Note → task generation.** When the user writes a note (e.g. "meeting with
  probate attorney June 17"), AI proposes a task/subtask so an action mentioned
  in passing doesn't get lost.
- ☐ **Running asset / inventory list tied to tasks.** A live registry of estate
  assets (real property, vehicles, accounts, valuables, business) that links to
  the relevant tasks — so assets and the work on them stay connected.
- ☐ **"Not legal advice" disclaimers** surfaced at appropriate, relevant points
  (e.g. when generating legal/probate tasks), without being constant noise.
- ☐ **Family-level mail intake with AI routing.** One mail/file upload entry
  point under the Multi-Estate section (not per-estate). Each uploaded item is
  read by AI and filed under the correct estate automatically. Removes the
  redundancy of separate mail uploads per estate.
- ☐ **De-duplicate cross-estate tasks.** Shared-household tasks (check the mail,
  the residence, shared utilities) shouldn't repeat across related estates.
- ☐ **Full demographics for everyone with access.** Executor, heir, observer,
  etc. — capture name, phone, email, address, relationship — and make it easy to
  view/edit in Settings (currently only email + role are shown). Email should be
  optional (a person may be added before their email is known).
- ☐ **Define & confirm role-based views.** Review and confirm exactly what each
  role sees and can do — heir vs observer vs executor — so each person gets the
  right view (not the full admin surface).

### P2 — Bigger / ongoing (likely past Monday)
- ☐ **Always-on background AI agent.** Watches *all* inputs continuously,
  cross-references state-specific probate rules, and generates/updates tasks.
  NOTE: state-law accuracy is a minefield — frame as general guidance with
  human verification and clear "not legal advice" disclaimers.

### Polish / minor
- ☐ Executor Name on Dan's estate shows `brian.owens_nola` (email prefix) —
  set to "Brian Owens".
- ☐ Restore preferred formatting / color scheme from before recent changes
  (Brian liked the earlier look better — needs specifics on which screens).

---

## Done (this experiment)
- ☑ Estate Details editable (incl. executor phone); RLS verified
- ☑ "Create New Estate" entry point when no estates exist
- ☑ AI document extraction at intake (background function, per-file, image+PDF)
- ☑ Date-of-death free text entry on Quick Setup
- ☑ Extraction robustness: filename sanitizing, 413 fix (per-file), 504 fix
  (background function), 15-min polling, env vars + secrets-scan config
- ☑ Full Re-take walks all questions with answers preserved (incl. extracted)
- ☑ Intake seeds from estate record fields; reloads after extraction
- ☑ Intake "Unknown" option; extraction no longer over-guesses "yes"
  (no POA-boilerplate inference; <0.8 confidence dropped)
- ☑ Uploaded files appear in Documents (+ back-filled existing)
- ☑ Contacts have an address field (add / edit / display)
- ☑ Master checklist + standard tasks auto-seed on estate creation
- ☑ Cleaned up duplicate test estates (down to one working Daniel estate)

---

## Open questions / decisions pending
- Confirm: retire Estate Checklist entirely, Tasks is the one list? (recommended: yes)
- Confirm: restore Dan's real contacts + specific tasks onto the current estate?
- How "automatic" should note→task be on Monday — auto-create, or suggest-and-confirm?
