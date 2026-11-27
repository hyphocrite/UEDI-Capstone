// The Privacy Notice (RA 10173) for the app. Same text and version as client/src/lib/privacy.ts and
// server/src/config/privacy.js; change all three together.
export const PRIVACY_NOTICE_VERSION = '2026-11'

export const CONSENT = {
  account: 'I have read the Privacy Notice and agree to UDEI processing my personal data for my membership and mutual assistance.',
  application: 'I agree that UDEI may use my application, documents and payment history to evaluate it, including an automated credit score reviewed by officers.',
  coMaker: 'I agree that UDEI may keep and use my details as co-maker for this mutual assistance, and contact me about its payments.',
}

export const NOTICE: { title: string; items: string[] }[] = [
  { title: 'Who collects your data', items: ['United DNSC Employees, Inc. (UDEI), through this app and its web system.'] },
  {
    title: 'What we collect',
    items: [
      'Identity and contact: name, birth date, address, email, phone and member number.',
      'Employment and pay: employer, employment status, salary and net take-home pay.',
      'Documents you upload: IDs, payslips, proof of address and signed forms.',
      'Mutual assistance and payment records, contributions, attendance and bill payments.',
    ],
  },
  {
    title: 'Why',
    items: [
      'To process and manage your membership and mutual assistance.',
      'To compute a credit score and a member score, which help the officers decide.',
      'To bill payroll deductions through DNSC, and for the reports the officers need.',
    ],
  },
  {
    title: 'Who sees it',
    items: [
      'UDEI officers, each only as far as their role needs.',
      "DNSC's Accounting and HR, only for payroll billing.",
    ],
  },
  { title: 'How long we keep it', items: ['Five years after your last account with UDEI is closed, unless a law requires longer. (Proposed; UDEI to confirm.)'] },
  { title: 'Automated scoring', items: ['The scores only assist. An officer always reviews your application and decides.'] },
  {
    title: 'Your rights',
    items: [
      'To be informed, to access your data and have it corrected, to object, and to have it erased where the law allows.',
      'To complain to the National Privacy Commission (privacy.gov.ph). Contact the UDEI office for any request.',
    ],
  },
]
