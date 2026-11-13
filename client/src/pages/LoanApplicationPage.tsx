import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Send } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import AgreementSection from '../components/loan-application/AgreementSection'
import ApplicantSection from '../components/loan-application/ApplicantSection'
import BookkeeperSection from '../components/loan-application/BookkeeperSection'
import CoMakersSection from '../components/loan-application/CoMakersSection'
import DocumentsSection from '../components/loan-application/DocumentsSection'
import SubmittedCard from '../components/loan-application/SubmittedCard'
import { applicantOf, buildPayload, emptyForm, fromOwnRecord, rateFor, validateForm } from '../components/loan-application/applicationForm'
import type { Form, OwnRecord } from '../components/loan-application/applicationForm'
import { useMemberLedger } from '../components/loan-application/useMemberLedger'
import { useSupportingDocuments } from '../components/loan-application/useSupportingDocuments'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmContext'
import { api } from '../lib/api'
import { clearDraft, draftKey, loadDraft, saveDraft } from '../lib/drafts'
import { formatDateTime } from '../lib/format'
import { atLeast } from '../lib/roles'
import { fetchSettings, useSettings } from '../lib/settings'
import { loanTypeLabel } from '../lib/applications'
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
  const confirm = useConfirm()
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState<LoanApplication | null>(null)
  // Documents whose file couldn't be uploaded after filing (the checks were still saved).
  const [notUploaded, setNotUploaded] = useState<string[]>([])
  const { settings } = useSettings()

  // A linked member's form starts filled in from their UDEI record and last application.
  const [prefilled, setPrefilled] = useState<{ fromLast: string | null } | null>(null)
  // What was filled in, so an untouched filled-in form isn't kept as a draft.
  const [filledPatch, setFilledPatch] = useState<Partial<Form>>({})
  const fillFromRecord = () => {
    if (staffView || !ownMemberId) return
    api<OwnRecord>('/api/members/mine')
      .then((r) => {
        const patch = fromOwnRecord(r)
        if (!Object.keys(patch).length) return
        setForm((f) => ({ ...f, ...patch }))
        setFilledPatch(patch)
        setPrefilled({ fromLast: r.lastApplication?.filedAt ?? null })
      })
      .catch(() => {})
  }
  useEffect(() => {
    // A restored draft already holds what they typed.
    if (!restored) fillFromRecord()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The rate always comes from Loan Settings; it can't be typed.
  useEffect(() => {
    fetchSettings()
      .then((s) => setForm((f) => ({ ...f, monthlyRate: rateFor(s, f.loanType) })))
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
    const blank = JSON.stringify(form) === JSON.stringify({ ...freshForm(), ...filledPatch, applicationDate: form.applicationDate, monthlyRate: form.monthlyRate })
    if (blank) clearDraft(key)
    else saveDraft(key, form)
    // freshForm only depends on ownMemberId, which comes from the session like key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, form, submitted, filledPatch])

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setError('')
  }
  const ledger = useMemberLedger(staffView ? form.memberId : '', (books) => setForm((f) => ({ ...f, ...books })))

  const changeLoanType = (loanType: LoanType) => {
    setForm((f) => ({ ...f, loanType, monthlyRate: rateFor(settings, loanType) }))
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
    setSaving(true)
    try {
      const { application } = await api<{ application: LoanApplication }>('/api/applications', {
        method: 'POST',
        body: JSON.stringify(buildPayload(form, documents.payload())),
      })
      // Then the files themselves, so signers can open them next to the form.
      const failed: string[] = []
      const files = documents.files()
      for (let i = 0; i < files.length; i++) {
        const { file, hash } = files[i]
        if (!hash) continue // unreadable files were never fingerprinted
        try {
          await api(`/api/applications/${application._id}/documents/${i}`, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
        } catch {
          failed.push(file.name)
        }
      }
      setNotUploaded(failed)
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
    const name = [form.firstName, form.lastName].filter(Boolean).join(' ')
    const count = documents.payload().length
    void confirm({
      title: 'Submit this application?',
      message: (
        <>
          <p>
            {staffView ? <>Submit for <b>{name}</b>{form.memberId ? ` (member ${form.memberId})` : ''}: </> : 'Apply for '}
            <b>{loanTypeLabel[form.loanType]}</b> loan of <b>₱{Number(form.amount).toLocaleString('en-PH')}</b> over {form.period} {form.periodUnit},{' '}
            with {count ? `${count} supporting document${count === 1 ? '' : 's'}` : 'no supporting documents'}.
          </p>
          {documents.mismatched.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
              <p>These don’t match what was typed on the form:</p>
              <ul className="mt-1 list-disc pl-5">{documents.mismatched.map((d) => <li key={d.key} className="break-words">{d.file.name}</li>)}</ul>
              <p className="mt-1">Loan officers will see this on Pending Loans.</p>
            </div>
          )}
          <p>It then goes to the Bookkeeper, Treasurer, CreCom Chairman and President to sign. It can't be edited after this.</p>
        </>
      ),
      confirmLabel: documents.mismatched.length ? 'Submit anyway' : 'Yes, submit',
    }).then((ok) => {
      if (ok) void send()
    })
  }

  const reset = () => {
    documents.clear()
    clearDraft(key)
    setForm({ ...freshForm(), monthlyRate: rateFor(settings, 'long_term') })
    setError('')
    setRestoredNotice(false)
    setPrefilled(null)
    setFilledPatch({})
    setNotUploaded([])
    setSubmitted(null)
    fillFromRecord()
  }

  if (submitted) {
    return (
      <>
        {notUploaded.length > 0 && (
          <p className="mx-auto mb-4 max-w-xl rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
            The application was filed, but {notUploaded.length === 1 ? 'this file' : 'these files'} could not be uploaded: {notUploaded.join(', ')}.
            Their checks were saved; bring the originals to the UDEI office.
          </p>
        )}
        <SubmittedCard application={submitted} onNew={reset} staffView={staffView} />
      </>
    )
  }

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


  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-4xl min-w-0">
      <PageHeader
        title={staffView ? 'Loan Application' : 'Apply for a Loan'}
        subtitle="Mutual Assistance Application Form, United DNSC Employees, Inc. Supporting documents are read and checked against the form."
      />

      {prefilled && !restoredNotice && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:flex-row sm:items-center" role="status">
          <p className="flex-1">
            Filled in from your UDEI member record{prefilled.fromLast ? ` and your last application (${formatDateTime(prefilled.fromLast)})` : ''}.
            Check that everything is still correct, especially your salary and take-home pay.
          </p>
          <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setPrefilled(null)}>OK</button>
        </div>
      )}

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
        <CoMakersSection form={form} update={update} required={settings.coMakersRequired} />
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
    </form>
  )
}
