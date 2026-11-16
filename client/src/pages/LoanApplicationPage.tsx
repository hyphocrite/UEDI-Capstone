import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, FilePlus2, Pencil, Printer, Save, Send } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import AgreementSection from '../components/loan-application/AgreementSection'
import ApplicationPreview from '../components/loan-application/ApplicationPreview'
import type { PreviewDocument } from '../components/loan-application/ApplicationPreview'
import ApplicantSection from '../components/loan-application/ApplicantSection'
import AttachedDocuments from '../components/loan-application/AttachedDocuments'
import BookkeeperSection from '../components/loan-application/BookkeeperSection'
import CoMakersSection from '../components/loan-application/CoMakersSection'
import DocumentsSection from '../components/loan-application/DocumentsSection'
import SubmittedCard from '../components/loan-application/SubmittedCard'
import { addDocuments, uploadFiles } from '../components/loan-application/addDocuments'
import { FORM_STEPS, applicantOf, buildPayload, emptyForm, formFromApplication, fromOwnRecord, rateFor, termMonthsOf, validateStep } from '../components/loan-application/applicationForm'
import type { Form, FormStep, OwnRecord } from '../components/loan-application/applicationForm'
import { useMemberLedger } from '../components/loan-application/useMemberLedger'
import { useSupportingDocuments } from '../components/loan-application/useSupportingDocuments'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { clearDraft, draftKey, loadDraft, saveDraft } from '../lib/drafts'
import { formatDateTime } from '../lib/format'
import { atLeast } from '../lib/roles'
import { coMakersRequiredFor, fetchSettings, isLinkedMemberId, nonMemberLimit, useSettings } from '../lib/settings'
import { documentType } from '../lib/ocr/documentTypes'
import type { DocumentTypeId } from '../lib/ocr/documentTypes'
import { canAddDocuments, canChange } from '../lib/applications'
import type { LoanApplication, LoanType } from '../lib/applications'

export default function LoanApplicationPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  // /loans/applications/:id/edit: the person who filed it changes it, until the Bookkeeper signs.
  const { id: editId } = useParams()
  const [original, setOriginal] = useState<LoanApplication | null>(null)
  const [closedReason, setClosedReason] = useState('')
  // Staff take in applications for anyone; a member applies for themselves under their linked member ID,
  // and the Bookkeeper fills that section when signing.
  const staffView = atLeast(session?.role, 'loan_officer')
  const ownMemberId = staffView ? '' : session?.memberId ?? ''
  const freshForm = () => ({ ...emptyForm(), memberId: ownMemberId })
  // What was typed is kept in this browser until it is sent, so a reload doesn't lose it (new applications only).
  const key = draftKey('loanApplication', session?.id ?? 'anonymous')
  const [restored] = useState(() => (editId ? null : loadDraft<Form>(key)))
  const [restoredNotice, setRestoredNotice] = useState(!!restored)
  // A member's own ID always comes from their account, never from the draft.
  const [form, setForm] = useState<Form>(() => ({ ...freshForm(), ...restored?.values, ...(staffView ? {} : { memberId: ownMemberId }) }))
  const [error, setError] = useState('')
  // The form is filled in page by page; the last page previews the whole form before it is sent.
  const [step, setStep] = useState<FormStep>('applicant')
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
    if (editId) {
      api<{ application: LoanApplication }>(`/api/applications/${editId}`)
        .then(({ application }) => {
          if (!canChange(application, session?.id)) {
            setClosedReason(
              application.status !== 'pending'
                ? `This application was already ${application.status}.`
                : application.submittedBy !== session?.id
                  ? 'Only the person who filed this application can change it.'
                  : "The Bookkeeper already signed this application, so it can't be changed any more. You can still add supporting documents.",
            )
          }
          setOriginal(application)
          setForm(formFromApplication(application))
        })
        .catch((err: unknown) => setClosedReason(err instanceof Error ? err.message : 'Could not load the application.'))
      return
    }
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
    if (submitted || editId) return
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

  // A full UDEI member number. Others (no number, or only the N-… ID from sign-up) borrow at most
  // the non-member limit and need a member as co-maker. The server also checks the number is on record.
  const linked = isLinkedMemberId(form.memberId)

  /** Supporting documents are required: each type for the loan type, uploaded now or (when changing a filed application) already attached. */
  const documentsProblem = () => {
    if (documents.reading) return 'Wait for all documents to finish reading.'
    const attached = new Set((original?.documents ?? []).map((d) => d.type))
    const missing = documents.checklist.filter((c) => !c.filled && !attached.has(c.typeId))
    if (missing.length) return `Supporting documents are required. Still missing: ${missing.map((c) => documentType(c.typeId).label).join(', ')}.`
    return ''
  }
  const problemAt = (s: FormStep) => (s === 'documents' ? documentsProblem() : validateStep(s, form, settings, linked))

  /**
   * Moves to a page of the form. Every page before it must be filled in correctly; otherwise it stops
   * at the first page with a problem and shows it. Returns whether it got there.
   */
  const goTo = (target: FormStep) => {
    const upTo = FORM_STEPS.indexOf(target)
    for (const s of FORM_STEPS.slice(0, upTo)) {
      const problem = problemAt(s)
      if (problem) {
        setStep(s)
        setError(problem)
        window.scrollTo({ top: 0 })
        return false
      }
    }
    setStep(target)
    setError('')
    window.scrollTo({ top: 0 })
    return true
  }
  const stepIndex = FORM_STEPS.indexOf(step)
  const next = () => goTo(FORM_STEPS[Math.min(stepIndex + 1, FORM_STEPS.length - 1)])
  const back = (to: FormStep = FORM_STEPS[Math.max(stepIndex - 1, 0)]) => {
    setStep(to)
    setError('')
    window.scrollTo({ top: 0 })
  }

  /** What the preview lists: documents already on the application, then the ones being added. */
  const previewDocuments = (): PreviewDocument[] => {
    const label = (type?: string) => (type ? documentType(type as DocumentTypeId)?.label ?? type : 'Document')
    return [
      ...(original?.documents ?? []).map((d) => ({ label: label(d.type), fileName: d.fileName })),
      ...documents.payload().map((d) => ({ label: label(d.type), fileName: d.fileName })),
    ]
  }

  /** Saves changes to a filed application, then adds any new documents. */
  const saveChanges = async (app: LoanApplication) => {
    setSaving(true)
    try {
      const { application } = await api<{ application: LoanApplication }>(`/api/applications/${app._id}`, {
        method: 'PUT',
        body: JSON.stringify(buildPayload(form, [])),
      })
      const payload = documents.payload()
      const failed = payload.length ? (await addDocuments(application._id, payload, documents.files())).failed : []
      navigate('/loans', {
        state: {
          notice: `Your changes to ${application.applicationNo} were saved.${failed.length ? ` These files could not be uploaded: ${failed.join(', ')}.` : ''}`,
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the changes.')
    } finally {
      setSaving(false)
    }
  }

  const send = async () => {
    if (original) return saveChanges(original)
    setSaving(true)
    try {
      const { application } = await api<{ application: LoanApplication }>('/api/applications', {
        method: 'POST',
        body: JSON.stringify(buildPayload(form, documents.payload())),
      })
      // Then the files themselves, so signers can open them next to the form.
      const files = documents.files()
      const failed = await uploadFiles(application._id, files, files.map((_, i) => i))
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

  // Enter in a field moves to the next page; only the Review page sends.
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (step !== 'review') return void next()
    // Checks every page again, in case something was changed after it was passed.
    if (goTo('review')) void send()
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
    setStep('applicant')
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

  if (editId && (closedReason || !original)) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader icon={Pencil} title="Change your application" subtitle={original?.applicationNo ?? 'Loading…'} />
        {closedReason ? (
          <div className="card space-y-3 p-5 text-sm">
            <p className="text-amber-800">{closedReason}</p>
            <div className="flex flex-wrap gap-2">
              {original && canAddDocuments(original, session?.id) && (
                <Link to={`/loans/applications/${original._id}/documents`} className="btn-primary"><FilePlus2 className="h-4 w-4" /> Add supporting documents</Link>
              )}
              <Link to="/loans" className="btn-ghost">Back to my loans</Link>
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-brand-500">Loading the application…</p>
        )}
      </div>
    )
  }

  if (!staffView && !ownMemberId) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader icon={FilePlus2} title="Apply for a Loan" subtitle="Mutual Assistance Application Form, United DNSC Employees, Inc." />
        <p className="card p-5 text-sm text-amber-800">
          Your account isn't linked to a member record yet. Ask the UDEI office to link it, then you can apply here.
        </p>
      </div>
    )
  }

  const stepLabels: Record<FormStep, string> = {
    applicant: 'Applicant',
    loan: 'Loan',
    coMakers: staffView ? 'Co-makers & books' : 'Co-makers',
    documents: 'Documents',
    review: 'Review',
  }
  const loanChanged = !!original && (Number(form.amount) !== original.loan.amount || form.loanType !== original.loan.loanType ||
    termMonthsOf(form) !== original.loan.termMonths || form.paymentFrequency !== original.loan.paymentFrequency)
  const onPage = (s: FormStep) => (step === s ? '' : 'hidden')

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-4xl min-w-0">
      <div className="print:hidden">
        {original ? (
          <PageHeader icon={Pencil}
            title="Change your application"
            subtitle={`${original.applicationNo}, filed ${formatDateTime(original.createdAt)}. You can change it until the Bookkeeper signs.`}
          />
        ) : (
          <PageHeader icon={FilePlus2}
            title={staffView ? 'Loan Application' : 'Apply for a Loan'}
            subtitle="Mutual Assistance Application Form, United DNSC Employees, Inc. Supporting documents are read and checked against the form."
          />
        )}

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
              aren’t kept, so add them again.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setRestoredNotice(false)}>Keep going</button>
              <button type="button" className="btn-ghost px-3 py-1.5" onClick={reset}>Start over</button>
            </div>
          </div>
        )}

        {/* Where the applicant is in the form. Earlier pages open straight away; later ones once the pages before are filled in. */}
        <ol className="mb-5 flex min-w-0 gap-1 sm:gap-2" aria-label="Form pages">
          {FORM_STEPS.map((s, i) => {
            const done = i < stepIndex
            const current = s === step
            return (
              <li key={s} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => (done ? back(s) : goTo(s))}
                  aria-current={current ? 'step' : undefined}
                  className={`flex w-full min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs font-medium transition sm:flex-row sm:justify-center sm:gap-2 sm:text-sm ${
                    current ? 'bg-brand-800 text-white' : done ? 'bg-brand-50 text-brand-800 hover:bg-brand-100' : 'text-brand-500 hover:bg-brand-50'
                  }`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${current ? 'bg-white text-brand-800' : done ? 'bg-accent text-white' : 'border border-brand-300'}`}>
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="max-w-full truncate">{stepLabels[s]}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6">
        {/* The pages stay mounted while hidden, so lookups and files aren't lost when going back and forth. */}
        <div className={onPage('applicant')}>
          <ApplicantSection form={form} update={update} lockedMemberId={original ? form.memberId : staffView ? undefined : ownMemberId} />
        </div>
        <div className={onPage('loan')}>
          <AgreementSection form={form} update={update} onLoanTypeChange={changeLoanType} linked={linked} />
        </div>
        <div className={`grid min-w-0 grid-cols-1 gap-6 ${onPage('coMakers')}`}>
          <CoMakersSection form={form} update={update} required={coMakersRequiredFor(settings, Number(form.amount) || 0, linked)} perLoan={settings.coMakersRequired} fromAmount={settings.coMakersFromAmount} nonMemberLimit={nonMemberLimit(settings, linked)} />
          {staffView && <BookkeeperSection form={form} update={update} ledger={ledger} />}
        </div>
        <div className={`grid min-w-0 grid-cols-1 gap-6 ${onPage('documents')}`}>
          {original && <AttachedDocuments documents={original.documents} />}
          <DocumentsSection loanType={form.loanType} documents={documents} />
        </div>
        {step === 'review' && (
          <div className="grid min-w-0 grid-cols-1 gap-4">
            <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900 print:hidden" role="status">
              <p>
                Check the form below: this is how it will be {original ? 'saved' : 'filed'}. Go back to any page to change something,
                or print a copy for your records.
              </p>
              {loanChanged && (original?.coMakers?.length ?? 0) > 0 && (
                <p className="mt-1">Your co-makers will be asked to confirm again, because the loan changed.</p>
              )}
            </div>
            {documents.mismatched.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
                <p>These documents don’t match what was typed on the form:</p>
                <ul className="mt-1 list-disc pl-5">{documents.mismatched.map((d) => <li key={d.key} className="break-words">{d.file.name}</li>)}</ul>
                <p className="mt-1">Loan officers will see this on Pending Loans.</p>
              </div>
            )}
            <ApplicationPreview form={form} documents={previewDocuments()} staffView={staffView} linked={linked} applicationNo={original?.applicationNo} />
          </div>
        )}

        <section className="card min-w-0 p-4 sm:p-5 print:hidden">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-brand-500">
              {documents.reading
                ? 'Reading documents…'
                : step !== 'review'
                  ? `Page ${stepIndex + 1} of ${FORM_STEPS.length}.`
                  : original
                    ? 'Saving replaces the form; documents already attached stay, and new ones are added.'
                    : staffView
                      ? 'Submitting sends the form and document checks to Pending Loans.'
                      : 'Submitting sends your application to UDEI. The Bookkeeper, Treasurer, CreCom Chairman and President then sign it.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {original && <Link to="/loans" className="btn-ghost">Cancel</Link>}
              {stepIndex > 0 && (
                <button type="button" className="btn-ghost" onClick={() => back()} disabled={saving}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              )}
              {step === 'review' ? (
                <>
                  <button type="button" className="btn-ghost" onClick={() => window.print()}>
                    <Printer className="h-4 w-4" /> Print
                  </button>
                  <button type="submit" className="btn-accent px-5" disabled={saving}>
                    {original ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                    {saving ? (original ? 'Saving…' : 'Submitting…') : original ? 'Save changes' : documents.mismatched.length ? 'Submit anyway' : 'Submit application'}
                  </button>
                </>
              ) : (
                <button type="submit" className="btn-primary px-5">
                  {step === 'documents' ? 'Review' : 'Next'} <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </form>
  )
}
