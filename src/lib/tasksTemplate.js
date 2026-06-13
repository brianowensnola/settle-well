// Standard estate-administration starter tasks, grouped by the phase
// sections created in QuickEstateSetup. Seeded into every new estate so the
// Tasks board isn't empty on day one. Keys MUST match the section labels
// exactly (em dash, spacing). Users edit/add/delete freely from here.
export const TASK_TEMPLATE = {
  'Phase 1 — Immediate': [
    'Obtain legal pronouncement of death',
    'Secure the residence and property',
    'Arrange care for pets and dependents',
    'Locate the will and any trust documents',
    'Contact funeral home / arrange services',
    'Order 15+ certified death certificates',
  ],
  'Phase 2 — First Week': [
    'Notify immediate family and close friends',
    'Contact the estate attorney to begin probate',
    'Locate financial records, statements, and passwords',
    'Forward the deceased\'s mail (USPS)',
    'Secure valuables, vehicles, and firearms',
    'Identify the named executor and beneficiaries',
  ],
  'Phase 3 — Government Notifications': [
    'Notify the Social Security Administration',
    'Notify the IRS and state tax agency',
    'Notify the DMV regarding vehicle titles',
    'Notify Veterans Affairs (if a veteran)',
    'Cancel passport and Medicare/Medicaid',
    'Apply for any survivor or burial benefits',
  ],
  'Phase 4 — Financial Accounts': [
    'Locate and inventory all bank accounts',
    'Locate investment and brokerage accounts',
    'Locate retirement accounts (401k, IRA, pension)',
    'Open an estate bank account',
    'Notify financial institutions of the death',
    'Redirect direct deposits and stop auto-payments',
  ],
  'Phase 5 — Insurance': [
    'Locate all life insurance policies',
    'File life insurance claims',
    'Locate homeowner\'s and auto insurance',
    'Maintain property insurance during administration',
    'Cancel health, dental, and personal policies',
  ],
  'Phase 6 — Real Estate & Property': [
    'Secure and maintain all real property',
    'Obtain date-of-death appraisals',
    'Locate property deeds and titles',
    'Decide to sell, transfer, or retain each property',
    'Transfer or sell vehicles',
    'Inventory household contents and valuables',
  ],
  'Phase 7 — Debts & Liabilities': [
    'Identify and notify all creditors',
    'Request payoff balances on mortgages and loans',
    'Review and validate outstanding debts',
    'Pay valid estate debts from estate funds',
    'Resolve any pending lawsuits or claims',
  ],
  'Phase 8 — Business Interests': [
    'Identify any business ownership or interests',
    'Locate operating agreements and business records',
    'Notify business partners and key contacts',
    'Decide to sell, transfer, or wind down the business',
    'Obtain a business valuation if needed',
  ],
  'Phase 9 — Digital Assets': [
    'Inventory online accounts and digital assets',
    'Secure email and password-manager access',
    'Locate any cryptocurrency or digital wallets',
    'Memorialize or close social media accounts',
    'Cancel subscriptions and recurring services',
  ],
  'Phase 10 — Taxes': [
    'File the deceased\'s final personal income tax return',
    'File estate income tax returns (Form 1041) if required',
    'Determine if a federal estate tax return is required',
    'Obtain an EIN for the estate',
    'Review prior-year returns for refunds or carryforwards',
  ],
  'Phase 11 — Commonly Missed Items': [
    'Search state unclaimed-property databases',
    'Recover airline miles, hotel points, and rewards',
    'Check for uncashed checks and pending refunds',
    'Review safe deposit box contents',
    'Collect any final wages or owed income',
    'Cancel memberships and professional licenses',
  ],
}

// Build estate_tasks rows from a { sectionLabel: sectionId } map.
export function buildTaskRows(estateId, sectionIdByLabel) {
  const rows = []
  for (const [label, tasks] of Object.entries(TASK_TEMPLATE)) {
    const sectionId = sectionIdByLabel[label]
    if (!sectionId) continue
    tasks.forEach((text, i) => {
      rows.push({
        estate_id: estateId,
        section_id: sectionId,
        text,
        status: 'pending',
        sort_order: i + 1,
      })
    })
  }
  return rows
}
