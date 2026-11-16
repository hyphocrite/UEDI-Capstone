import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { MemberScoreView, MyScore, ScoreBand } from './api'
import { colors } from './theme'
import { Card, KuwiBox, MascotSays, s } from './ui'

// The member's own member score, as on the web Home (client/src/components/members/MyScoreCard.tsx).

export const BAND_LABEL: Record<ScoreBand, string> = { strong: 'Strong', good: 'Good', fair: 'Fair', weak: 'Weak', limited: 'Limited data' }
const BAND_STYLE: Record<ScoreBand, { bg: string; fg: string }> = {
  strong: { bg: '#D1FAE5', fg: '#065F46' },
  good: { bg: '#ECFDF5', fg: '#047857' },
  fair: { bg: '#FEF3C7', fg: '#92400E' },
  weak: { bg: '#FEE2E2', fg: '#991B1B' },
  limited: { bg: '#ECF7F1', fg: '#15613F' },
}

/** Kuwi's face for a band: happy when it's going well, worried when it's weak. */
export const moodForBand = (band: ScoreBand) => (band === 'strong' || band === 'good' ? 'happy' : band === 'weak' ? 'concerned' : 'neutral')

const limited = (v: MemberScoreView) => v.band === 'limited' || v.score === null

function BandPill({ band }: { band: ScoreBand }) {
  return (
    <View style={[s.badge, { backgroundColor: BAND_STYLE[band].bg }]}>
      <Text style={{ color: BAND_STYLE[band].fg, fontSize: 12, fontWeight: '700' }}>{BAND_LABEL[band]}</Text>
    </View>
  )
}

/** The score card. `compact` (Profile): score, band and the top tip. Full (Home): with "See how it's computed". */
export function ScoreCard({ data, compact = false }: { data: MyScore | null; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!data) return null
  if (!data.linked) {
    return (
      <Card>
        <Text style={s.sectionTitle}>Your member score</Text>
        <Text style={{ color: colors.muted }}>{"Your account isn't linked to your member record yet. The UDEI office links it; your score shows here after that."}</Text>
      </Card>
    )
  }
  const v = data.score
  return (
    <Card>
      <Text style={s.sectionTitle}>Your member score</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {limited(v) ? (
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>Not enough records yet</Text>
        ) : (
          <Text style={{ fontSize: compact ? 34 : 48, fontWeight: '800', color: colors.primary }}>
            {v.score}
            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.muted }}> / 100</Text>
          </Text>
        )}
        <BandPill band={v.band} />
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: '#D2ECDE', marginTop: 10, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${Math.round(v.coverage * 100)}%`, backgroundColor: colors.accent }} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Based on {Math.round(v.coverage * 100)}% of the possible data</Text>

      {compact ? (
        v.tips[0] ? <KuwiBox kind="tips" title="Kuwi recommends" items={[v.tips[0]]} /> : null
      ) : (
        <>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 10 }}>
            This score is from your savings, attendance, bills, co-maker record and repayment. It is not the credit score the signers see on an application.
          </Text>
          <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ marginTop: 10 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{open ? 'Hide how it\'s computed ▲' : 'See how it\'s computed ▼'}</Text>
          </Pressable>
          {open ? (
            <View style={{ marginTop: 8, gap: 10 }}>
              {v.parts.map((p) => (
                <View key={p.key}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{p.label} <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 12 }}>({p.weight}%)</Text></Text>
                    <Text style={{ color: colors.muted }}>{p.value === null ? 'No data' : `${Math.round(p.value * 100)} / 100`}</Text>
                  </View>
                  {p.value !== null ? (
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: '#D2ECDE', marginTop: 4, overflow: 'hidden' }}>
                      <View style={{ height: 5, width: `${Math.round(p.value * 100)}%`, backgroundColor: colors.accent }} />
                    </View>
                  ) : null}
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{p.detail}</Text>
                </View>
              ))}
              <Text style={{ color: colors.muted, fontSize: 11 }}>Parts with no data are left out instead of counting against you.</Text>
            </View>
          ) : null}
        </>
      )}
    </Card>
  )
}

/** Kuwi's card on Home: what's going well and how to raise the score. */
export function KuwiCard({ data }: { data: MyScore | null }) {
  if (!data?.linked || (!data.score.tips.length && !data.score.strengths.length)) return null
  return (
    <Card>
      <MascotSays mood={moodForBand(data.score.band)} title="Here's how you can raise your score">
        <KuwiBox kind="favor" title="Doing well" items={data.score.strengths} />
        <KuwiBox kind="tips" title="Kuwi recommends" items={data.score.tips} />
      </MascotSays>
    </Card>
  )
}
