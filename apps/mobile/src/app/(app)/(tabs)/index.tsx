// Home tab (PRD 18.2): greeting, the punch card, the period / bonus summary, shortcuts and today's
// punches. Every block loads on its own, so one failing call never blanks the screen.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import type { Block } from '../../../components/home/block';
import { EmergencyBanner } from '../../../components/emergency/EmergencyBanner';
import { BonusSummary } from '../../../components/home/BonusSummary';
import { NotifyCard } from '../../../components/home/NotifyCard';
import { PunchCard } from '../../../components/home/PunchCard';
import { QuickActions } from '../../../components/home/QuickActions';
import { TodayPunches } from '../../../components/home/TodayPunches';
import { Header, IconButton, Screen } from '../../../components/ui';
import { currentShift, loadDashboard, todayPunches, unreadNotificationCount, type PunchEntry, type ShiftInfo } from '../../../lib/api';
import { longDate } from '../../../lib/dates';
import { firstName, type PunchKind } from '../../../lib/punch';
import { useSession } from '../../../lib/session';
import { useSettings } from '../../../lib/settings';
import { brand } from '../../../lib/theme';
import type { DashboardData } from '../../../sanad/dashboard';

/** Runs one block's load; a failed reload keeps what is already shown. */
function loadInto<T>(fn: () => Promise<T>, set: (u: (b: Block<T>) => Block<T>) => void): Promise<void> {
  return fn().then(
    (data) => set(() => ({ state: 'ok', data })),
    () => set((b) => (b.state === 'ok' ? b : { state: 'error' })),
  );
}

export default function Home() {
  const { t, c, lang } = useSettings();
  const { profile } = useSession();
  const router = useRouter();

  const [shift, setShift] = useState<Block<ShiftInfo | null>>({ state: 'loading' });
  const [punches, setPunches] = useState<Block<PunchEntry[]>>({ state: 'loading' });
  const [dash, setDash] = useState<Block<DashboardData>>({ state: 'loading' });
  const [notices, setNotices] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadShift = useCallback(() => loadInto(currentShift, setShift), []);
  const loadPunches = useCallback(() => loadInto(todayPunches, setPunches), []);
  const loadDash = useCallback(() => loadInto(() => loadDashboard(), setDash), []);
  const loadNotices = useCallback(
    // Unread notifications on the bell (they become read when the list is opened).
    () => unreadNotificationCount().then(setNotices, () => {}),
    [],
  );

  const loadAll = useCallback(
    () => Promise.allSettled([loadShift(), loadPunches(), loadDash(), loadNotices()]).then(() => {}),
    [loadShift, loadPunches, loadDash, loadNotices],
  );

  // Reload whenever Home comes back into view (e.g. after a punch).
  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll().finally(() => setRefreshing(false));
  }, [loadAll]);

  const onPunch = (next: PunchKind | null) => {
    router.push(next ? `/punch?next=${next === 'check_out' ? 'out' : 'in'}` : '/punch');
  };

  const name = firstName(profile, lang);
  const now = new Date();

  return (
    <>
      <Header
        big
        title={name ? t('home_hello', { name }) : t('welcome')}
        subtitle={longDate(now, lang)}
        actions={
          <IconButton
            icon="notifications-outline"
            label={t('notifications')}
            color={brand.onRail}
            badge={notices}
            onPress={() => router.push('/notifications')}
          />
        }
      >
        <PunchCard shift={shift} punches={punches.state === 'ok' ? punches.data : null} onPunch={onPunch} />
      </Header>
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} />}>
        <EmergencyBanner />
        <NotifyCard />
        <BonusSummary dash={dash} onOpen={() => router.push('/dashboard')} onRetry={loadDash} />
        <QuickActions />
        <TodayPunches punches={punches} onRetry={loadPunches} />
      </Screen>
    </>
  );
}
