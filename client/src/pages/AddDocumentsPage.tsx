import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Paperclip, Upload } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import AttachedDocuments from '../components/loan-application/AttachedDocuments'
import DocumentsSection from '../components/loan-application/DocumentsSection'
import { addDocuments } from '../components/loan-application/addDocuments'
import { applicantOf, emptyForm, formFromApplication } from '../components/loan-application/applicationForm'
import { useSupportingDocuments } from '../components/loan-application/useSupportingDocuments'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { canAddDocuments, loanTypeLabel } from '../lib/applications'
import type { LoanApplication } from '../lib/applications'
import { formatPeso } from '../lib/format'
import { roleLabel } from '../lib/roles'

/**
 * /loans/applications/:id/documents: the person who filed an application adds supporting documents
 * to it, until it is decided (after signatures too). Each one is read and checked against the form,
 * as when filing.
 */
export default function AddDocumentsPage() {
  const { id } = useParams()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [app, setApp] = useState<LoanApplication | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<{ application: LoanApplication }>(`/api/applications/${id}`)
      .then(({ application }) => setApp(application))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the application.'))
  }, [id])

  // Documents are checked against what is on the application.
  const form = useMemo(() => (app ? formFromApplication(app) : null), [app])
  const applicant = useMemo(() => applicantOf(form ?? emptyForm()), [form])
  const documents = useSupportingDocuments(applicant, app?.loan.loanType ?? 'long_term')

  const save = async () => {
    if (!app) return
    if (documents.reading) return setError('Wait for all documents to finish reading.')
    const payload = documents.payload()
    if (!payload.length) return setError('Add at least one document first.')
    setSaving(true)
    setError('')
    try {
      const { failed } = await addDocuments(app._id, payload, documents.files())
      navigate('/loans', {
        state: {
          notice: `Added ${payload.length} document${payload.length === 1 ? '' : 's'} to ${app.applicationNo}.${failed.length ? ` These files could not be uploaded: ${failed.join(', ')}.` : ''}`,
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the documents.')
    } finally {
      setSaving(false)
    }
  }

  if (!app) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader icon={Paperclip} title="Add supporting documents" subtitle="Loading…" />
        {error ? <p className="card p-5 text-sm text-red-700" role="alert">{error}</p> : <p className="py-10 text-center text-sm text-brand-500">Loading the application…</p>}
      </div>
    )
  }

  if (!canAddDocuments(app, session?.id)) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader icon={Paperclip} title="Add supporting documents" subtitle={app.applicationNo} />
        <div className="card space-y-3 p-5 text-sm">
          <p className="text-amber-800">
            {app.status !== 'pending' ? `This application was already ${app.status}, so documents can't be added.` : 'Only the person who filed this application can add documents to it.'}
          </p>
          <Link to="/loans" className="btn-ghost">Back to my mutual assistance</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl min-w-0">
      <PageHeader icon={Paperclip}
        title="Add supporting documents"
        subtitle={`${app.applicationNo} · ${formatPeso(app.loan.amount)} ${loanTypeLabel[app.loan.loanType]}. You can add documents until the application is decided.`}
      />
      {app.approvals.length > 0 && (
        <p className="mb-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900" role="status">
          {app.approvals.length} of 4 signed, now with the {app.currentStep !== 'none' ? roleLabel[app.currentStep] : 'signers'}. The signers see the new documents marked as added later.
        </p>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-6">
        <AttachedDocuments documents={app.documents} />
        <DocumentsSection loanType={app.loan.loanType} documents={documents} />
        <section className="card min-w-0 p-4 sm:p-5">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-brand-500">{documents.reading ? 'Reading documents…' : `${documents.payload().length} new document${documents.payload().length === 1 ? '' : 's'} to add.`}</p>
            <div className="flex gap-2">
              <Link to="/loans" className="btn-ghost">Cancel</Link>
              <button type="button" className="btn-accent px-5" disabled={saving} onClick={() => void save()}>
                <Upload className="h-4 w-4" /> {saving ? 'Adding…' : 'Add documents'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
