// Obligation statuses that still cost money each month right now. Includes
// "cancel_on_vacate" — those bills (utilities, etc.) keep being paid while the
// property is occupied and only stop once it's vacated/sold.
export const ACTIVE_OBLIGATION_STATUSES = ['active', 'unknown', 'cancel_on_vacate']

export const SECTION_COLORS = {
  red:    { bg: '#FCEBEB', text: '#A32D2D', border: '#f5c6c6' },
  orange: { bg: '#FAEEDA', text: '#854F0B', border: '#f0d4a0' },
  amber:  { bg: '#FAE8C8', text: '#633806', border: '#edc98a' },
  green:  { bg: '#EAF3DE', text: '#3B6D11', border: '#c6dfa8' },
  gray:   { bg: '#F1EFE8', text: '#5F5E5A', border: '#dddbd3' },
  blue:   { bg: '#E6F1FB', text: '#185FA5', border: '#b3d4f5' },
}

export const STATUS_STYLES = {
  pending:     'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  waiting:     'bg-amber-100 text-amber-700',
  submitted:   'bg-purple-100 text-purple-700',
  done:        'bg-green-100 text-green-700',
}

export const STATUS_LABELS = {
  pending:     'Pending',
  in_progress: 'In Progress',
  waiting:     'Waiting',
  submitted:   'Submitted',
  done:        'Done',
}

export const CONTACT_ROLES = {
  attorney:    'Attorney',
  bank:        'Bank',
  lender:      'Lender',
  buyer:       'Buyer',
  funeral_home:'Funeral Home',
  realtor:     'Realtor',
  appraiser:   'Appraiser',
  government:  'Government',
  medical:     'Medical',
  business:    'Business',
  family:      'Family',
  other:       'Other',
}

// Fiduciary estate status the heir/observer sees on the transparency report.
export const STATUS_STAGES = [
  { key: 'not_started',          label: 'Not started' },
  { key: 'probate_filed',        label: 'Probate filed' },
  { key: 'inventory',            label: 'Inventory in progress' },
  { key: 'creditor_notice',      label: 'Creditor notice period' },
  { key: 'tax_review',           label: 'Tax review' },
  { key: 'liquidation',          label: 'Asset liquidation' },
  { key: 'distribution_pending', label: 'Distribution pending' },
  { key: 'closed',               label: 'Estate closed' },
]
export const statusStageLabel = key => STATUS_STAGES.find(s => s.key === key)?.label

export const DOC_TYPES = {
  identity:       'Identity',
  legal:          'Legal',
  property:       'Property',
  financial:      'Financial',
  insurance:      'Insurance',
  tax:            'Tax',
  business:       'Business',
  medical:        'Medical',
  vehicle:        'Vehicle',
  correspondence: 'Correspondence',
  sent:           'Sent',
  other:          'Other',
}
