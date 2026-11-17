// One idea: text, photo, «أؤيد» (support / withdraw), progress to 50 supporters, the 14-day reply
// countdown everyone sees, the rejection reason, and the status timeline.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, RefreshControl, View } from 'react-native';
import { Badge, Button, Card, EmptyState, ErrorState, Header, Icon, Notice, Row, Screen, Section, SkeletonCard, Txt, useSnackbar, type IconName } from '../../../components/ui';
import { mediumDate } from '../../../lib/dates';
import {
  authorLabel, categoryIcon, categoryKey, countdownText, ideaErrorKey, ideaStatusView, responseCountdown, statusAfterVotes,
  thresholdProgress, timelineSteps, toggleVote, voteState, votesToGo, type IdeaDetail,
} from '../../../lib/ideas';
import { getIdea, ideaPhotoUrl, voteIdea } from '../../../lib/ideasApi';
import { useSettings } from '../../../lib/settings';
import { radius, space } from '../../../lib/theme';

export default function IdeaDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, c } = useSettings();
  const snack = useSnackbar();
  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const d = await getIdea(id);
      setIdea(d);
      setMissing(!d);
      setNow(new Date());
      if (d?.photoPath) ideaPhotoUrl(d.photoPath).then(setPhoto).catch(() => setPhoto(null));
    } catch (e) {
      setError(t(ideaErrorKey(e)));
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // The countdown moves while the screen is open.
  useEffect(() => {
    if (idea?.status !== 'awaiting_response') return;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [idea?.status]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const vote = async () => {
    if (!idea || busy) return;
    const before = idea;
    const next = toggleVote(idea);
    setIdea({ ...idea, ...next, status: statusAfterVotes(idea.status, next.voteCount, idea.voteThreshold) });
    setBusy(true);
    try {
      const count = await voteIdea(idea.id, next.iVoted);
      snack(t(next.iVoted ? 'idea_voted' : 'idea_unvoted'), 'ok');
      setIdea((cur) => (cur ? { ...cur, voteCount: count } : cur));
      // Reaching 50 changes the status and starts the countdown: read it back from the server.
      if (next.iVoted && count >= before.voteThreshold && before.status === 'published') load();
    } catch (e) {
      setIdea(before);
      snack(t(ideaErrorKey(e)), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const vs = idea ? voteState(idea) : 'closed';
  const footer = idea && (vs === 'can_vote' || vs === 'voted') ? (
    <Button
      testID="voteIdea"
      label={vs === 'voted' ? t('idea_unvote') : t('idea_vote')}
      kind={vs === 'voted' ? 'secondary' : 'primary'}
      icon={vs === 'voted' ? 'thumbs-up' : 'thumbs-up-outline'}
      loading={busy}
      onPress={vote}
    />
  ) : undefined;

  return (
    <>
      <Header title={t('idea_details')} back />
      <Screen footer={footer} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />}>
        {error && !idea ? (
          <ErrorState message={error} onRetry={load} />
        ) : missing ? (
          <EmptyState icon="bulb-outline" title={t('idea_not_found')} />
        ) : !idea ? (
          <>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={2} />
          </>
        ) : (
          renderBody(idea, photo, now)
        )}
      </Screen>
    </>
  );

  // A plain render function (not a component), so the photo does not remount on every render.
  function renderBody(i: IdeaDetail, p: string | null, n: Date) {
    const s = ideaStatusView(i.status);
    const cd = responseCountdown(i, n);
    const steps = timelineSteps(i.status, i.timeline);
    const progress = thresholdProgress(i.voteCount, i.voteThreshold);
    const toGo = votesToGo(i.voteCount, i.voteThreshold);
    return (
      <>
        <Card>
          <View style={{ gap: space.md }}>
            <Row gap={space.xs}>
              <Icon name={categoryIcon(i.category) as IconName} size={18} tone="muted" />
              <Txt variant="label" tone="muted">{t(categoryKey(i.category))}</Txt>
            </Row>
            <Txt variant="title">{i.title}</Txt>
            <Badge label={t(s.key)} tone={s.tone} icon={s.icon as IconName} />
            <Txt variant="label" tone="muted">{`${authorLabel(i, t, lang)} · ${mediumDate(i.publishedAt ?? i.createdAt, lang)}`}</Txt>
            {p ? (
              <Image
                source={{ uri: p }}
                accessibilityLabel={t('idea_photo')}
                style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.sm, backgroundColor: c.surfaceAlt }}
                resizeMode="cover"
              />
            ) : null}
            <Txt>{i.description}</Txt>
          </View>
        </Card>

        {i.status === 'new' ? <Notice tone="info" text={t('idea_waiting_review')} /> : null}
        {i.rejectReason && (i.status === 'rejected' || i.status === 'review_rejected') ? (
          <Notice tone="danger" text={t(i.status === 'review_rejected' ? 'idea_review_rejected_reason' : 'idea_rejected_reason', { reason: i.rejectReason })} />
        ) : null}

        {cd ? (
          <Card>
            <View style={{ gap: space.xs }}>
              <Row gap={space.sm}>
                <Icon name="hourglass-outline" size={20} tone={cd.overdue ? 'danger' : 'accent'} />
                <Txt weight="bold" tone={cd.overdue ? 'danger' : 'default'}>{t('idea_countdown_title')}</Txt>
              </Row>
              <Txt variant="title" tone={cd.overdue ? 'danger' : 'default'}>{countdownText(cd, t)}</Txt>
              <Txt variant="caption" tone="muted">{t('idea_countdown_hint')}</Txt>
            </View>
          </Card>
        ) : null}

        {i.status !== 'new' && i.status !== 'review_rejected' ? (
          <Card>
            <View style={{ gap: space.sm }}>
              <Row justify="space-between">
                <Txt weight="bold">{t('idea_support_title')}</Txt>
                <Txt weight="bold" numeric>{`${i.voteCount} / ${i.voteThreshold}`}</Txt>
              </Row>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: i.voteThreshold, now: Math.min(i.voteCount, i.voteThreshold) }}
                style={{ height: 10, borderRadius: radius.pill, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}
              >
                <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', backgroundColor: c.accent, borderRadius: radius.pill }} />
              </View>
              <Txt variant="caption" tone="muted">
                {toGo > 0 ? t('idea_votes_to_go', { n: toGo }) : t('idea_threshold_reached')}
              </Txt>
              {vs === 'own' ? <Txt variant="caption" tone="muted">{t('idea_own_note')}</Txt> : null}
              {vs === 'closed' ? <Txt variant="caption" tone="muted">{t('idea_votes_closed')}</Txt> : null}
            </View>
          </Card>
        ) : null}

        <Section title={t('idea_timeline')}>
          <Card>
            <View style={{ gap: space.lg }}>
              {steps.map((st, k) => {
                const v = ideaStatusView(st.status);
                const tone = st.state === 'todo' ? 'muted' : st.status === 'rejected' || st.status === 'review_rejected' ? 'danger' : st.state === 'current' ? 'accent' : 'ok';
                return (
                  <Row key={`${st.status}-${k}`} gap={space.md} align="flex-start">
                    <Icon name={(st.state === 'todo' ? 'ellipse-outline' : st.state === 'done' ? 'checkmark-circle' : v.icon) as IconName} size={22} tone={tone} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt weight={st.state === 'current' ? 'bold' : 'medium'} tone={st.state === 'todo' ? 'muted' : 'default'}>{t(v.key)}</Txt>
                      {st.at ? <Txt variant="label" tone="muted">{mediumDate(st.at, lang)}</Txt> : null}
                      {st.reason ? <Txt variant="label">{st.reason}</Txt> : null}
                    </View>
                  </Row>
                );
              })}
            </View>
          </Card>
        </Section>
      </>
    );
  }
}
