// Supporting documents (payslip, ID…) on the phone: take a photo or choose a file for each one the
// office asks for, then send them to the application. The office checks them by eye.
import Ionicons from '@expo/vector-icons/Ionicons'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { api } from './api'
import type { AppDocument, Application, PickedFile } from './api'
import { colors } from './theme'
import { Button, ErrorText, s } from './ui'

// Kept in step with DOCUMENT_TYPES and REQUIRED_DOCUMENTS in client/src/lib/ocr/documentTypes.ts.
export const DOCUMENT_LABEL: Record<string, string> = {
  valid_id: 'Valid government ID',
  employee_id: 'DNSC employee ID',
  payslip: 'Latest payslip',
  certificate_of_employment: 'Certificate of employment',
  proof_of_address: 'Proof of address',
  application_form: 'Signed application form',
  other: 'Other document',
}
const REQUIRED: Record<string, string[]> = {
  long_term: ['valid_id', 'payslip', 'proof_of_address', 'application_form'],
  emergency: ['valid_id', 'payslip', 'application_form'],
}
export const requiredFor = (loanType: string) => REQUIRED[loanType] ?? REQUIRED.long_term

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024

/** The required types not covered yet by what was sent or picked. */
export function missingTypes(loanType: string, picked: PickedFile[], sent: AppDocument[] = []) {
  const have = new Set([...picked.map((f) => f.type), ...sent.filter((d) => d.uploaded).map((d) => d.type)])
  return requiredFor(loanType).filter((t) => !have.has(t))
}

async function pick(source: 'camera' | 'files', type: string): Promise<PickedFile | string | null> {
  if (source === 'camera') {
    const allowed = await ImagePicker.requestCameraPermissionsAsync()
    if (!allowed.granted) return 'Allow camera access in your phone settings to take a photo.'
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ['images'] })
    if (r.canceled || !r.assets[0]) return null
    const a = r.assets[0]
    if (a.fileSize && a.fileSize > MAX_BYTES) return 'That photo is over 10 MB. Try again a little farther away.'
    return { uri: a.uri, name: a.fileName || `${type}-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg', type }
  }
  const r = await DocumentPicker.getDocumentAsync({ type: ACCEPTED, copyToCacheDirectory: true })
  if (r.canceled || !r.assets[0]) return null
  const a = r.assets[0]
  const mimeType = a.mimeType || (/\.pdf$/i.test(a.name) ? 'application/pdf' : /\.png$/i.test(a.name) ? 'image/png' : 'image/jpeg')
  if (!ACCEPTED.includes(mimeType)) return 'Choose a JPEG, PNG, WebP or PDF file.'
  if (a.size && a.size > MAX_BYTES) return 'Files can be at most 10 MB.'
  return { uri: a.uri, name: a.name, mimeType, type }
}

/** Sends each file in turn. Returns the names that failed. */
export async function sendAll(applicationId: string, files: PickedFile[]) {
  const failed: string[] = []
  for (const f of files) {
    try {
      await api.uploadDocument(applicationId, f)
    } catch {
      failed.push(f.name)
    }
  }
  return failed
}

/**
 * One row per document the office asks for, plus "Other document". Each row takes a photo or a file.
 * `sent` are the ones already on the application, shown as done.
 */
export function DocumentSlots({ loanType, files, onChange, sent = [] }: { loanType: string; files: PickedFile[]; onChange: (f: PickedFile[]) => void; sent?: AppDocument[] }) {
  const [error, setError] = useState<string | null>(null)
  const add = async (source: 'camera' | 'files', type: string) => {
    setError(null)
    try {
      const r = await pick(source, type)
      if (typeof r === 'string') setError(r)
      else if (r) onChange([...files, r])
    } catch {
      setError("Couldn't open the camera or files. Try again.")
    }
  }
  const remove = (i: number) => onChange(files.filter((_, j) => j !== i))
  const types = [...requiredFor(loanType), 'other']

  return (
    <View>
      {types.map((type) => {
        const done = sent.filter((d) => d.type === type)
        const mine = files.map((f, i) => ({ f, i })).filter(({ f }) => f.type === type)
        const required = type !== 'other'
        const has = done.length + mine.length > 0
        return (
          <View key={type} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons
                name={has ? 'checkmark-circle' : required ? 'ellipse-outline' : 'add-circle-outline'}
                size={20}
                color={has ? colors.accent : colors.muted}
              />
              <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{DOCUMENT_LABEL[type]}</Text>
              <IconButton icon="camera-outline" label={`Take a photo of your ${DOCUMENT_LABEL[type].toLowerCase()}`} onPress={() => add('camera', type)} />
              <IconButton icon="folder-open-outline" label={`Choose a file for your ${DOCUMENT_LABEL[type].toLowerCase()}`} onPress={() => add('files', type)} />
            </View>
            {done.map((d, i) => (
              <Text key={`sent-${i}`} style={{ color: colors.muted, fontSize: 13, marginLeft: 28, marginTop: 4 }} numberOfLines={1}>
                Sent · {d.fileName}
              </Text>
            ))}
            {mine.map(({ f, i }) => (
              <View key={`${f.uri}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 28, marginTop: 4 }}>
                <Text style={{ flex: 1, color: colors.text, fontSize: 13 }} numberOfLines={1}>{f.name}</Text>
                <Pressable onPress={() => remove(i)} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} hitSlop={8}>
                  <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )
      })}
      <ErrorText text={error} />
    </View>
  )
}

function IconButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({ padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.accentSoft : colors.card })}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
    </Pressable>
  )
}

/** On a pending application in My loans: what was sent, and a way to add more until it is decided. */
export function ApplicationDocuments({ app, onSent }: { app: Application; onSent: () => void }) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<PickedFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sent = app.documents ?? []
  const missing = missingTypes(app.loan.loanType, [], sent)

  const send = async () => {
    setBusy(true)
    setError(null)
    const failed = await sendAll(app.id, files)
    setBusy(false)
    if (failed.length) {
      setFiles(files.filter((f) => failed.includes(f.name)))
      setError(`Couldn't send ${failed.join(', ')}. Check your connection and try again.`)
    } else {
      setFiles([])
      setOpen(false)
    }
    onSent()
  }

  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
      <Text style={[s.label, { marginBottom: 2 }]}>Supporting documents</Text>
      <Text style={{ color: missing.length ? colors.warn : colors.muted, fontSize: 13 }}>
        {sent.length === 0 ? 'None sent yet.' : `${sent.length} sent.`}
        {missing.length ? ` Still needed: ${missing.map((t) => DOCUMENT_LABEL[t]).join(', ')}.` : ''}
      </Text>
      {app.status !== 'pending' ? null : open ? (
        <View style={{ marginTop: 8 }}>
          <DocumentSlots loanType={app.loan.loanType} files={files} onChange={setFiles} sent={sent} />
          <ErrorText text={error} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="outline" onPress={() => { setFiles([]); setOpen(false) }} disabled={busy} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title={files.length > 1 ? `Send ${files.length} files` : 'Send'} onPress={send} loading={busy} disabled={files.length === 0} />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 8 }}>
          <Button title="Add documents" variant="outline" onPress={() => setOpen(true)} />
        </View>
      )}
    </View>
  )
}
