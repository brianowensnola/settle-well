# SettleWell — Product Roadmap & Running Backlog

This is the single source of truth for what SettleWell should become and what's
left to do. Brian and Claude both edit this. Nothing gets worked on that isn't
captured here; nothing here gets silently dropped.

---

## Production Email Architecture (✅ LIVE — 2026-06-20)

**DONE: full two-way branded estate email is live on `settlewellestate.com`.**
- **Outbound:** AI-drafted estate emails send via **Brevo** from `estates@settlewellestate.com` (domain authenticated in Brevo via GoDaddy auto-config). Reply-to = the per-estate inbox.
- **Inbound:** **Amazon SES** (us-east-1, sandbox is fine — receiving only) receives at `<token>@in.settlewellestate.com` → SES receipt rule → **SNS topic `settlewell-inbound`** → `inbound-email` webhook (verified by `SES_SNS_TOPIC_ARN`) → matched to a contact or the Unmatched tray. MX for `in.` → `inbound-smtp.us-east-1.amazonaws.com`. DKIM verified via 3 CNAMEs.
- **Tested end-to-end:** real inbound emails captured to the timeline; outbound sends + logs; delete works.
- **Netlify env:** `ESTATE_FROM_EMAIL` (estates@settlewellestate.com, defaulted in code), `INBOUND_EMAIL_DOMAIN=in.settlewellestate.com`, `SES_SNS_TOPIC_ARN=arn:aws:sns:us-east-1:060255765432:settlewell-inbound`, plus existing `BREVO_*`.
- AWS account: BEPO Services LLC (060255765432).

**Remaining / future:** SES is receive-only on the sandbox (no production-access needed since we don't send via SES); move sending to SES later for scale/margin if desired; inbound **attachments** currently aren't saved to Documents (SNS inline content only — add S3 path for large mail/attachments when needed); native iOS push + share-sheet capture later.

---

## Production Email Architecture — original plan (superseded by LIVE above)

The communications hub becomes a real, branded send/receive system. Approved
direction; Brian will fund a ~$12/yr domain (no other recurring cost).

- **Branded domain:** a SettleWell domain (TBD). Send from it; receive at a
  subdomain (e.g. `in.<domain>`). Authenticate SPF/DKIM/DMARC for deliverability.
- **Per-estate addresses:** already built — each estate has `inbound_token`;
  address = `<token>@in.<domain>`. Auto-provisioned, scales, no per-estate setup.
- **Sending:** Brevo now (authenticate the new domain in Brevo = quick win,
  branded outbound); Amazon SES later for scale/margin. Both drop into the
  existing send code.
- **Receiving:** **Amazon SES inbound** (no monthly fee, ~$0.10/1k; NOT
  Cloudflare — Brian ruled it out; NOT Mailgun — $35/mo trap). SES receipt rule
  → S3 + SNS → our `inbound-email` webhook (swap parser for SES; token routing,
  timeline, unmatched tray, heir flag all stay — no rework). Postmark (~$15/mo)
  is the "less AWS hassle" fallback.
- **Already built & waiting:** Communications portal, AI-drafted outbound
  (`draft-email` + `send-estate-email`), `inbound-email` webhook + token system
  (migration 067), executor-only flag, unmatched tray.
- **Sequence:** (1) register domain [Brian]; (2) authenticate it in Brevo →
  branded outbound [quick]; (3) AWS account + SES domain verify + request prod
  access (~1 day) [Brian + Claude]; (4) MX → SES, build SES inbound parse, flip
  `INBOUND_EMAIL_DOMAIN`, test loop.
- **Native iOS later:** push on new mail/text + share-sheet "Send to SettleWell".

---

## Parking Lot — fix before "done," not urgent

Quick-capture list of things to handle long-term or before the app is truly
finished. Not blocking. Brian adds to this by saying **"Park: <thing>"** (or
"add to the parking lot" / "for later"). Claude appends it here verbatim, dated.
Items graduate into the structured backlog below when it's time to do them.

- **(2026-06-25) Large inbound attachments (SES → S3) — fix at the end.** Inbound emails over ~150 KB (i.e., with a sizeable attachment) are dropped by SES's SNS-notification path before reaching the app, so they don't get captured. Small attachments work fine and are saved to the estate's Documents. **Workaround for now:** ask senders to keep attachments small or share a link; save big ones to Documents manually. **The code is already written** (`netlify/functions/inbound-email.js` → `fetchFromS3()` + `SES_S3_*` env support) — only AWS config + env vars remain: (1) create an S3 bucket (e.g. `settlewell-inbound-email`, us-east-1); (2) IAM user with `s3:GetObject` on it → access key/secret; (3) change the SES receipt rule for `in.settlewellestate.com` from SNS-only to **S3 action (store) + SNS notify**; (4) set Netlify env `SES_S3_REGION=us-east-1`, `SES_S3_BUCKET`, `SES_S3_KEY`, `SES_S3_SECRET`; (5) test with a large-attachment email. Brian will do the AWS steps; Claude sets the env vars.
- **(2026-06-22) Support / help-desk admin role (for the commercial product).** A restricted **platform-admin / help-desk** login for Brian's team to assist paying clients WITHOUT exposing the client's personal secure data. Industry name: a **support console with scoped, audited impersonation + sensitive-data redaction** (RBAC). Requirements: (1) a staff tier separate from customers (platform-admin vs. tenant-admin); (2) ability to **"log in as" / impersonate** a client to make changes / troubleshoot; (3) **least-privilege + field-level redaction** so support can help but cannot read truly sensitive fields (SSNs, full account numbers, stored credentials/passwords); (4) **break-glass**: time-boxed access, ideally with client consent; (5) **audit log** of everything a support user views/does. Ties to multi-tenant model + billing. Build for the resale product; not needed for current single-family use.
- **(2026-06-21) AI billing model — DECIDED: subscription-covered.** One server-side Anthropic key (BEPO); AI is cost-of-goods priced into the subscription, not billed per user or BYOK. Before go-live: size the subscription to cover AI cost. Build-later guardrail: per-estate usage metering + caps on the cost drivers (document/vision extraction, Opus advisor), higher tier/credits for heavy users. Levers already in place: daily sweep, dedup, model tiering. Detail in memory `project_appstore_security_readiness`.
- **(2026-06-21) Estate archive + account deletion (decided design).** Archive is the preferred wind-down (estate matters reopen years later): freeze an estate **read-only** (no edits/AI/comms), all data preserved, reactivate anytime. **Phase 1 shipped:** schema (migration 077), Settings archive/reactivate, read-only banner, AI-sweep skip. **Phase 2 SHIPPED (2026-06-21):** DB-layer write-lockdown (migration 078 — `block_writes_when_archived` trigger on 21 tables; archived estates reject authenticated/anon writes, server fns pass through) + **account-deletion** flow (`delete-account.js` + Settings danger zone: preview impact, typed DELETE confirm, cascade-delete solely-owned estates + storage + auth user, keep co-admin estates). **Phase 3:** gate reactivation behind a **paid tier** (needs billing). Detail in memory `project_appstore_security_readiness`.
- **(2026-06-21) App Store & commercial readiness — security/privacy audit done; gates remain.** Security is solid: RLS enabled w/ policies on all 27 tables; service-role server-side only; secret scan clean; Supabase advisor shows only WARN (no ERROR). Fixed now: function search_path hardening (migration 076). **Before publishing/charging:** (1) in-app **account + data deletion** (Apple Guideline 5.1.1(v) — hard gate; handle estate-ownership cascade); (2) **privacy policy** page listing data + subprocessors — Supabase, Netlify, Brevo, **Anthropic (Claude API — estate text/docs sent for AI advisor/extraction/drafting; not used for training under commercial terms)**, Amazon SES; (3) App Privacy nutrition labels + camera/photo permission strings at Capacitor wrap; (4) re-enable email confirmation; (5) leaked-password protection + backups (Supabase Pro); (6) review SECURITY DEFINER RPC EXECUTE grants (revoke `anon` only, keep `authenticated` — they run inside RLS); (7) **decide sensitive-data storage** (Credentials vault / account #s — keep-and-document vs. minimize). Sign in with Apple NOT required (email/password only). Full detail in memory `project_appstore_security_readiness`.
- **(2026-06-18) Leaked-password protection — deferred, needs Supabase Pro plan.** Supabase Auth → Attack Protection → "Prevent use of leaked passwords" (HaveIBeenPwned check) is a Pro-plan-and-up feature; the project is on Free, so it can't be enabled now. Not a hole (passwords are still hashed/protected) — just a hardening nice-to-have. Flip it on if/when upgrading to Pro (one toggle, via the Email provider panel). Captcha protection is currently ON with hCaptcha — verify a real hCaptcha key is configured if any login/sign-up issues appear.
- **(2026-06-25) SMS — TFN submitted during Brevo setup (per Brian), status unconfirmed.** The US toll-free form was submitted at initial setup; Brevo's "complete this form" banner (Transactional → SMS) persists until a number is *active*, so it does NOT mean un-submitted — likely still in carrier review (~2–4 wks). Verify status via the form link (shows pending/approved), Brevo notifications, or support. **Brevo support ticket #5432916 opened 2026-06-25** to confirm submission + current status — awaiting their reply. **Do NOT re-submit (duplicate risk.)** App side fully built + dormant: `notify-sweep`, heir/assignee/invite/report SMS, inbound-sms webhook, `estate_users.sms_consent`. **ACTIVATION when approved: set Netlify env `BREVO_SMS_SENDER` to the number** (+ wire inbound-SMS webhook w/ `INBOUND_SMS_SECRET`) → flips on; then verify a send.
- **(2026-06-16) ⭐ Brian wants this soon** Text (SMS) messaging — make texting
  actually work: be able to **send** texts to people, and send **meeting
  reminders**. Code is already built (send-invite sends SMS via Brevo, adapts
  wording), but US carriers reject Brevo texts until a **toll-free number (TFN)
  is registered + verified** and US SMS compliance is enabled (a multi-day
  carrier-approval process; see Brevo "register for a toll-free number"). Once the
  TFN is approved, point `BREVO_SMS_SENDER` at it and texts flow. Then add a
  meeting-reminder job (a scheduled function that texts the executor/attendees
  ahead of `estate_meetings.scheduled_at`). No US SMS provider avoids the
  registration step. Revisit as soon as the TFN can be set up.
- **(2026-06-21) Multi-tenant SMS architecture — address at the END, for resale.**
  Today SMS uses ONE shared Brevo toll-free number (`BREVO_SMS_SENDER`) for every
  estate. Correct for Brian's single-family use + a small beta; does NOT scale to
  many paying customers:
  1. **Inbound routing leaks across tenants.** `inbound-sms.js` routes an incoming
     text by matching the *sender's phone* to a contact/user — with one shared
     number that carries no tenant info, the same phone can match contacts in
     different customers' estates (privacy leak). It is **single-tenant-only**
     until reworked.
  2. **Carrier throughput limits + one TFN registration** — high volume across many
     customers from one number looks like spam and hits rate limits.
  3. **Billing** — all SMS bills BEPO's one account.
  **Plan at launch:** provision a dedicated number **per estate (or per customer)**
  via **Twilio/Telnyx** so the number itself is the routing key — exactly like the
  per-estate email inbound tokens — making inbound self-routing with no leakage;
  register a **10DLC brand+campaign** (or per-number TFN); **price SMS into the
  subscription** (BEPO fronts provider cost, recovers in the plan); enforce
  **STOP/HELP opt-out** on inbound (TCPA); keep per-recipient `sms_consent`
  (already captured). Email + in-app messaging already scale as-is (per-estate
  addresses are free/infinite), so until the rework, treat SMS mainly as a one-way
  nudge ("you have an update — open the app") with two-way content in email/in-app.
  Context: memory `project_omnichannel_comms`.
- **(2026-06-16)** RLS performance tuning (careful, later) — Supabase performance
  advisor flags ~90 "multiple permissive policies" and ~17 "auth_rls_initplan"
  (wrap `auth.uid()` in `(select auth.uid())` so it evaluates once per query, and
  consolidate overlapping permissive policies). Pure micro-optimization; requires
  rewriting RLS policies, so do it as a deliberate, well-tested pass — a mistake
  here can reopen a security hole. Low urgency at current data size. (FK indexes
  were already added, migration 058.)
- **(2026-06-16)** Family tree / heirship function — a family-tree-type tool to
  help determine heirship (who inherits and in what shares). End-of-app-work item.
- **(2026-06-16)** Anthropic billing safeguard — turn on auto-reload and/or a
  low-balance email alert on the Anthropic account so AI features never silently
  go dark when credits run out (the empty balance knocked out every AI feature
  at once on 2026-06-16). App side already shows a friendly "temporarily
  unavailable" message; this is the account-level prevention.
- **(2026-06-14)** Archive estates on completion — when an estate is finished,
  archive it (don't delete): keep all data fully accessible long-term (issues
  surface for years), but move it out of the active view so the executor can take
  on a new, unrelated estate without clutter. Pairs with the "unrelated estate =
  separate account" idea in the Vision.
- **(2026-06-15)** Work out the Multi-Estate vs Single-Estate model — define
  what "multi-estate" actually means and how it differs from separate single
  estates. Concrete example: the current project is the Dan & Traci Bryant
  estate — each person is a separate estate that must be worked individually
  (own assets, own filings), but they're intertwined and belong together as one
  "Bryant" family unit. Contrast with a wholly *unrelated* estate the executor
  might take on that shares nothing with the Bryants. Need to decide: how are
  related estates grouped/linked (a family/group container?) vs how unrelated
  estates are kept fully separate (separate account? separate workspace?), what
  shows where, and how this interacts with archiving (above) and the
  shared-contacts mechanism we already built. Explore the model before building.
- **(2026-06-14)** Executor sign-up disclaimer — when someone signs up as the
  executor, present a disclaimer explaining their legal/fiduciary obligations
  (act in the estate's best interest, keep records, not legal advice, etc.) and
  require them to acknowledge it before proceeding.
- ✅ **RESOLVED (2026-06-15)** Confirm/connect the Anthropic account to the app —
  verified live: the death-notice draft for SSA returned correct, looked-up
  guidance (report by phone), which requires the web-search tool, so the
  Anthropic key + web-search plan are confirmed active in Netlify.
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
- **(2026-06-14)** AI advisor auto-trigger — the advisor now runs on Opus for
  the reasoning passes (done). Still TODO: run the "what am I missing" review
  automatically (e.g. after intake or when new data lands) instead of only
  on-demand.
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
