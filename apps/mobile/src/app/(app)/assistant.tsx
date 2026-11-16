// "Ask Sanad" (PRD 18.1-18.2): the question box as a chat. Answers are built on the phone from the
// signed-in employee's own dashboard only (answerQuestion), no AI and no other employee's data.
// Optional param `month` (YYYY-MM) answers about that bonus period instead of the current one.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatBubble, ChatInput } from '../../components/dash/Chat';
import { Button, Chip, Header, Row, Screen } from '../../components/ui';
import { loadDashboard } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { answerQuestion, MONTH_RE, type DashboardData } from '../../sanad/dashboard';

type Msg = { id: number; mine: boolean; text: string; leave?: boolean };

const QUICK = ['dash_q_bonus', 'dash_q_deduction', 'dash_q_late', 'assistant_q_leave', 'asst_q_absence'];

export default function AssistantScreen() {
  const { t, c, lang } = useSettings();
  const { profile } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ month?: string }>();
  const month = typeof params.month === 'string' && MONTH_RE.test(params.month) ? params.month : null;

  const firstName = ((lang === 'ar' ? profile?.nameAr : profile?.nameEn) ?? '').trim().split(/\s+/)[0] ?? '';
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ id: 0, mine: false, text: t('asst_hello', { name: firstName }) }]);
  const data = useRef<DashboardData | null>(null);
  const failed = useRef(false);
  const nextId = useRef(1);
  const list = useRef<FlatList<Msg>>(null);

  const fetchData = useCallback(() => {
    failed.current = false;
    loadDashboard(null, month)
      .then((d) => { data.current = d; })
      .catch(() => { failed.current = true; });
  }, [month]);
  useEffect(fetchData, [fetchData]);

  // The greeting follows a language switch while it is the only message.
  useEffect(() => {
    setMsgs((m) => (m.length === 1 ? [{ id: 0, mine: false, text: t('asst_hello', { name: firstName }) }] : m));
  }, [t, firstName]);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    const d = data.current;
    let reply: Msg;
    if (!d) {
      reply = { id: nextId.current + 1, mine: false, text: t(failed.current ? 'dash_error_generic' : 'assistant_loading') };
      if (failed.current) fetchData();
    } else {
      const a = answerQuestion(d, text, t.isAr);
      reply = { id: nextId.current + 1, mine: false, text: a.text, leave: a.topic === 'leave' && d.viewer_is_self };
    }
    setMsgs((m) => [...m, { id: nextId.current, mine: true, text }, reply]);
    nextId.current += 2;
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Header title={t('assistant_title')} subtitle={t('asst_note')} back />
      <Screen scroll={false} padded={false}>
        <FlatList
          ref={list}
          testID="assistant-list"
          data={msgs}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          renderItem={({ item, index }) => (
            <View accessibilityLiveRegion={index === msgs.length - 1 && !item.mine ? 'polite' : 'none'}>
              <ChatBubble mine={item.mine} text={item.text} testID={item.mine ? undefined : `assistant-reply-${item.id}`}>
                {item.leave ? (
                  <Button label={t('leave_request')} icon="airplane-outline" kind="secondary" onPress={() => router.push('/leave')} />
                ) : null}
              </ChatBubble>
            </View>
          )}
        />
        <View
          style={{
            paddingHorizontal: space.lg,
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.md,
            gap: space.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.line,
            backgroundColor: c.bg,
          }}
        >
          <View accessibilityLabel={t('asst_suggestions')}>
            <Row wrap gap={space.sm}>
              {QUICK.map((k) => (
                <Chip key={k} label={t(k)} onPress={() => ask(t(k))} />
              ))}
            </Row>
          </View>
          <ChatInput onSend={ask} placeholder={t('assistant_hint')} sendLabel={t('send')} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
