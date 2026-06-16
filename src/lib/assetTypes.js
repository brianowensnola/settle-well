// Asset types and the standard documents typically needed for each, used to
// drive the per-asset document checklist (have vs. need).

export const ASSET_TYPE_LABELS = {
  vehicle:     'Vehicle',
  real_estate: 'Real estate',
  business:    'Business',
  financial:   'Financial account',
  personal:    'Personal property',
  other:       'Other',
}

// Standard document checklist per asset type. Each entry: label + the doc_type
// to use when creating a "needed" document for it.
export const ASSET_DOC_CHECKLIST = {
  vehicle: [
    { label: 'Title', doc_type: 'vehicle' },
    { label: 'Registration', doc_type: 'vehicle' },
    { label: 'Lien release / payoff', doc_type: 'financial' },
    { label: 'Bill of sale', doc_type: 'vehicle' },
  ],
  real_estate: [
    { label: 'Deed', doc_type: 'property' },
    { label: 'Mortgage payoff statement', doc_type: 'financial' },
    { label: 'Property tax statement', doc_type: 'tax' },
    { label: 'Homeowners insurance', doc_type: 'insurance' },
    { label: 'Recent appraisal / CAD value', doc_type: 'property' },
  ],
  business: [
    { label: 'Formation / operating agreement', doc_type: 'business' },
    { label: 'EIN letter', doc_type: 'business' },
    { label: 'Financial statements', doc_type: 'financial' },
    { label: 'Business tax returns', doc_type: 'tax' },
  ],
  financial: [
    { label: 'Account statement', doc_type: 'financial' },
    { label: 'Beneficiary designation', doc_type: 'financial' },
  ],
  personal: [
    { label: 'Appraisal', doc_type: 'property' },
    { label: 'Photos / inventory', doc_type: 'property' },
  ],
  other: [],
}
