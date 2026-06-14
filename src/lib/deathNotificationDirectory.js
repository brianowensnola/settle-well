// Built-in reference list of common death-notification recipients. method tells
// the UI how the notice is actually handled. Mailing addresses are intentionally
// NOT hard-coded — for mail recipients the address is looked up (web search) at
// draft time and shown with a source, so it stays current and verifiable.
export const DEATH_NOTIFICATION_DIRECTORY = [
  {
    name: 'Social Security Administration', type: 'government', method: 'phone',
    phone: '1-800-772-1213',
    note: "Report the death by phone. The funeral home often reports it to SSA automatically — confirm they did. (Reporting to SSA usually notifies Medicare too.)",
  },
  {
    name: 'Internal Revenue Service (IRS)', type: 'government', method: 'online',
    url: 'https://www.irs.gov',
    note: "No standalone death letter — the IRS is notified via the deceased's final tax return and Form 56 (Notice of Fiduciary Relationship). Handle with the tax preparer/attorney.",
  },
  {
    name: 'Medicare', type: 'government', method: 'phone',
    phone: '1-800-633-4227',
    note: 'Usually handled automatically when SSA is notified. Call only if you need to confirm or cancel coverage.',
  },
  {
    name: 'U.S. Dept. of Veterans Affairs (if a veteran)', type: 'government', method: 'phone',
    phone: '1-800-827-1000',
    note: 'If the deceased was a veteran, notify the VA about benefits and burial eligibility.',
  },
  {
    name: 'Equifax', type: 'credit_bureau', method: 'mail',
    url: 'https://www.equifax.com',
    note: 'Request a deceased flag on the credit file to prevent identity theft. Address looked up at draft time — verify it.',
  },
  {
    name: 'Experian', type: 'credit_bureau', method: 'mail',
    url: 'https://www.experian.com',
    note: 'Request a deceased notation on the credit file. Address looked up at draft time — verify it.',
  },
  {
    name: 'TransUnion', type: 'credit_bureau', method: 'mail',
    url: 'https://www.transunion.com',
    note: 'Request a deceased flag on the credit file. Address looked up at draft time — verify it.',
  },
  {
    name: 'U.S. Postal Service (mail forwarding/hold)', type: 'government', method: 'online',
    url: 'https://www.usps.com',
    note: "Forward or hold the deceased's mail. For an estate this often requires documentation at the local post office.",
  },
  {
    name: 'State DMV (driver license & vehicle titles)', type: 'government', method: 'mail',
    note: 'State-specific: surrender the license and handle vehicle titles through the DMV in the state of residence. Address looked up at draft time — verify it.',
  },
]
