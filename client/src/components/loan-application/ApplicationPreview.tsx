import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AUTO_RESTRUCTURE_TEXT, PAYROLL_DEDUCTION_TEXT, installmentOf, termMonthsOf } from './applicationForm'
import type { Form } from './applicationForm'
import { api } from '../../lib/api'
import { employmentStatusLabel, loanTypeLabel } from '../../lib/applications'
import { formatPeso } from '../../lib/format'

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

const pesos = (s: string) => (s.trim() === '' ? '—' : formatPeso(Number(s) || 0))
const day = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-brand-200 pt-4 print:border-black">
      <h3 className="mb-3 text-sm font-bold tracking-wide text-brand-800 uppercase print:text-black">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'sm:col-span-2 print:col-span-2' : ''}`}>
      <dt className="text-xs text-brand-500 print:text-gray-600">{label}</dt>
      <dd className="border-b border-dotted border-brand-200 pb-1 font-medium break-words text-ink print:border-gray-500 print:text-black">{value || '—'}</dd>
    </div>
  )
}

const Grid = ({ children }: { children: ReactNode }) => (
  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 print:grid-cols-2">{children}</dl>
)

function SignatureLine({ title, name }: { title: string; name?: string }) {
  return (
    <div className="min-w-0 break-inside-avoid pt-8">
      <p className="min-h-5 text-center text-sm font-semibold break-words text-ink print:text-black">{name ?? ''}</p>
      <p className="border-t border-ink pt-1 text-center text-xs text-brand-600 print:border-black print:text-gray-700">{title}</p>
    </div>
  )
}

/** The co-makers' names, looked up from their member numbers (numbers alone when the lookup fails). */
function useCoMakerNames(ids: string[]) {
  const [names, setNames] = useState<Record<string, string>>({})
  const key = ids.join('|')
  useEffect(() => {
    let live = true
    for (const id of ids) {
      api<{ name: string }>(`/api/comaker/lookup?memberId=${encodeURIComponent(id)}`)
        .then((d) => live && setNames((n) => ({ ...n, [id]: d.name })))
        .catch(() => {})
    }
    return () => {
      live = false
    }
    // ids is rebuilt every render; key holds its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return names
}

/**
 * The application as it will be filed, laid out like UDEI's Mutual Assistance Application Form.
 * Shown before submitting, and printable (window.print shows only this part of the page).
 */
export default function ApplicationPreview({ form: f, documents, staffView, linked, applicationNo }: Props) {
  const inst = installmentOf(f)
  const term = termMonthsOf(f)
  const coMakers = [f.coMaker1, f.coMaker2].map((c) => c.trim()).filter(Boolean)
  const names = useCoMakerNames(coMakers)
  const fullName = [f.firstName.trim(), f.middleInitial.trim() ? `${f.middleInitial.trim().replace(/\.$/, '')}.` : '', f.lastName.trim()].filter(Boolean).join(' ')

  return (
    <article className="card min-w-0 space-y-5 p-5 sm:p-8 print:border-0 print:bg-white print:p-0 print:text-[10.5pt] print:shadow-none">
      <header className="text-center">
        <p className="text-lg font-bold text-brand-800 print:text-black">United DNSC Employees, Inc.</p>
        <p className="font-semibold text-ink print:text-black">Mutual Assistance Application Form</p>
        <p className="mt-1 text-xs text-brand-500 print:text-gray-700">
          {applicationNo ? `${applicationNo} · changes not yet saved` : 'Preview · not yet submitted'} · Dated {day(f.applicationDate)}
        </p>
      </header>

      <Section title="Applicant">
        <Grid>
          <Row label="Name (first, middle initial, last)" value={fullName} wide />
          <Row label="Member ID" value={f.memberId.trim() ? `${f.memberId.trim()}${linked ? '' : ' (not yet linked to a UDEI member number)'}` : 'Not a linked UDEI member'} />
          <Row label="Date of birth" value={f.dateOfBirth ? day(f.dateOfBirth) : '—'} />
          <Row label="Residence address" value={f.residenceAddress.trim()} wide />
          <Row label="Employer" value={f.employer.trim()} />
          <Row label="Employment status" value={employmentStatusLabel[f.employmentStatus]} />
          <Row label="Monthly salary" value={pesos(f.monthlySalary)} />
          <Row label="Net take-home pay" value={pesos(f.netTakeHomePay)} />
          <Row label="Years as member" value={f.yearsAsMember || '0'} />
          <Row label="Past loans / late payments" value={`${f.priorLoans || 0} / ${f.priorLatePayments || 0}`} />
        </Grid>
      </Section>

      <Section title="The loan">
        <Grid>
          <Row label="Loan type" value={loanTypeLabel[f.loanType]} />
          <Row label="Amount" value={pesos(f.amount)} />
          <Row label="Period" value={term ? `${term} month${term === 1 ? '' : 's'}` : '—'} />
          <Row label="Interest rate" value={`${f.monthlyRate}% per month`} />
          <Row label="Payroll deduction" value={f.paymentFrequency === 'quincenal' ? 'Quincenal (15th and 30th)' : 'Monthly'} />
          <Row
            label="Installment"
            value={inst ? `${formatPeso(Math.round(inst.monthly))} per month${f.paymentFrequency === 'quincenal' ? ` (${formatPeso(Math.round(inst.quincenal))} per quincena)` : ''}` : '—'}
          />
          <Row label="Reason for the loan" value={f.purpose.trim()} wide />
        </Grid>
      </Section>

      <Section title="Co-makers">
        {coMakers.length ? (
          <Grid>
            {coMakers.map((id, i) => (
              <Row key={id} label={i === 0 ? 'Co-maker' : 'Second co-maker'} value={names[id] ? `${names[id]} (member ${id})` : `Member ${id}`} />
            ))}
          </Grid>
        ) : (
          <p className="text-sm text-brand-600 print:text-black">None named.</p>
        )}
      </Section>

      <Section title="To be filled up by the Bookkeeper">
        {staffView ? (
          <Grid>
            <Row label="Long term balance" value={`${pesos(f.longTermBalance)}${f.longTermDueDate ? `, due ${day(f.longTermDueDate)}` : ''}`} />
            <Row label="Short term balance" value={`${pesos(f.shortTermBalance)}${f.shortTermDueDate ? `, due ${day(f.shortTermDueDate)}` : ''}`} />
            <Row label="Already deducted per month" value={pesos(f.monthlyPayment)} />
          </Grid>
        ) : (
          <Grid>
            <Row label="Long term balance / due date" value=" " />
            <Row label="Short term balance / due date" value=" " />
          </Grid>
        )}
      </Section>

      <Section title="Supporting documents">
        {documents.length ? (
          <ul className="space-y-1 text-sm">
            {documents.map((d, i) => (
              <li key={`${d.fileName}-${i}`} className="flex min-w-0 flex-wrap gap-x-2">
                <span className="font-medium text-ink print:text-black">{d.label}</span>
                <span className="min-w-0 break-all text-brand-600 print:text-gray-700">{d.fileName}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-600 print:text-black">None attached.</p>
        )}
      </Section>

      <Section title="Application agreement">
        <div className="space-y-2 text-sm text-ink print:text-black">
          <p><span aria-hidden="true">{f.payrollDeduction ? '☑' : '☐'}</span> {PAYROLL_DEDUCTION_TEXT}</p>
          <p><span aria-hidden="true">{f.autoRestructure ? '☑' : '☐'}</span> {AUTO_RESTRUCTURE_TEXT}</p>
        </div>
        <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2 print:grid-cols-2">
          <SignatureLine title="Signature of applicant over printed name" name={fullName} />
          {coMakers.map((id, i) => (
            <SignatureLine key={id} title={i === 0 ? 'Signature of co-maker' : 'Signature of second co-maker'} name={names[id] ?? `Member ${id}`} />
          ))}
        </div>
      </Section>

      <Section title="Approvals">
        <div className="grid grid-cols-2 gap-x-10 sm:grid-cols-4 print:grid-cols-4">
          <SignatureLine title="Bookkeeper" />
          <SignatureLine title="Treasurer" />
          <SignatureLine title="CreCom Chairman" />
          <SignatureLine title="President" />
        </div>
      </Section>
    </article>
  )
}
