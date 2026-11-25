import { longDate } from './applicationForm'
import { Field, Fill, Heading, InParens, Letterhead, Sheet, Signature } from './paperForm'
import { employmentStatusLabel } from '../../lib/applications'
import type { EmploymentStatus } from '../../lib/applications'
import { formatPeso } from '../../lib/format'
import { pesoWords } from '../../lib/pesoWords'

/** A co-maker as the lookup returns them. Staff also get the member record's details. */
export type CoMakerInfo = {
  memberId: string
  name?: string
  details?: {
    residenceAddress?: string
    employer?: string
    employmentStatus?: EmploymentStatus
    phone?: string
    joinedAt?: string
  }
}

type Props = {
  coMakers: CoMakerInfo[]
  borrowerName: string
  /** The applicant isn't a linked UDEI member, which is why a member co-maker is needed. */
  borrowerIsMember: boolean
  amount: number
  termMonths: number
  quincenal: boolean
  applicationDate: string
  applicationNo?: string
  /** Printed on its own (the co-maker's copy), not as the second sheet after the application. */
  standalone?: boolean
}

/**
 * The co-maker's statement: a second sheet, laid out like the application form, with each co-maker's
 * details and their signature. Printed on its own page after the application.
 */
export default function CoMakerForm({ coMakers, borrowerName, borrowerIsMember, amount, termMonths, quincenal, applicationDate, applicationNo, standalone = false }: Props) {
  return (
    <Sheet next={!standalone} label="Co-maker's statement">
      <Letterhead title="Co-Maker's Statement" note={applicationNo ? `Attached to application ${applicationNo}` : 'Attached to the Mutual Assistance Application Form'} />

      <p>
        For the Mutual Assistance applied for by <Fill className="min-w-[12rem] uppercase">{borrowerName}</Fill> on{' '}
        <Fill className="min-w-[9rem]">{longDate(applicationDate)}</Fill>, in the amount of{' '}
        <Fill className="min-w-[7rem]">{amount > 0 ? formatPeso(amount) : ''}</Fill>{' '}
        <InParens className="min-w-[14rem]">{amount > 0 ? pesoWords(amount) : ''}</InParens>, payable in{' '}
        <Fill className="min-w-[3rem] text-center">{termMonths || ''}</Fill> months by {quincenal ? 'quincenal' : 'monthly'} payroll deduction.
      </p>
      {!borrowerIsMember && (
        <p className="text-xs italic">The applicant is not yet a UDEI member, so a UDEI member must sign as co-maker.</p>
      )}

      {coMakers.map((c, i) => {
        const d = c.details
        return (
          <section key={c.memberId} className="break-inside-avoid space-y-2">
            <Heading>{coMakers.length > 1 ? `Co-maker ${i + 1}` : 'Co-maker'}</Heading>
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[2fr_1fr] print:grid-cols-[2fr_1fr]">
              <Field label="Name"><span className="uppercase">{c.name ?? ''}</span></Field>
              <Field label="Member ID">{c.memberId}</Field>
            </div>
            <Field label="Residence Address">{d?.residenceAddress}</Field>
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-2">
              <Field label="Employer">{d?.employer}</Field>
              <Field label="Employment Status">{d?.employmentStatus ? employmentStatusLabel[d.employmentStatus] : ''}</Field>
              <Field label="Contact No.">{d?.phone}</Field>
              <Field label="Member since">{longDate(d?.joinedAt)}</Field>
            </div>
            <p className="pt-1 sm:text-justify print:text-justify">
              I, <Fill className="min-w-[12rem] uppercase">{c.name ?? ''}</Fill>, a member of United DNSC Employees, Inc., agree
              to be co-maker of the Mutual Assistance above. Should the borrower fail to pay, I bind myself jointly and severally
              with the borrower to pay the unpaid balance, and I authorize the Payroll Officer of DNSC and/or the Treasurer of
              United DNSC Employees, Inc. to deduct it from my salary or from any form of benefits due to me.
            </p>
            <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2 print:grid-cols-2">
              <Signature title="Signature of co-maker over printed name" name={c.name} />
              <Signature title="Date signed" />
            </div>
          </section>
        )
      })}

      <section className="break-inside-avoid">
        <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2 print:grid-cols-2">
          <Signature title="Signature of applicant over printed name" name={borrowerName} />
          <Signature title="Noted by: Loan Officer" />
        </div>
      </section>
    </Sheet>
  )
}
