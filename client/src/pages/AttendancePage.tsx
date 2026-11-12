import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarCheck, Plus, Search } from 'lucide-react'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import { useConfirm } from '../context/ConfirmContext'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import { byMemberId } from '../lib/members'
import type { Member } from '../lib/members'

type Kind = 'general_assembly' | 'pmes' | 'other'
type Meeting = { _id: string; title: string; kind: Kind; date: string; attendees: string[]; attendeeCount: number; recordedByName?: string }

const kindLabel: Record<Kind, string> = { general_assembly: 'Member meeting', pmes: 'PMES', other: 'Other' }

/**
 * Member meetings and PMES sessions, and who came. Attendance is part of the member score and an
 * early sign used by early warning.
 */
export default function AttendancePage() {
  const confirm = useConfirm()
  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () =>
    api<{ meetings: Meeting[] }>('/api/meetings')
      .then((d) => setMeetings(d.meetings))
      .catch((err: unknown) => setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not load meetings.' }))

  useEffect(() => {
    void load()
    api<{ members: Member[] }>('/api/members?status=active').then((d) => setMembers([...d.members].sort(byMemberId))).catch(() => setMembers([]))
  }, [])

  const selected = meetings?.find((m) => m._id === selectedId) ?? null
  const open = (m: Meeting) => {
    setSelectedId(m._id)
    setTicked(new Set(m.attendees))
    setMessage(null)
  }
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter((m) => !q || m.fullName.toLowerCase().includes(q) || m.memberId.toLowerCase().includes(q))
  }, [members, query])
  const changed = selected ? ticked.size !== selected.attendees.length || selected.attendees.some((a) => !ticked.has(a)) : false

  const save = async () => {
    if (!selected) return
    const ok = await confirm({
      title: 'Save the attendance?',
      message: <p><b>{ticked.size}</b> member{ticked.size === 1 ? '' : 's'} attended <b>{selected.title}</b> on {formatDate(selected.date)}. Attendance counts toward each member's score.</p>,
      confirmLabel: 'Yes, save',
    })
    if (!ok) return
    setSaving(true)
    try {
      await api(`/api/meetings/${selected._id}/attendance`, { method: 'PUT', body: JSON.stringify({ attendees: [...ticked] }) })
      await load()
      setMessage({ tone: 'ok', text: `Attendance saved for ${selected.title}.` })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save the attendance.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Member meetings and PMES sessions. Who attends is part of the member score."
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Record a meeting</button>}
      />
      {message && (
        <p className={`mb-4 rounded-lg px-4 py-3 text-sm ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
        <ul className="card h-fit min-w-0 divide-y divide-brand-50" aria-label="Meetings">
          {meetings?.map((m) => (
            <li key={m._id}>
              <button onClick={() => open(m)} className={`w-full px-4 py-3 text-left transition ${selectedId === m._id ? 'bg-brand-50' : 'hover:bg-brand-50/50'}`}>
                <p className="font-semibold text-ink">{m.title}</p>
                <p className="text-xs text-brand-500">{kindLabel[m.kind]} · {formatDate(m.date)} · {m.attendeeCount} attended</p>
              </button>
            </li>
          ))}
          {meetings && meetings.length === 0 && <li className="px-4 py-8 text-center text-sm text-brand-500">No meetings recorded yet.</li>}
        </ul>

        <section className="card min-w-0">
          {!selected ? (
            <p className="flex items-center gap-2 p-6 text-sm text-brand-500"><CalendarCheck className="h-5 w-5" /> Choose a meeting to tick who attended.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-brand-100 p-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-brand-800">{selected.title}</h2>
                  <p className="text-xs text-brand-500">{kindLabel[selected.kind]} · {formatDate(selected.date)} · {ticked.size} ticked</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-brand-400" />
                  <input className="input pl-9" placeholder="Search name or member no." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search members" />
                </div>
                <button className="btn-primary" disabled={!changed || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save attendance'}</button>
              </div>
              <ul className="grid max-h-[60vh] grid-cols-1 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((m) => (
                  <li key={m.memberId}>
                    <label className="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm hover:bg-brand-50/50">
                      <input type="checkbox" checked={ticked.has(m.memberId)}
                        onChange={(e) => setTicked((s) => { const n = new Set(s); if (e.target.checked) n.add(m.memberId); else n.delete(m.memberId); return n })} />
                      <span className="min-w-0 truncate">{m.fullName}{m.lastName ? <span className="text-brand-500"> · No. {m.memberId}</span> : ''}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {creating && <NewMeeting onClose={() => setCreating(false)} onSaved={(m) => { setCreating(false); void load().then(() => open(m)) }} />}
    </>
  )
}

function NewMeeting({ onClose, onSaved }: { onClose: () => void; onSaved: (m: Meeting) => void }) {
  const [form, setForm] = useState(() => ({ title: '', kind: 'general_assembly' as Kind, date: new Date().toLocaleDateString('en-CA') }))
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const { meeting } = await api<{ meeting: Meeting }>('/api/meetings', { method: 'POST', body: JSON.stringify(form) })
      onSaved(meeting)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the meeting.')
    }
  }
  return (
    <Modal title="Record a meeting" open onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div><label className="label" htmlFor="mt-title">Title</label>
          <input id="mt-title" className="input" maxLength={120} placeholder="e.g. 2026 General Assembly" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="mt-kind">Kind</label>
            <select id="mt-kind" className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
              {(Object.keys(kindLabel) as Kind[]).map((k) => <option key={k} value={k}>{kindLabel[k]}</option>)}
            </select></div>
          <div><label className="label" htmlFor="mt-date">Date</label>
            <input id="mt-date" type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">Record meeting</button>
        </div>
      </form>
    </Modal>
  )
}
