// Connection check (More > About): the last calls to the server and the screens' load steps, live.
// For support: a screenshot shows which call is still waiting. Kept in memory only (src/lib/net.ts).
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Header, Row, Screen, Section, Txt } from '../../components/ui';
import { appStartedAt, networkTrace, onTraceChange, type TraceEntry } from '../../lib/net';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';

const clock = (ms: number) => {
  const d = new Date(ms + 3 * 3600e3); // Kuwait time (UTC+3)
  return d.toISOString().slice(11, 19);
};

export default function Diagnostics() {
  const { t, c } = useSettings();
  const [, tick] = useState(0);
  useEffect(() => {
    const off = onTraceChange(() => tick((n) => n + 1));
    const id = setInterval(() => tick((n) => n + 1), 1000); // waiting times keep counting
    return () => {
      off();
      clearInterval(id);
    };
  }, []);
  const rows = networkTrace();
  const now = Date.now();
  const waiting = rows.filter((r) => r.result == null).length;

  return (
    <>
      <Header title={t('diag_title')} back />
      <Screen>
        <Txt tone="muted">{t('diag_hint')}</Txt>
        <Section title={t('diag_summary')}>
          <Card>
            <Txt numeric>{`${t('diag_started')}: ${clock(appStartedAt)}`}</Txt>
            <Txt numeric>{`${t('diag_now')}: ${clock(now)}`}</Txt>
            <Txt numeric weight="bold" tone={waiting ? 'danger' : 'default'}>{`${t('diag_waiting')}: ${waiting}`}</Txt>
          </Card>
        </Section>
        <Section title={t('diag_calls')}>
          <Card padded={false}>
            {rows.length === 0 ? (
              <View style={{ padding: space.lg }}>
                <Txt tone="muted">{t('diag_empty')}</Txt>
              </View>
            ) : (
              rows.map((r, i) => <TraceRow key={r.id} r={r} now={now} last={i === rows.length - 1} line={c.line} />)
            )}
          </Card>
        </Section>
      </Screen>
    </>
  );
}

function TraceRow({ r, now, last, line }: { r: TraceEntry; now: number; last: boolean; line: string }) {
  const pending = r.result == null;
  const ms = pending ? now - r.at : (r.ms ?? 0);
  const bad = pending ? ms > 5000 : r.result !== 'ok' && !/^(2\d\d|ok|skipped)/.test(r.result ?? '');
  return (
    <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: line }}>
      <Row gap={space.sm} align="center">
        <Txt variant="label" tone="muted" numeric>{clock(r.at)}</Txt>
        <Txt variant="label" numeric weight={bad ? 'bold' : undefined} tone={bad ? 'danger' : 'default'}>
          {pending ? `… ${Math.round(ms / 1000)}s` : `${r.result} · ${ms}ms`}
        </Txt>
      </Row>
      <Txt variant="label" numberOfLines={2} style={{ writingDirection: 'ltr', textAlign: 'left' }}>{r.label}</Txt>
    </View>
  );
}
