# SettleWell — Product Roadmap & Running Backlog

This is the single source of truth for what SettleWell should become and what's
left to do. Brian and Claude both edit this. Nothing gets worked on that isn't
captured here; nothing here gets silently dropped.

---

## Parking Lot — fix before "done," not urgent

Quick-capture list of things to handle long-term or before the app is truly
finished. Not blocking. Brian adds to this by saying **"Park: <thing>"** (or
"add to the parking lot" / "for later"). Claude appends it here verbatim, dated.
Items graduate into the structured backlog below when it's time to do them.

- **(2026-06-14)** AI-generated death-notification forms/letters — option to
  generate the notices that inform agencies, government offices, banks, etc. of
  the death, for any that can be handled by mail/email (e.g. SSA, IRS, credit
  bureaus, pension/benefit providers). Pre-fill from estate data; executor
  reviews/sends.
- **(2026-06-14)** Help-desk / support view for the finished app — a way for end
  users to get help (FAQ, guided help, contact/support) once the app ships.
- **(2026-06-14)** Path-scope storage policies — the estate-documents bucket
  currently lets ANY authenticated user read/upload/delete ANY file (the
  policies aren't scoped by estate/path). Tighten to per-estate path prefixes so
  a member of one estate can't touch another's files. (Loose but consistent
  posture for now; real fix when multi-account/unrelated estates arrive.)
- **(2026-06-14)** Protect the code / keep it proprietary (long-term). How do we
  guard against other AIs or third parties poaching or copying the codebase?
  Consider: private repo + tight access controls, a proprietary LICENSE, keeping
  business logic server-side (Netlify functions) rather than in the shipped
  client bundle, code obfuscation/minification, and legal terms. (Note: any code
  shipped to the browser is inherently readable; true protection lives on the
  server + legal, not in the front-end.)
- **(2026-06-14)** Re-enable email confirmation once real email is set up.
  Turned OFF "Confirm email" in Supabase auth because the built-in default email
  sender is rate-limited and was blocking sign-ups ("email rate limit exceeded").
  Configure a proper SMTP provider (e.g. Resend/SendGrid) in Supabase Auth, then
  turn confirmation back on for security.
- **(2026-06-14)** Harden account creation — creating logins by hand via SQL is
  fragile (NULL auth token columns caused "Database error querying schema" for
  Rebecca & Kaynin; fixed by setting them to ''). Use Supabase's admin API or
  the invite/self-register flow instead of manual inserts.
- **(2026-06-14)** Tune / upgrade the AI advisor — currently Sonnet; consider
  Opus for deeper review, and an automatic (vs on-demand) trigger once on-demand
  proves out.
- **(2026-06-14)** Always-on background AI agent (bigger / P2) — watches all
  inputs continuously, cross-references state probate rules, and generates/
  updates tasks. State-law accuracy is a minefield: frame as general guidance
  with human verification and clear "not legal advice" disclaimers.

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
- ☑ **Consolidate to ONE list.** Estate Checklist retired; Tasks is the single
  system.
- ☑ **Rich, educational task template.** 63 tasks across 11 phases, each with a
  "why this matters / what to check" detail (incl. distinct social-media
  memorialize vs legacy-contact, granular property upkeep/recurring bills, and a
  forensic-finance review task). Seeded on new estates + back-filled into Dan &
  Traci. NOTE: *dynamic* tailoring (show/hide by the estate's actual assets) and
  AI-driven additions are folded into the AI work below — current set is
  exhaustive-by-default.
- ☑ **Restore Dan's real estate data.** Real contacts (Paul Mullin + phone,
  Cotts Law, Guardian Funeral, PNC, Truist, Goodleap) and the specific
  outstanding tasks are in place — Monday is real work, not a demo. (Backup
  captured.) Confirmed done with Brian 2026-06-13.
- ☑ **Documents ↔ tasks.** AI Assistant "Match documents" mode matches uploaded
  documents to the tasks they satisfy (death cert → order death certs, obituary,
  recorded deed → transfer) and proposes linking + checking the task off;
  accepting links the doc, updates status, and logs a note. (Suggestion-based,
  executor-confirmed.)
- ☑ **Verify & split data, then migrate.** Split confirmed by Brian and
  restored: Dan got his contacts + 68 specific tasks (10 forensic flagged
  private, 9 assigned to Kaynin); Traci got Guardian Funeral + her 2 items;
  Mullin on both. Full backup saved locally (BACKUP_deleted_estate_FULL.json,
  gitignored). Traci's finances intentionally left for the forensic test.
- ☑ **Tasks: at-a-glance assignee + group/sort by person.** Assignee chip on
  every task; "Group by: Phase | Person" toggle on the one Tasks page.

### Done — Security hardening
- ☑ **Private items enforced at the database (RLS) level.** Private tasks are
  readable by the Executor only (heir/observer/collaborator see non-private
  only); private financials were already executor-only; private notes gated via
  RLS. Also made Collaborator functional: can read + update non-private tasks
  and read/add their notes, never private ones. (migrations 016, 017)

### Done — Notes
- ☑ **Executor-only vs Shared daily notes.** Visibility toggle (Executor sees
  both lanes per day); non-executors only see/write Shared. Enforced via RLS
  (`get_estate_role`), not just UI.

### Done — Heir fiduciary transparency
- ☑ **Heir Transparency Report meets fiduciary duty.** Heirs/observers get estate
  stage (executor-set), accounting totals (accounts, received, spent, assets,
  liabilities, monthly obligations), asset summary (name + status), court
  documents, and activity log — via a secure RPC that never exposes account
  numbers/notes/private rows. Heir = max transparency (dashboard + non-private
  board + docs/contacts); Observer = dashboard only (Level 4). Based on
  Estate_App_Heir_Access_Recommendations.pdf.
- ☑ **Immutable activity/audit log** (the doc's "most valuable feature").
  Database triggers on tasks, financials, documents, notes, users, and estate
  stage write to `estate_activity_log` — capturing actor (from auth.uid()),
  action, what changed, and time. The table has a SELECT policy only (no
  insert/update/delete policies), so the SECURITY DEFINER triggers are the only
  writers and history can't be edited or deleted from the app — append-only by
  construction. Privacy-safe: entries inherit their subject's privacy, financial
  entries are private unless a non-private asset, and no dollar amounts or note
  content are ever stored in the log. New executor **Activity Log** page (with
  entity filters); the heir Transparency Report now renders the real log
  (non-private rows only) via a shared ActivityFeed. (migration 023)

### P1 — The "invaluable to the next person" differentiators
- ☑ **AI Assistant (one engine, two modes)** — new executor-only AI Assistant page:
  - **"What am I missing?" review** — scans intake/tasks/notes/documents/assets,
    proposes missing tasks + gaps (state-scoped, not legal advice).
  - **Forensic financial audit** — upload statements → findings (recurring payees,
    unknown transfers, hidden accounts) as **private** suggestions.
  - Both produce **reviewable suggestions** → executor Accepts (→ task in the
    right phase) or Dismisses. Human-in-the-loop.
- ☑ **Note → task generation.** Saving a daily note now scans it (synchronous
  `note-to-tasks` function) and offers any follow-up actions it implies as
  inline "Add task" suggestions (suggest-and-confirm). Added tasks inherit the
  note's privacy and are tagged "AI · from note". Works for executor and
  collaborator (collaborator notes/tasks are non-private). The "What am I
  missing?" review still catches note-implied gaps after the fact.
- → **Tune / upgrade the advisor** — moved to the Parking Lot (single list).
- ☑ **Running asset / inventory list tied to tasks.** Assets live in the
  Finances "Assets" section. Adding one auto-creates a linked "decide keep/
  sell/transfer" disposition task in the matching phase; each asset shows its
  linked tasks. Dan's 10 real assets (house, 5 vehicles, boat, UTVs, business,
  jewelry, firearms) seeded and linked to their existing tasks.
- ☑ **Manual entry forms for every Finances category.** Accounts, Monthly
  Obligations, Liabilities, Assets, and Insurance all have a "+ Add" button and
  form (previously only Assets did). Category-aware labels/status options,
  lender field for debts, private toggle, and a full inline edit form.
- ☑ **AI-populated finances (#2).** The forensic audit now splits its results
  into concrete financial **records** (accounts, loans, recurring obligations,
  insurance → `kind:'financial'` suggestions) vs investigative **findings**
  (→ tasks). Document matching also extracts a Finances entry from bank
  statements, loan papers, and insurance policies. Accepting a financial
  suggestion inserts straight into the right Finances category (forensic-derived
  ones are private). New "Financial entries → Finances" group in the AI
  Assistant. (migration 022)
- ☑ **"Not legal advice" disclaimers** surfaced at the relevant points (a shared
  `LegalDisclaimer` component on the AI Assistant page and the note→task
  follow-up panel — i.e. wherever the app offers AI/procedural guidance), not as
  constant noise.
- ☑ **Family-level mail intake with AI routing.** ONE inbox under the
  Multi-Estate section (per-estate Mail Intake retired). Upload mail → AI reads
  each item (vision) and suggests which estate it belongs to with a confidence →
  executor confirms/overrides the estate + name → "Approve & file" creates the
  document on that estate and links it to that estate's mail-review task. Backed
  by a `family_mail` inbox table (RLS via `is_family_admin()`) + a synchronous
  `mail-router` function. Files stay in a shared bucket path (reads are
  bucket-wide) so no storage move is needed. (migration 024)
- ☑ **De-duplicate cross-estate tasks.** Decided: work each estate separately,
  so no auto-dedup needed; Brian is handling overlaps manually. (2026-06-14)
- → **Full demographics for everyone with access** — moved to the Parking Lot.
- ◐ **Define & confirm role-based views.** Roles consolidated: **Executor**
  (full) → **Heir** → **Collaborator** (works all non-private tasks) →
  **Observer** (read-only). Private/forensic items hidden from non-Executor
  roles in Tasks + Finances. ☑ Nav + pages now gated per role (Credentials,
  Settings, Finances, AI Assistant, Intake, Send-to-attorney are Executor-only;
  enforced in the sidebar AND on the page render). ☑ Distinct **Observer**
  read-only dashboard (status, progress, court documents, activity log — no
  beneficiary-level financial accounting); heirs keep the full Transparency
  Report. DashboardRouter routes by role.

### P2 — Bigger / ongoing (likely past Monday)
- → **Always-on background AI agent** — moved to the Parking Lot.

### Polish / minor
- ☑ Executor Name fixed to "Brian Owens" on both estates (Traci's still showed
  the `brian.owens_nola` email prefix).
- ☑ Rename a document's display name inline in Documents (storage path
  untouched, so View links and AI doc→task links still work).
- ☑ Formatting / color scheme — Brian confirmed it looks good as-is. (2026-06-14)

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
