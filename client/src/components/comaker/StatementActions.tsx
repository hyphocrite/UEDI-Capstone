import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import HowItWorks from '../HowItWorks'
import { CheckCircle2, Printer, Upload } from 'lucide-react'
import { ApiError } from '../../lib/api'
import { coMakerFormPath } from '../../lib/applications'
import { formatDate } from '../../lib/format'

const BASE = import.meta.env.VITE_API_URL ?? ''
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

/**
 * On the Co-maker page: print your own Co-Maker's Statement, and upload it signed (photo or PDF).
 * For an applicant who isn't a UDEI member, the Treasurer's final signature waits for it.
 */
export default function StatementActions({ applicationId, memberId, uploadedAt, required, canUpload, onUploaded }: {
  applicationId: string
  memberId: string
  uploadedAt: string | null
  required: boolean
  canUpload: boolean
  onUploaded: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!ACCEPT.split(',').includes(file.type)) return setError('Upload a photo (JPEG, PNG, WebP) or a PDF.')
    if (file.size > 10 * 1024 * 1024) return setError('Files can be at most 10 MB.')
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${BASE}/api/comaker/requests/${applicationId}/statement?name=${encodeURIComponent(file.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
        credentials: 'include',
      })
      if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error || 'Could not upload the file.', res.status)
      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the file.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="mt-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={coMakerFormPath(applicationId, memberId)} className="btn-ghost px-2.5 py-1 text-xs"><Printer className="h-3.5 w-3.5" /> Print my co-maker's statement</Link>
        {canUpload && (
          <>
            <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={busy} onClick={() => input.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> {busy ? 'Uploading…' : uploadedAt ? 'Replace signed copy' : 'Upload signed copy'}
            </button>
            <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
          </>
        )}
      </div>
      <p className={`mt-1 ${uploadedAt ? 'flex items-center gap-1 text-emerald-700' : 'text-brand-500'}`}>
        {uploadedAt ? <><CheckCircle2 className="h-3.5 w-3.5" /> Signed copy uploaded {formatDate(uploadedAt)}.</> : 'Print, have it signed, upload the signed copy.'}
      </p>
      {!uploadedAt && (
        <HowItWorks className="mt-1">
          <p>
            Upload a photo or PDF of the signed statement.{' '}
            {required
              ? 'The borrower isn’t a UDEI member yet, so the mutual assistance can’t get its final signature until you upload it.'
              : 'For UDEI members it is optional.'}
          </p>
        </HowItWorks>
      )}
      {error && <p className="mt-1 text-red-700" role="alert">{error}</p>}
    </div>
  )
}
