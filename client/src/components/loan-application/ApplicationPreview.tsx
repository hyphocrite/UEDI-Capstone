import { useEffect, useState } from 'react'
import { AUTO_RESTRUCTURE_TEXT, PAYROLL_DEDUCTION_TEXT, installmentOf, longDate, termMonthsOf } from './applicationForm'
import type { Form } from './applicationForm'
import CoMakerForm from './CoMakerForm'
import type { CoMakerInfo } from './CoMakerForm'
import { Box, Field, Fill, Heading, InParens, Letterhead, Sheet, Signature } from './paperForm'
import { api } from '../../lib/api'
import { employmentStatusLabel } from '../../lib/applications'
import type { EmploymentStatus } from '../../lib/applications'
import { formatPeso } from '../../lib/format'
import { pesoWords } from '../../lib/pesoWords'

export type PreviewDocument = { label: string; fileName: string }

type Props = {
  form: Form
  documents: PreviewDocument[]
  /** Staff fill the Bookkeeper section; for members it stays blank for the Bookkeeper. */
  staffView: boolean
  /** The applicant has a full UDEI member number. */
  linked: boolean
  /** When changing a filed application. */
  applicationNo?: string
}

const pesos = (s: string) => (s.trim() === '' ? '' : formatPeso(Number(s) || 0))

/** The co-makers looked up by member number: names for everyone, and the member record's details for staff. */
function useCoMakers(ids: string[]): CoMakerInfo[] {
  const [found, setFound] = useState<Record<string, CoMakerInfo>>({})
  const key = ids.join('|')
  useEffect(() => {
    let live = true
    for (const id of ids) {
      api<CoMakerInfo>(`/api/comaker/lookup?memberId=${encodeURIComponent(id)}`)
        .then((d) => live && setFound((f) => ({ ...f, [id]: d })))
        .catch(() => {})
    }
    return () => {
      live = false
    }
    // ids is rebuilt every render; key holds its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return ids.map((id) => found[id] ?? { memberId: id })
}

/**
 * The application typed onto UDEI's Mutual Assistance Application Form, ready to print and sign.
 * When co-makers are named, their statement follows on a second sheet. window.print shows only these sheets.
 */
export default function ApplicationPreview({ form: f, documents, staffView, linked, applicationNo }: Props) {
  const inst = installmentOf(f)
  const term = termMonthsOf(f)
  const amount = Number(f.amount) || 0
  const quincenal = f.paymentFrequency === 'quincenal'
  const coMakers = useCoMakers([f.coMaker1, f.coMaker2].map((c) => c.trim()).filter(Boolean))
  const mi = f.middleInitial.trim().replace(/\.$/, '')
  const fullName = [f.firstName.trim(), mi ? `${mi}.` : '', f.lastName.trim()].filter(Boolean).join(' ')
  const memberId = f.memberId.trim()

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 print:block">
      <Sheet label="Mutual Assistance Application Form">
        <Letterhead
          title="Mutual Assistance Application Form"
          note={<span className="print:hidden">{applicationNo ? `${applicationNo} · changes not yet saved` : 'Preview · not yet submitted'}</span>}
        />

        <div className="flex flex-wrap justify-between gap-x-6 gap-y-2">
          <Field label="Application No." className="min-w-[14rem] flex-1 sm:max-w-[18rem]">{applicationNo}</Field>
          <Field label="Date" className="min-w-[14rem] flex-1 sm:max-w-[18rem]">{longDate(f.applicationDate)}</Field>
        </div>

        <section className="space-y-2">
          <p className="flex min-w-0 flex-wrap items-start gap-x-2">
            <span className="shrink-0 pt-px">Name:</span>
            <Fill className="min-w-[8rem] flex-[3] uppercase" caption="Last Name">{f.lastName.trim()}</Fill>
            <Fill className="min-w-[8rem] flex-[3] uppercase" caption="First Name">{f.firstName.trim()}</Fill>
            <Fill className="min-w-[4rem] flex-1 text-center uppercase" caption="Middle Initial">{mi}</Fill>
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-2">
            <Field label="Member ID">{memberId && linked ? memberId : memberId ? `${memberId} (not yet a UDEI member)` : 'Not yet a UDEI member'}</Field>
            <Field label="Date of Birth">{longDate(f.dateOfBirth)}</Field>
          </div>
          <Field label="Residence Address">{f.residenceAddress.trim()}</Field>
          <Field label="Employer">{f.employer.trim()}</Field>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Employment Status:</span>
            {(Object.keys(employmentStatusLabel) as EmploymentStatus[]).map((s) => (
              <Box key={s} checked={f.employmentStatus === s}>{employmentStatusLabel[s]}</Box>
            ))}
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-2">
            <Field label="Monthly Salary">{pesos(f.monthlySalary)}</Field>
            <Field label="Net take home pay">{pesos(f.netTakeHomePay)}</Field>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3 print:grid-cols-3">
            <Field label="Years as member">{f.yearsAsMember || '0'}</Field>
            <Field label="Past mutual assistance">{f.priorLoans || '0'}</Field>
            <Field label="Late payments">{f.priorLatePayments || '0'}</Field>
          </div>
        </section>

        <section className="space-y-2">
          <Heading>Application Agreement</Heading>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Type of Mutual Assistance:</span>
            <Box checked={f.loanType === 'long_term'}>Long term</Box>
            <Box checked={f.loanType === 'emergency'}>Emergency</Box>
          </p>
          <p>
            I hereby apply for a Mutual Assistance in the amount of <Fill className="min-w-[7rem]">{amount > 0 ? formatPeso(amount) : ''}</Fill>{' '}
            <InParens className="min-w-[14rem]">{amount > 0 ? pesoWords(amount) : ''}</InParens>, payable in{' '}
            <Fill className="min-w-[3rem] text-center">{term || ''}</Fill> months at{' '}
            <Fill className="min-w-[3rem] text-center">{f.monthlyRate}</Fill>% per month on the remaining balance, for the purpose of{' '}
            <Fill className="min-w-[12rem]">{f.purpose.trim()}</Fill>.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Payroll deduction:</span>
            <Box checked={quincenal}>Quincenal (15th and 30th)</Box>
            <Box checked={!quincenal}>Monthly</Box>
          </p>
          <Field label="Installment">
            {inst ? `${formatPeso(Math.round(inst.monthly))} per month${quincenal ? `, ${formatPeso(Math.round(inst.quincenal))} per quincena` : ''}` : ''}
          </Field>
          <div className="space-y-1.5 pt-1 sm:text-justify print:text-justify">
            <p><Box checked={f.payrollDeduction}>{PAYROLL_DEDUCTION_TEXT}</Box></p>
            <p><Box checked={f.autoRestructure}>{AUTO_RESTRUCTURE_TEXT}</Box></p>
          </div>
          {coMakers.length > 0 && (
            <Field label={coMakers.length > 1 ? 'Co-makers' : 'Co-maker'}>
              {coMakers.map((c) => (c.name ? `${c.name} (${c.memberId})` : `Member ${c.memberId}`)).join('; ')}
              <span className="font-normal italic print:hidden"> · statement on the next sheet</span>
            </Field>
          )}
          <div className="flex justify-end">
            <Signature title="Signature of the Applicant over printed name" name={fullName} className="w-full sm:w-80" />
          </div>
        </section>

        <section className="break-inside-avoid space-y-2">
          <Heading>To be filled up by the Bookkeeper</Heading>
          <p>Mutual Assistance balance to date:</p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 print:grid-cols-2">
            <Field label="Long term">{staffView ? pesos(f.longTermBalance) : ''}</Field>
            <Field label="Due date">{staffView ? longDate(f.longTermDueDate) : ''}</Field>
            <Field label="Short term">{staffView ? pesos(f.shortTermBalance) : ''}</Field>
            <Field label="Due date">{staffView ? longDate(f.shortTermDueDate) : ''}</Field>
          </div>
          <Field label="Already deducted per month">{staffView ? pesos(f.monthlyPayment) : ''}</Field>
        </section>

        <section className="break-inside-avoid">
          <Heading>Approved</Heading>
          <div className="grid grid-cols-2 gap-x-8 sm:grid-cols-4 print:grid-cols-4">
            <Signature title="Bookkeeper" />
            <Signature title="CreCom Chairman" />
            <Signature title="President" />
            <Signature title="Treasurer" />
          </div>
        </section>

        <section className="break-inside-avoid border-t border-black pt-2 text-xs">
          <p className="font-semibold">Supporting documents attached:</p>
          {documents.length ? (
            <ul className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2 print:grid-cols-2">
              {documents.map((d, i) => (
                <li key={`${d.fileName}-${i}`} className="min-w-0 break-all">
                  <Box checked>{d.label}<span className="text-gray-600"> · {d.fileName}</span></Box>
                </li>
              ))}
            </ul>
          ) : (
            <p>None attached.</p>
          )}
        </section>
      </Sheet>

      {coMakers.length > 0 && (
        <CoMakerForm
          coMakers={coMakers}
          borrowerName={fullName}
          borrowerIsMember={linked}
          amount={amount}
          termMonths={term}
          quincenal={quincenal}
          applicationDate={f.applicationDate}
          applicationNo={applicationNo}
        />
      )}
    </div>
  )
}
