// The standard estate-administration task set seeded into every estate.
// Goal: be the expert advisor a first-time executor never had — each task
// carries a short "why this matters / what to check" detail so the user
// understands things they'd never have known to worry about. Exhaustive by
// default; users edit/add/delete freely. Keys MUST match the phase section
// labels exactly (em dash, spacing).
export const TASK_TEMPLATE = {
  'Phase 1 — Immediate': [
    { text: 'Obtain the legal pronouncement & cause of death', detail: 'Required before death certificates can be issued — a hospital, hospice, or coroner provides it.' },
    { text: 'Secure the residence and vehicles', detail: 'Lock up, keep a key, consider changing locks, and bring in mail/packages. Empty homes become targets fast.' },
    { text: 'Arrange immediate care for pets, plants, and dependents', detail: 'These can\'t wait for probate. Line up a caregiver today and track costs for reimbursement from the estate.' },
    { text: 'Locate the will, trust, and funeral/burial wishes', detail: 'Check safes, files, email, and with the attorney. Wishes may specify burial vs cremation and prepaid arrangements.' },
    { text: 'Engage funeral home; confirm prepaid or insurance coverage', detail: 'Ask whether services were prepaid or covered by a policy before paying out of pocket.' },
    { text: 'Order 15+ certified death certificates', detail: 'Nearly every bank, insurer, and agency requires an original. Ordering extra now beats reordering later.' },
  ],
  'Phase 2 — First Week': [
    { text: 'Notify close family, the employer, and key people', detail: 'Ask the employer about final pay, benefits, and any employer-provided life insurance.' },
    { text: 'Contact the probate attorney to confirm the process for the state', detail: 'Probate rules and deadlines vary by state — confirm what applies where the deceased lived.' },
    { text: 'Gather financial records, bills, statements, and passwords', detail: 'Collect mail, checkbooks, recent statements, and any password list — needed for the financial audit and to stop/transfer services.' },
    { text: 'Forward the deceased\'s mail (USPS)', detail: 'Forwarding to the executor surfaces accounts, bills, and subscriptions you didn\'t know existed.' },
    { text: 'Inventory and secure valuables, firearms, and vehicles', detail: 'Photograph and list items now. Firearms have special legal transfer rules.' },
    { text: 'Identify the executor and the beneficiaries named in the will', detail: 'Confirms who has authority and who inherits before any decisions are made.' },
  ],
  'Phase 3 — Government Notifications': [
    { text: 'Notify the Social Security Administration', detail: 'The funeral home often reports it — confirm. SSA may reclaim the month-of-death payment; a small death benefit may be available.' },
    { text: 'Notify the IRS and the state tax agency', detail: 'Needed for final returns and to block identity-theft refunds filed in the deceased\'s name.' },
    { text: 'Notify the DMV and handle vehicle titles', detail: 'Titles must be transferred or sold through the estate.' },
    { text: 'Notify Veterans Affairs if the deceased was a veteran', detail: 'Burial benefits, a memorial flag, and survivor benefits may be available.' },
    { text: 'Cancel passport, Medicare/Medicaid, and voter registration', detail: 'Prevents identity fraud and stops benefit overpayments that must later be repaid.' },
    { text: 'Apply for any survivor, burial, or death benefits', detail: 'SSA survivor benefits, VA, union, or employer benefits may apply — they aren\'t automatic.' },
  ],
  'Phase 4 — Financial Accounts': [
    { text: 'Locate and inventory every bank account', detail: 'Record balances as of the date of death for the estate accounting.' },
    { text: 'Locate investment, brokerage, and crypto accounts', detail: 'Check for transfer-on-death (TOD) designations that pass outside probate.' },
    { text: 'Locate retirement accounts and pensions (401k, IRA)', detail: 'These usually pass by beneficiary designation, not the will — confirm the named beneficiaries.' },
    { text: 'Open an estate bank account', detail: 'Once you have Letters Testamentary, run all estate income and expenses through it — never personal accounts.' },
    { text: 'Notify each financial institution of the death', detail: 'Freezes the accounts and stops unauthorized activity.' },
    { text: 'Stop or redirect direct deposits and auto-payments', detail: 'Prevents bounced payments and recovers deposits that arrive after death.' },
  ],
  'Phase 5 — Insurance': [
    { text: 'Locate all life insurance policies', detail: 'Check files, the employer, the mortgage (credit life), and the will. Claims need a death certificate.' },
    { text: 'File life insurance claims', detail: 'Proceeds to named beneficiaries are usually paid quickly and outside probate.' },
    { text: 'Keep homeowner\'s and auto insurance active', detail: 'A lapse on a vacant home can void coverage exactly when you need it most.' },
    { text: 'Locate health, auto, and other personal policies', detail: 'Identify what to claim versus what to cancel.' },
    { text: 'Cancel personal policies once no longer needed', detail: 'Stop premiums and request any prorated refunds.' },
  ],
  'Phase 6 — Real Estate & Property': [
    { text: 'Secure and maintain each property', detail: 'Confirm who is physically checking on it. Vacant homes need eyes on them.' },
    { text: 'Arrange ongoing upkeep — lawn, pool, pest, snow', detail: 'A neglected lawn invites code violations and signals an empty house to burglars. Decide who mows and how it\'s paid.' },
    { text: 'List every recurring property bill and decide keep/transfer/cancel', detail: 'Utilities, HOA, security/alarm, water, internet, pool, pest — go line by line; some must stay on (insurance, alarm), others can stop.' },
    { text: 'Obtain date-of-death property appraisals', detail: 'Sets the value for taxes and for dividing or selling.' },
    { text: 'Locate deeds and titles; check for transfer-on-death deeds', detail: 'A TOD deed passes the property outside probate to a named person.' },
    { text: 'Decide to sell, transfer, or retain each property', detail: 'Drives the mortgage, insurance, and tax decisions that follow.' },
  ],
  'Phase 7 — Debts & Liabilities': [
    { text: 'Identify and notify all creditors', detail: 'Mortgages, cards, loans, medical bills. Some states require formal notice that starts a claims deadline.' },
    { text: 'Request payoff balances on every mortgage and loan', detail: 'Get exact figures as of the date of death.' },
    { text: 'Verify each debt before paying anything', detail: 'Don\'t pay disputed or unverified debts. Some obligations die with the person.' },
    { text: 'Pay valid debts from estate funds in the correct priority', detail: 'State law sets the payment order — paying out of order can make the executor personally liable.' },
    { text: 'Resolve pending lawsuits, judgments, or child-support arrears', detail: 'These survive death and become claims against the estate.' },
  ],
  'Phase 8 — Business Interests': [
    { text: 'Identify any business ownership or interests', detail: 'LLC, partnership, sole proprietorship, or side income.' },
    { text: 'Locate the operating or partnership agreement', detail: 'It may dictate succession, buy-out, or wind-down terms.' },
    { text: 'Notify partners, key clients, and employees', detail: 'Keeps the business stable while decisions are made.' },
    { text: 'Decide to sell, transfer, or wind down the business', detail: 'Each path has tax and legal consequences — coordinate with the attorney and CPA.' },
    { text: 'Obtain a business valuation', detail: 'Needed for a sale, a partner buy-out, or estate tax.' },
  ],
  'Phase 9 — Digital Assets': [
    { text: 'Inventory online accounts and devices', detail: 'Email, banking, shopping, photos, and the phones/computers that unlock them.' },
    { text: 'Secure email and password-manager access first', detail: 'Email is the master key — it resets every other account. Lock it down early.' },
    { text: 'Locate cryptocurrency and digital wallets', detail: 'Without the keys or seed phrase these can be permanently and irrecoverably lost.' },
    { text: 'Memorialize or close social media accounts', detail: 'Stops impersonation and notifies contacts. Decide close vs memorialize for each platform.' },
    { text: 'Set up a legacy contact / memorial page where offered', detail: 'Facebook, Apple, and Google let a designated person manage or memorialize the account — this is different from closing it.' },
    { text: 'Cancel subscriptions and recurring digital services', detail: 'Streaming, cloud storage, apps, and memberships quietly keep charging the card.' },
  ],
  'Phase 10 — Taxes': [
    { text: 'File the deceased\'s final personal income tax return', detail: 'Due the normal tax deadline of the year following the death.' },
    { text: 'File estate income tax returns (Form 1041) if the estate earns income', detail: 'Required once estate assets generate income during administration.' },
    { text: 'Determine if a federal or state estate tax return is required', detail: 'Most estates fall under the threshold, but confirm rather than assume.' },
    { text: 'Obtain an EIN for the estate', detail: 'The estate\'s tax ID — needed for the estate bank account and returns.' },
    { text: 'Review prior-year returns for refunds or carryforwards', detail: 'Uncollected refunds and loss carryforwards are estate assets.' },
  ],
  'Phase 11 — Commonly Missed Items': [
    { text: 'Run a forensic review of the finances', detail: 'Comb statements for recurring payments, unknown payees, and transfers that reveal accounts, debts, or obligations no one knew about.' },
    { text: 'Search state unclaimed-property databases', detail: 'Old deposits, refunds, and forgotten accounts are often held by the state.' },
    { text: 'Recover airline miles, hotel points, and rewards', detail: 'Many programs allow transfer to heirs on request.' },
    { text: 'Check for uncashed checks and pending refunds', detail: 'Final paychecks, insurance refunds, utility and rental deposits.' },
    { text: 'Open and review the safe deposit box', detail: 'May hold the will, deeds, cash, or valuables. Access rules after death vary by bank and state.' },
    { text: 'Collect final wages, PTO, and owed income', detail: 'Employers owe unpaid wages and accrued leave to the estate.' },
    { text: 'Cancel memberships, licenses, and subscriptions', detail: 'Gym, warehouse clubs, professional licenses, and recurring services.' },
  ],
}

// Build estate_tasks rows from a { sectionLabel: sectionId } map.
export function buildTaskRows(estateId, sectionIdByLabel) {
  const rows = []
  for (const [label, tasks] of Object.entries(TASK_TEMPLATE)) {
    const sectionId = sectionIdByLabel[label]
    if (!sectionId) continue
    tasks.forEach((t, i) => {
      rows.push({
        estate_id: estateId,
        section_id: sectionId,
        text: t.text,
        detail: t.detail,
        status: 'pending',
        sort_order: i + 1,
      })
    })
  }
  return rows
}
