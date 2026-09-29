import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Circle, FileUp, Send, ShieldCheck, XCircle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import DocumentCard from '../components/loan-application/DocumentCard'
import type { UploadedDocument } from '../components/loan-application/DocumentCard'
import { members, requiredDocuments } from '../data/mock'
import { loadRates } from '../lib/interestRates'
import { formatPeso } from '../lib/format'
import { analyzeDocument } from '../lib/ocr/analyzeDocument'
import type { Applicant, DocumentAnalysis } from '../lib/ocr/analyzeDocument'
import { documentType } from '../lib/ocr/documentTypes'
import { sha256HexFromFile } from '../lib/ocr/fileHash'
import { ACCEPTED_FILES, extractText, isSupportedFile } from '../lib/ocr/textExtract'

type Form = {
  memberId: string
  fullName: string
  dateOfBirth: string
  monthlyIncome: string
  productId: string
  amount: string
  termMonths: string
  purpose: string
  coMakerName: string
}

const emptyForm: Form = {
  memberId: '',
  fullName: '',
  dateOfBirth: '',
  monthlyIncome: '',
  productId: 'regular',
  amount: '',
  termMonths: '12',
  purpose: '',
  coMakerName: '',
}

let keySeq = 0

function newApplicationId() {
  return `APP-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`
}

export default function LoanApplicationPage() {
  const [rates] = useState(loadRates)
  const [form, setForm] = useState<Form>(emptyForm)
  const [docs, setDocs] = useState<UploadedDocument[]>([])
  const [dragging, setDragging] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const docsRef = useRef(docs)
  useEffect(() => {
    docsRef.current = docs
  }, [docs])

  // Free image previews when leaving the page.
  useEffect(() => () => docsRef.current.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl)), [])

  const product = rates.find((r) => r.id === form.productId) ?? rates[0]
  const amount = Number(form.amount) || 0
  const term = Number(form.termMonths) || 0
  const income = Number(form.monthlyIncome) || 0
  const totalDue = amount * (1 + (product.annualRate / 100) * (term / 12))
  const monthly = term > 0 ? totalDue / term : 0
  const dti = income > 0 ? monthly / income : 0

  const applicant: Applicant = useMemo(
    () => ({ fullName: form.fullName, dateOfBirth: form.dateOfBirth, monthlyIncome: income }),
    [form.fullName, form.dateOfBirth, income],
  )

  // Re-check every document whenever the applicant's details change.
  const analyses = useMemo(() => {
    const map = new Map<string, DocumentAnalysis>()
    for (const d of docs) {
      if (d.status === 'done' && d.extracted) {
        map.set(
          d.key,
          analyzeDocument(d.extracted.text, applicant, {
            typeId: d.typeOverride ?? undefined,
            confidence: d.extracted.source === 'ocr' ? d.extracted.confidence : undefined,
          }),
        )
      }
    }
    return map
  }, [docs, applicant])

  const required = requiredDocuments[product.id] ?? []
  const checklist = required.map((typeId) => {
    const matches = docs.filter((d) => analyses.get(d.key)?.typeId === typeId)
    const best = matches.map((d) => analyses.get(d.key)!.verdict).sort((a, b) => rank(a) - rank(b))[0]
    return { typeId, verdict: best ?? null }
  })
  const missing = checklist.filter((c) => !c.verdict || c.verdict === 'unreadable')
  const flagged = docs.filter((d) => {
    const v = analyses.get(d.key)?.verdict
    return v === 'mismatch' || v === 'review' || d.status === 'error' || d.duplicateOf
  })
  const reading = docs.some((d) => d.status === 'reading')

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }))
    setError('')
  }

  const patchDoc = (key: string, patch: Partial<UploadedDocument>) =>
    setDocs((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)))

  const addFiles = (files: FileList | File[]) => {
    setError('')
    for (const file of Array.from(files)) {
      const key = `doc-${++keySeq}`
      const problem = isSupportedFile(file)
      const isImage = file.type.startsWith('image/')
      const doc: UploadedDocument = {
        key,
        file,
        previewUrl: isImage && !problem ? URL.createObjectURL(file) : null,
        hash: null,
        status: problem ? 'error' : 'reading',
        progress: 0,
        extracted: null,
        typeOverride: null,
        error: problem,
        duplicateOf: null,
      }
      setDocs((list) => [...list, doc])
      if (problem) continue

      sha256HexFromFile(file).then((hash) => {
        const dup = docsRef.current.find((d) => d.key !== key && d.hash === hash)
        patchDoc(key, { hash, duplicateOf: dup ? dup.file.name : null })
      })
      extractText(file, (p) => patchDoc(key, { progress: p }))
        .then((extracted) => patchDoc(key, { extracted, status: 'done', progress: 1 }))
        .catch((err: unknown) =>
          patchDoc(key, {
            status: 'error',
            error: `Could not read this file${err instanceof Error ? `: ${err.message}` : '.'}`,
          }),
        )
    }
  }

  const removeDoc = (key: string) => {
    setError('')
    setDocs((list) => {
      const d = list.find((x) => x.key === key)
      if (d?.previewUrl) URL.revokeObjectURL(d.previewUrl)
      return list.filter((x) => x.key !== key)
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  const validate = () => {
    if (form.fullName.trim().length < 2) return 'Enter the applicant’s full name.'
    if (!form.dateOfBirth) return 'Enter the applicant’s date of birth.'
    if (income <= 0) return 'Enter the applicant’s monthly income.'
    if (amount <= 0) return 'Enter the loan amount.'
    if (term < 1 || term > product.maxTermMonths) return `Term must be 1 to ${product.maxTermMonths} months for ${product.product}.`
    if (reading) return 'Wait for all documents to finish reading.'
    if (missing.length) return `Upload the missing documents: ${missing.map((m) => documentType(m.typeId).label).join(', ')}.`
    if (flagged.length && !acknowledged) return 'Review the flagged documents and tick the confirmation box.'
    return ''
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const problem = validate()
    if (problem) return setError(problem)
    setSubmitted(newApplicationId())
  }

  const reset = () => {
    docs.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl))
    setDocs([])
    setForm(emptyForm)
    setAcknowledged(false)
    setSubmitted(null)
  }

  if (submitted) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-accent" />
        <h1 className="mt-4 text-2xl font-bold text-brand-800">Application {submitted} received</h1>
        <p className="mt-2 text-brand-600">
          {form.fullName} applied for {formatPeso(amount)} ({product.product}, {term} months) with {docs.length} supporting
          document{docs.length === 1 ? '' : 's'}.
        </p>
        <p className="mt-2 text-xs text-brand-500">Sample only: applications are not saved to the database yet.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/loans" className="btn-ghost">Back to loans</Link>
          <button onClick={reset} className="btn-primary">New application</button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title="Loan Application"
        subtitle="Enter the applicant’s details and upload their supporting documents. Each document is read and checked automatically."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-4 font-semibold text-brand-800">Applicant</h2>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="memberId">Member</label>
                <select
                  id="memberId"
                  className="input"
                  value={form.memberId}
                  onChange={(e) => {
                    const m = members.find((x) => x.id === e.target.value)
                    update({ memberId: e.target.value, fullName: m ? m.name : form.fullName })
                  }}
                >
                  <option value="">New applicant (not yet a member)</option>
                  {members.filter((m) => m.status === 'Active').map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="fullName">Full name, as on their ID</label>
                <input id="fullName" className="input" value={form.fullName} onChange={(e) => update({ fullName: e.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="dob">Date of birth</label>
                  <input id="dob" type="date" className="input" value={form.dateOfBirth} onChange={(e) => update({ dateOfBirth: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="income">Monthly income (₱)</label>
                  <input id="income" type="number" min={0} className="input" value={form.monthlyIncome} onChange={(e) => update({ monthlyIncome: e.target.value })} />
                </div>
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-4 font-semibold text-brand-800">Loan</h2>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="product">Loan product</label>
                <select id="product" className="input" value={form.productId} onChange={(e) => update({ productId: e.target.value })}>
                  {rates.map((r) => <option key={r.id} value={r.id}>{r.product} ({r.annualRate}% a year)</option>)}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="amount">Amount (₱)</label>
                  <input id="amount" type="number" min={0} step={1000} className="input" value={form.amount} onChange={(e) => update({ amount: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="term">Term (months, max {product.maxTermMonths})</label>
                  <input id="term" type="number" min={1} max={product.maxTermMonths} className="input" value={form.termMonths} onChange={(e) => update({ termMonths: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="purpose">Purpose</label>
                <input id="purpose" className="input" value={form.purpose} onChange={(e) => update({ purpose: e.target.value })} placeholder="e.g. tuition, house repair" />
              </div>
              <div>
                <label className="label" htmlFor="coMaker">Co-maker (optional)</label>
                <input id="coMaker" className="input" value={form.coMakerName} onChange={(e) => update({ coMakerName: e.target.value })} />
              </div>

              <dl className="grid grid-cols-3 gap-2 rounded-lg bg-brand-50 p-3 text-center">
                <div>
                  <dt className="text-[11px] text-brand-600">Monthly payment</dt>
                  <dd className="font-bold text-brand-800">{formatPeso(Math.round(monthly))}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-brand-600">Total to repay</dt>
                  <dd className="font-bold text-brand-800">{formatPeso(Math.round(totalDue))}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-brand-600">Share of income</dt>
                  <dd className={`font-bold ${dti > 0.4 ? 'text-red-700' : 'text-brand-800'}`}>{income > 0 ? `${Math.round(dti * 100)}%` : '—'}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-1 font-semibold text-brand-800">Required for {product.product}</h2>
            <p className="mb-3 text-xs text-brand-500">Filled in as documents are recognized.</p>
            <ul className="space-y-2 text-sm">
              {checklist.map(({ typeId, verdict }) => (
                <li key={typeId} className="flex items-start gap-2">
                  {verdict === 'verified' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : verdict === 'mismatch' ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  ) : verdict === 'review' ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
                  )}
                  <span>
                    <span className="font-medium text-ink">{documentType(typeId).label}</span>
                    <span className="block text-xs text-brand-500">
                      {verdict === 'verified' ? 'Verified' : verdict === 'mismatch' ? 'Uploaded, has a mismatch' : verdict === 'review' ? 'Uploaded, needs review' : documentType(typeId).hint}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-4 lg:col-span-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`card flex flex-col items-center justify-center border-2 border-dashed px-6 py-10 text-center transition ${
              dragging ? 'border-accent bg-brand-50' : 'border-brand-200'
            }`}
          >
            <FileUp className="h-10 w-10 text-brand-400" />
            <p className="mt-3 font-semibold text-brand-800">Drop supporting documents here</p>
            <p className="mt-1 text-sm text-brand-600">
              IDs, birth certificate, payslips, payment slips, certificate of employment, bills or bank statements.
            </p>
            <p className="mt-1 text-xs text-brand-500">JPEG, PNG, WebP or PDF, up to 10 MB each. Files are read on this computer.</p>
            <button type="button" className="btn-primary mt-4" onClick={() => inputRef.current?.click()}>
              Choose files
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              className="hidden"
              data-testid="file-input"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {docs.length === 0 ? (
            <p className="py-6 text-center text-sm text-brand-500">No documents yet.</p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {docs.map((d) => (
                <DocumentCard
                  key={d.key}
                  doc={d}
                  analysis={analyses.get(d.key) ?? null}
                  onTypeChange={(t) => {
                    setError('')
                    patchDoc(d.key, { typeOverride: t })
                  }}
                  onRemove={() => removeDoc(d.key)}
                />
              ))}
            </div>
          )}

          <section className="card p-5">
            {flagged.length > 0 && (
              <label className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                <span>
                  {flagged.length} document{flagged.length === 1 ? ' is' : 's are'} flagged. I checked the originals and want to submit anyway.
                </span>
              </label>
            )}
            {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs text-brand-500">
                <ShieldCheck className="h-4 w-4 text-accent" /> Each file is sealed with a SHA-256 fingerprint.
              </p>
              <button type="submit" className="btn-accent px-5" disabled={reading}>
                <Send className="h-4 w-4" /> Submit application
              </button>
            </div>
          </section>
        </div>
      </div>
    </form>
  )
}

function rank(v: string) {
  return { verified: 0, review: 1, mismatch: 2, unreadable: 3 }[v] ?? 4
}

