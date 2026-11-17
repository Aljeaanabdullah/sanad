// "Ask Sanad" (PRD 18.1-18.2, version 1.12): the question box as a chat. Known questions (bonus, late,
// absence, leave, penalties) are answered on the phone from the signed-in employee's own dashboard
// (answerQuestion), instantly. Any other question goes to the «مساعد سند» agent through the relay
// (askSanadAI), which reads the employee's own current-period data only; no AI key is in the app.
// Optional param `month` (YYYY-MM) answers about that bonus period instead of the current one.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatBubble, ChatInput } from '../../components/dash/Chat';
import { Button, Chip, Header, Row, Screen, Txt } from '../../components/ui';
import { askErrorKey, askSanadAI } from '../../lib/askAi';
import { loadDashboard } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { answerQuestion, MONTH_RE, type DashboardData } from '../../sanad/dashboard';
import { readyAnswerFits } from '../../sanad/route';

type Msg = {
  id: number;
  mine: boolean;
  text: string;
  leave?: boolean;
  /** Waiting for the AI assistant. */
  pending?: boolean;
  /** Answered by the AI assistant: show the automated-reply note (and how many questions are left today). */
  ai?: { remaining: number | null };
};

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

  const [waiting, setWaiting] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /** `button`: a quick-question button (always the ready answer); typed text is routed by readyAnswerFits. */
  const ask = (q: string, button = false) => {
    const text = q.trim();
    if (!text || waiting) return;
    const d = data.current;
    const replyId = nextId.current + 1;
    nextId.current += 2;
    const put = (reply: Msg) => setMsgs((m) => [...m, { id: replyId - 1, mine: true, text }, reply]);
    if (!d) {
      put({ id: replyId, mine: false, text: t(failed.current ? 'dash_error_generic' : 'assistant_loading') });
      if (failed.current) fetchData();
      return;
    }
    const a = answerQuestion(d, text, t.isAr);
    const ready = () => put({ id: replyId, mine: false, text: a.text, leave: a.topic === 'leave' && d.viewer_is_self });
    if (a.topic !== 'unknown' && (button || readyAnswerFits(text))) return ready();
    // The assistant only sees the current period: for a past period use the ready answer when there is one.
    if (d.period.complete) {
      if (a.topic !== 'unknown') return ready();
      put({ id: replyId, mine: false, text: t('asst_old_period') });
      return;
    }
    put({ id: replyId, mine: false, text: t('asst_typing'), pending: true });
    setWaiting(true);
    askSanadAI(text).then((r) => {
      if (!alive.current) return;
      setWaiting(false);
      const reply: Msg =
        r.kind === 'answer'
          ? { id: replyId, mine: false, text: r.answer, ai: { remaining: r.remaining } }
          : { id: replyId, mine: false, text: t.isAr && r.message ? r.message : t(askErrorKey(r.key)) };
      setMsgs((m) => m.map((x) => (x.id === replyId ? reply : x)));
    });
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
          // Welcome: the Sanad bot at its laptop, until the first question (the same art on light and dark).
          ListHeaderComponent={
            msgs.length === 1 ? (
              <Image
                testID="assistant-welcome"
                source={require('../../../assets/bot/scene.png')}
                accessible={false}
                importantForAccessibility="no"
                resizeMode="contain"
                style={{ width: 200, height: 200, alignSelf: 'center' }}
              />
            ) : undefined
          }
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          renderItem={({ item, index }) => (
            <View accessibilityLiveRegion={index === msgs.length - 1 && !item.mine ? 'polite' : 'none'}>
              <ChatBubble mine={item.mine} text={item.text} thinking={!!item.pending} testID={item.mine ? undefined : `assistant-reply-${item.id}`}>
                {item.leave ? (
                  <Button label={t('leave_request')} icon="airplane-outline" kind="secondary" onPress={() => router.push('/leave')} />
                ) : null}
                {item.ai ? (
                  <View style={{ gap: 2 }}>
                    <Txt variant="caption" tone="muted" testID={`assistant-ai-note-${item.id}`}>{t('asst_ai_note')}</Txt>
                    {item.ai.remaining != null ? (
                      <Txt variant="caption" tone="muted">{t('asst_ai_remaining', { n: item.ai.remaining })}</Txt>
                    ) : null}
                  </View>
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
                <Chip key={k} label={t(k)} onPress={() => ask(t(k), true)} />
              ))}
            </Row>
          </View>
          <ChatInput onSend={ask} placeholder={t('assistant_hint')} sendLabel={t('send')} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
