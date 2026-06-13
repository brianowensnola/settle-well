// The standard estate-administration checklist seeded into every new estate.
// Single source of truth — imported by QuickEstateSetup (seeds at creation)
// and EstateChecklist (renders / back-fills older estates).
export const MASTER_CHECKLIST = {
  'Immediate (First 24-72 hours)': [
    'Secure the property',
    'Order death certificates (get 15+)',
    'Notify family and close friends',
    'Locate will and trust documents',
    'Contact attorney/begin probate',
  ],
  'Government Notifications': [
    'Notify Social Security',
    'Notify IRS and state tax agencies',
    'Notify DMV (vehicles)',
    'Notify veteran benefits (if applicable)',
    'Cancel passport',
  ],
  'Financial Accounts': [
    'Locate bank accounts',
    'Locate investment accounts',
    'Locate retirement accounts (401k, IRA)',
    'Notify creditors of death',
    'File final tax return',
    'File estate tax return (if needed)',
  ],
  'Insurance': [
    'Locate life insurance policies',
    'Locate homeowner\'s insurance',
    'Locate auto insurance',
    'File life insurance claims',
    'File property insurance claims',
  ],
  'Property & Assets': [
    'Secure real property',
    'Get property appraised',
    'Transfer vehicle titles',
    'Inventory household contents',
    'Locate jewelry, art, collectibles',
  ],
  'Safe Deposit & Storage': [
    'Access safe deposit box',
    'Secure any storage units',
  ],
  'Business & Employment': [
    'Notify employer of death',
    'Collect final paycheck',
    'Handle business interests',
    'Cancel professional licenses',
  ],
  'Digital Assets': [
    'Locate cryptocurrency accounts',
    'Secure online accounts (email, banking)',
    'Access cloud storage & digital files',
    'Manage social media accounts',
  ],
  'Debts & Liabilities': [
    'Identify and notify creditors',
    'Pay estate debts',
    'Handle mortgage payoff',
    'Resolve pending lawsuits',
  ],
  'Beneficiaries & Distribution': [
    'Identify all heirs/beneficiaries',
    'Resolve guardianship (if needed)',
    'Arrange pet care',
    'Distribute assets to beneficiaries',
  ],
  'Special Situations': [
    'Handle unclaimed property (state databases)',
    'Recover loyalty/rewards accounts',
    'Collect on intellectual property',
    'Handle organizational memberships',
    'Collect pending refunds/income',
  ],
}

// Flatten into rows ready for the estate_checklist_items table.
export function buildChecklistRows(estateId) {
  const rows = []
  for (const [category, items] of Object.entries(MASTER_CHECKLIST)) {
    for (const item of items) {
      rows.push({ estate_id: estateId, category, item, completed: false })
    }
  }
  return rows
}
