// The Privacy Notice (RA 10173, the Data Privacy Act of 2012) and the consent sentences.
// Same version as server/src/config/privacy.js; the mobile app has its own copy of the text
// (mobile/src/privacy.ts). Change the version on both when the notice changes.
export const PRIVACY_NOTICE_VERSION = '2026-11'

export const CONSENT = {
  account: 'I have read the Privacy Notice and agree to UDEI processing my personal data for my membership and mutual assistance.',
  application: 'I agree that UDEI may use my application, documents and payment history to evaluate it, including an automated credit score reviewed by officers.',
  coMaker: 'I agree that UDEI may keep and use my details as co-maker for this mutual assistance, and contact me about its payments.',
}

/** How long records are kept. UDEI to confirm: a proposal, not yet agreed with the officers. */
export const RETENTION = 'Five years after your last account with UDEI is closed, unless a law requires longer. (Proposed; UDEI to confirm.)'

export const NOTICE: { title: string; items: string[] }[] = [
  { title: 'Who collects your data', items: ['United DNSC Employees, Inc. (UDEI), the association of employees of Davao del Norte State College, through this system and its mobile app.'] },
  {
    title: 'What we collect',
    items: [
      'Identity and contact: name, birth date, address, email, phone and member number.',
      'Employment and pay: employer, employment status, salary and net take-home pay.',
      'Documents you upload: IDs, payslips, proof of address and signed forms.',
      'Mutual assistance and payment records: applications, schedules, payroll deductions, cash, e-money and bank payments, and receipts.',
      'Retirement plan contributions, meeting and seminar attendance, and bill payments recorded by the office.',
    ],
  },
  {
    title: 'Why',
    items: [
      'To process and manage your membership and mutual assistance.',
      'To compute a credit score for applications and a member score, which help the officers decide.',
      'To bill payroll deductions through DNSC, and to prepare the reports the officers need.',
    ],
  },
  {
    title: 'Who sees it',
    items: [
      'UDEI officers, each only as far as their role needs: Loan Officer, Bookkeeper, Treasurer, Credit Committee Chairman, President and the Administrator.',
      "DNSC's Accounting and HR, only what is needed to bill and remit payroll deductions.",
      'Your co-makers see the status of the mutual assistance they vouched for, not your other records.',
    ],
  },
  { title: 'How long we keep it', items: [RETENTION] },
  { title: 'Automated scoring', items: ['The credit score and member score only assist. An officer always reviews your application and makes the decision; members never see the credit score.'] },
  {
    title: 'Your rights',
    items: [
      'To be informed, to access your data and to have it corrected.',
      'To object to processing, and to have data erased or blocked where the law allows (records UDEI must keep for accounts it can’t erase).',
      'To complain to the National Privacy Commission (privacy.gov.ph).',
    ],
  },
]
