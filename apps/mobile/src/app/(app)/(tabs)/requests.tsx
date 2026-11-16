// Requests tab: my requests with filters, the three "new request" actions, and (for supervisors,
// HR and the admin) the way into approvals with the waiting count.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { ActionTile, RequestRow } from '../../../components/requests/parts';
import { Badge, Card, Chip, EmptyState, ErrorState, Header, ListRow, Row, Screen, Section, SkeletonCard } from '../../../components/ui';
import { approvalInbox, myRequests, type RequestItem } from '../../../lib/api';
import { countByFilter, errorKey, filterRequests, isStaff, type RequestFilter } from '../../../lib/requestsView';
import { useSession } from '../../../lib/session';
import { useSettings } from '../../../lib/settings';
import { space } from '../../../lib/theme';

const FILTERS: { value: RequestFilter; key: string }[] = [
  { value: 'all', key: 'req_filter_all' },
  { value: 'pending', key: 'req_filter_pending' },
  { value: 'decided', key: 'req_filter_decided' },
];

export default function RequestsTab() {
  const { t, c } = useSettings();
  const { profile } = useSession();
  const router = useRouter();
  const staff = isStaff(profile?.role);
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [filter, setFilter] = useState<RequestFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [mine, inbox] = await Promise.allSettled([myRequests(), staff ? approvalInbox() : Promise.resolve([])]);
    if (mine.status === 'fulfilled') setItems(mine.value);
    else setError(t(errorKey(mine.reason)));
    if (staff) setInboxCount(inbox.status === 'fulfilled' ? inbox.value.length : null);
  }, [staff, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const counts = items ? countByFilter(items) : null;
  const shown = items ? filterRequests(items, filter) : [];
  const emptyKey = filter === 'pending' ? 'req_empty_pending' : filter === 'decided' ? 'req_empty_decided' : 'no_requests';

  return (
    <>
      <Header title={t('my_requests')} big />
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />}>
        <Section title={t('new_request')}>
          <Row gap={space.sm} align="stretch">
            <ActionTile testID="newLeave" icon="airplane-outline" label={t('leave_request')} onPress={() => router.push('/leave')} />
            <ActionTile testID="newCorrection" icon="time-outline" label={t('new_request_correction')} onPress={() => router.push('/correction')} />
            <ActionTile testID="newMission" icon="navigate-outline" label={t('new_request_mission')} onPress={() => router.push('/mission')} />
          </Row>
        </Section>

        {staff ? (
          <Card padded={false}>
            <ListRow
              testID="openApprovals"
              icon="checkmark-done-outline"
              iconTone="accent"
              title={t('approvals')}
              subtitle={inboxCount == null ? undefined : inboxCount > 0 ? t('req_inbox_count', { n: inboxCount }) : t('inbox_empty')}
              trailing={inboxCount ? <Badge label={String(inboxCount)} tone="warn" /> : undefined}
              onPress={() => router.push('/approvals')}
              last
            />
          </Card>
        ) : null}

        <Section title={t('my_requests')}>
          <Row gap={space.sm} wrap>
            {FILTERS.map((f) => (
              <Chip
                key={f.value}
                label={counts ? `${t(f.key)} (${counts[f.value]})` : t(f.key)}
                selected={filter === f.value}
                onPress={() => setFilter(f.value)}
              />
            ))}
          </Row>
          {items == null && error ? (
            <ErrorState message={error} onRetry={load} />
          ) : items == null ? (
            <View style={{ gap: space.sm }}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : shown.length === 0 ? (
            <EmptyState icon="document-text-outline" title={t(emptyKey)} body={filter === 'all' ? t('req_empty_hint') : undefined} />
          ) : (
            <Card padded={false}>
              {shown.map((r, i) => (
                <RequestRow key={r.id} item={r} last={i === shown.length - 1} onPress={() => router.push({ pathname: '/request/[id]', params: { id: r.id } })} />
              ))}
            </Card>
          )}
        </Section>
      </Screen>
    </>
  );
}
