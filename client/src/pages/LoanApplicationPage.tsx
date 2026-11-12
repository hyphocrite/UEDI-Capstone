import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Send } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import AgreementSection from '../components/loan-application/AgreementSection'
import ApplicantSection from '../components/loan-application/ApplicantSection'
import BookkeeperSection from '../components/loan-application/BookkeeperSection'
import DocumentsSection from '../components/loan-application/DocumentsSection'
import SubmittedCard from '../components/loan-application/SubmittedCard'
import { applicantOf, buildPayload, emptyForm, rateFor, validateForm } from '../components/loan-application/applicationForm'
import type { Form } from '../components/loan-application/applicationForm'
import { useMemberLedger } from '../components/loan-application/useMemberLedger'
import { useSupportingDocuments } from '../components/loan-application/useSupportingDocuments'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { clearDraft, draftKey, loadDraft, saveDraft } from '../lib/drafts'
import { formatDateTime } from '../lib/format'
import { atLeast } from '../lib/roles'
import { fetchSettings, useSettings } from '../lib/settings'
import type { LoanApplication, LoanType } from '../lib/applications'

export default function LoanApplicationPage() {
  const { session } = useAuth()
  // Staff take in applications for anyone; a member applies for themselves under their linked member ID,
  // and the Bookkeeper fills that section when signing.
  const staffView = atLeast(session?.role, 'loan_officer')
  const ownMemberId = staffView ? '' : session?.memberId ?? ''
  const freshForm = () => ({ ...emptyForm(), memberId: ownMemberId })
  // What was typed is kept in this browser until it is sent, so a reload doesn't lose it.
  const key = draftKey('loanApplication', session?.id ?? 'anonymous')
  const [restored] = useState(() => loadDraft<Form>(key))
  const [restoredNotice, setRestoredNotice] = useState(!!restored)
  // A member's own ID always comes from their account, never from the draft.
  const [form, setForm] = useState<Form>(() => ({ ...freshForm(), ...restored?.values, ...(staffView ? {} : { memberId: ownMemberId }) }))
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState<LoanApplication | null>(null)
  const { settings } = useSettings()

  // Start from the rate on the Settings page once it arrives, unless someone already typed one.
  useEffect(() => {
    fetchSettings()
      .then((s) => setForm((f) => (f.rateEdited ? f : { ...f, monthlyRate: rateFor(s, f.loanType) })))
      .catch(() => {})
  }, [])

  const { lastName, firstName, middleInitial, residenceAddress, employer, monthlySalary, netTakeHomePay } = form
  const applicant = useMemo(
    () => applicantOf({ lastName, firstName, middleInitial, residenceAddress, employer, monthlySalary, netTakeHomePay }),
    [lastName, firstName, middleInitial, residenceAddress, employer, monthlySalary, netTakeHomePay],
  )
  const documents = useSupportingDocuments(applicant, form.loanType)

  useEffect(() => {
    if (submitted) return
    // Nothing typed yet (the date and the rate from Settings fill themselves in): don't keep a draft.
    const blank = JSON.stringify(form) === JSON.stringify({ ...freshForm(), applicationDate: form.applicationDate, monthlyRate: form.monthlyRate, rateEdited: form.rateEdited })
    if (blank) clearDraft(key)
    else saveDraft(key, form)
    // freshForm only depends on ownMemberId, which comes from the session like key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, form, submitted])

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setError('')
  }
  const ledger = useMemberLedger(staffView ? form.memberId : '', (books) => setForm((f) => ({ ...f, ...books })))

  const changeLoanType = (loanType: LoanType) => {
    setForm((f) => ({ ...f, loanType, monthlyRate: f.rateEdited ? f.monthlyRate : rateFor(settings, loanType) }))
    setError('')
    documents.changeLoanType(loanType)
  }

  const validate = () => {
    const problem = validateForm(form, settings)
    if (problem) return problem
    // Documents support the application but aren't required; wait only so an upload isn't lost mid-read.
    if (documents.reading) return 'Wait for all documents to finish reading.'
    return ''
  }

  const send = async () => {
    setConfirming(false)
    setSaving(true)
    try {
      const { application } = await api<{ application: LoanApplication }>('/api/applications', {
        method: 'POST',
        body: JSON.stringify(buildPayload(form, documents.payload())),
      })
      clearDraft(key)
      setSubmitted(application)
      window.scrollTo({ top: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the application.')
    } finally {
      setSaving(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const problem = validate()
    if (problem) return setError(problem)
    if (documents.mismatched.length) return setConfirming(true)
    void send()
  }

  const reset = () => {
    documents.clear()
    clearDraft(key)
    setForm({ ...freshForm(), monthlyRate: rateFor(settings, 'long_term') })
    setError('')
    setRestoredNotice(false)
    setSubmitted(null)
  }

  if (submitted) return <SubmittedCard application={submitted} onNew={reset} staffView={staffView} />

  if (!staffView && !ownMemberId) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Apply for a Loan" subtitle="Mutual Assistance Application Form, United DNSC Employees, Inc." />
        <p className="card p-5 text-sm text-amber-800">
          Your account isn't linked to a member record yet. Ask the UDEI office to link it, then you can apply here.
        </p>
      </div>
    )
  }

  const mismatchCount = documents.mismatched.length

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-4xl min-w-0">
      <PageHeader
        title={staffView ? 'Loan Application' : 'Apply for a Loan'}
        subtitle="Mutual Assistance Application Form, United DNSC Employees, Inc. Supporting documents are read and checked against the form."
      />

      {restoredNotice && restored && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:flex-row sm:items-center" role="status">
          <p className="flex-1">
            Restored the application you were filling in ({formatDateTime(restored.savedAt)}). Supporting documents
            aren't kept, so add them again.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setRestoredNotice(false)}>Keep going</button>
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={reset}>Start over</button>
          </div>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-6">
        <ApplicantSection form={form} update={update} lockedMemberId={staffView ? undefined : ownMemberId} />
        <AgreementSection form={form} update={update} onLoanTypeChange={changeLoanType} />
        {staffView && <BookkeeperSection form={form} update={update} ledger={ledger} />}
        <DocumentsSection loanType={form.loanType} documents={documents} />

        <section className="card min-w-0 p-4 sm:p-5">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-brand-500">
              {documents.reading
                ? 'Reading documents…'
                : staffView
                  ? 'Submitting sends the form and document checks to Pending Loans.'
                  : 'Submitting sends your application to UDEI for review.'}
            </p>
            <button type="submit" className="btn-accent px-5" disabled={saving}>
              <Send className="h-4 w-4" /> {saving ? 'Submitting…' : 'Submit application'}
            </button>
          </div>
        </section>
      </div>

      <Modal
        title={`Submit with ${mismatchCount} document${mismatchCount === 1 ? '' : 's'} that ${mismatchCount === 1 ? 'doesn’t' : 'don’t'} match?`}
        open={confirming}
        onClose={() => setConfirming(false)}
      >
        <p className="text-sm text-brand-700">These don’t match what was typed on the form:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
          {documents.mismatched.map((d) => (
            <li key={d.key} className="break-words">{d.file.name}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-brand-700">
          Loan officers will still see these documents and what didn’t match on Pending Loans.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>Go back</button>
          <button type="button" className="btn-primary" onClick={() => void send()}>Submit anyway</button>
        </div>
      </Modal>
    </form>
  )
}
