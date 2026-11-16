// In-app notifications (PRD 9 / 18.2): the same notifications the phone receives (public.notifications).
// Unread ones are marked "New"; opening the list marks them all read (the marker stays until the list reloads).
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { noticeView } from '../../components/dash/notice';
import { Badge, Card, EmptyState, ErrorState, Header, Icon, Row, Screen, SkeletonCard, Txt, useDir } from '../../components/ui';
import { markNotificationsRead, myNotifications, type Notice } from '../../lib/api';
import { agoParts } from '../../lib/dates';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';

export default function NotificationsScreen() {
  const { t, c } = useSettings();
  const d = useDir();
  const router = useRouter();
  const [items, setItems] = useState<Notice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loaded = useRef(false);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try {
      const list = await myNotifications();
      loaded.current = true;
      setItems(list);
      setFailed(false);
      if (list.some((n) => n.readAt === null)) markNotificationsRead(null).catch(() => {});
    } catch {
      if (!loaded.current) setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.accent} />;
  const now = new Date();

  return (
    <>
      <Header title={t('notifications')} back />
      <Screen refreshControl={refresh}>
        {items == null ? (
          failed ? (
            <ErrorState message={t('notif_error')} onRetry={() => { setFailed(false); load(); }} />
          ) : (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )
        ) : items.length === 0 ? (
          <EmptyState icon="notifications-off-outline" title={t('notifications_none')} body={t('notif_empty_all')} />
        ) : (
          <Card padded={false}>
            {items.map((n, i) => {
              const v = noticeView(n, t);
              const ago = agoParts(n.at, now);
              const unread = n.readAt === null;
              const body = (
                <Row gap={space.md} align="flex-start" style={{ paddingVertical: space.md, paddingHorizontal: space.lg, minHeight: 64 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={v.icon} size={20} tone={v.tone} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }} accessibilityLabel={unread ? `${t('notif_unread_a11y')}: ${v.title}` : undefined}>
                    <Txt weight={unread ? 'bold' : 'medium'}>{v.title}</Txt>
                    {v.body ? <Txt variant="label" tone="muted">{v.body}</Txt> : null}
                    <Row gap={space.sm}>
                      {unread ? <Badge label={t('notif_unread')} tone="warn" /> : null}
                      <Txt variant="caption" tone="muted">{t(ago.key, { n: ago.n })}</Txt>
                    </Row>
                  </View>
                  {v.href ? <Icon name={d.forward} size={18} tone="muted" /> : null}
                </Row>
              );
              const divider = i === items.length - 1 ? null : <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginHorizontal: space.lg }} />;
              const key = n.id ?? `${n.kind}-${n.at.getTime()}-${i}`;
              if (!v.href) return <View key={key}>{body}{divider}</View>;
              return (
                <Pressable
                  key={key}
                  testID={`notice-${i}`}
                  onPress={() => router.push(v.href as Href)}
                  accessibilityRole="button"
                  android_ripple={{ color: c.line }}
                  style={({ pressed }) => pressed && { opacity: 0.7 }}
                >
                  {body}
                  {divider}
                </Pressable>
              );
            })}
          </Card>
        )}
      </Screen>
    </>
  );
}
