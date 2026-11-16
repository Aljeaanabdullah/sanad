// Approvals inbox (supervisor / HR / admin): requests waiting for my decision. Approve or reject
// with an optional note (PRD 7.2 and the old app: the note is optional both ways), then snackbar
// and reload. Tapping a card opens its details and approval steps.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { DecisionSheet } from '../../components/requests/parts';
import { Badge, Button, Card, EmptyState, ErrorState, Header, Icon, Row, Screen, SkeletonCard, Txt, useSnackbar, type IconName } from '../../components/ui';
import { approvalInbox, decideRequest, type RequestItem } from '../../lib/api';
import { errorKey, isStaff, requestSummary, requestTitle, statusView, typeIcon } from '../../lib/requestsView';
import { useSession } from '../../lib/session';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';

export default function ApprovalsScreen() {
  const { t, lang, c } = useSettings();
  const { profile } = useSession();
  const router = useRouter();
  const snack = useSnackbar();
  const allowed = isStaff(profile?.role);
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deciding, setDeciding] = useState<{ item: RequestItem; approve: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    setError(null);
    try {
      setItems(await approvalInbox());
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }, [allowed, t]);

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

  const open = (item: RequestItem, approve: boolean) => {
    setDecideError(null);
    setDeciding({ item, approve });
  };

  const confirm = async (note: string) => {
    if (!deciding) return;
    setBusy(true);
    setDecideError(null);
    try {
      await decideRequest(deciding.item.id, deciding.approve, note);
      setDeciding(null);
      snack(t('decided'), 'ok');
      setItems((list) => list?.filter((r) => r.id !== deciding.item.id) ?? null);
      load();
    } catch (e) {
      setDecideError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header title={t('approvals')} subtitle={items && items.length ? t('req_inbox_count', { n: items.length }) : undefined} back />
      <Screen refreshControl={allowed ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} /> : undefined}>
        {!allowed ? (
          <EmptyState icon="lock-closed-outline" title={t('req_staff_only')} />
        ) : items == null && error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items == null ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </>
        ) : items.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title={t('inbox_empty')} />
        ) : (
          items.map((r) => {
            const st = statusView(r.status);
            const name = lang === 'ar' ? r.employeeNameAr : r.employeeNameEn;
            const dept = lang === 'ar' ? r.departmentAr : r.departmentEn;
            return (
              <Card key={r.id} testID={`inbox-${r.id}`} onPress={() => router.push({ pathname: '/request/[id]', params: { id: r.id } })}>
                <View style={{ gap: space.md }}>
                  <Row gap={space.md} align="flex-start">
                    <Icon name={typeIcon(r.type) as IconName} size={24} tone="primary" />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt weight="bold">{requestTitle(r, t)}</Txt>
                      <Txt variant="label" tone="muted">{[name, r.fileNumber, dept].filter(Boolean).join(' · ')}</Txt>
                    </View>
                    <Badge label={t(st.key)} tone={st.tone} />
                  </Row>
                  <Txt variant="label">{requestSummary(r, t, lang)}</Txt>
                  <Txt variant="label" tone="muted" numberOfLines={3}>{`${t('reason')}: ${r.reason}`}</Txt>
                  <Row gap={space.sm}>
                    <View style={{ flex: 1 }}>
                      <Button testID={`approve-${r.id}`} label={t('approve')} icon="checkmark" onPress={() => open(r, true)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button testID={`reject-${r.id}`} label={t('reject')} icon="close" kind="secondary" onPress={() => open(r, false)} />
                    </View>
                  </Row>
                </View>
              </Card>
            );
          })
        )}
      </Screen>
      <DecisionSheet
        key={deciding ? `${deciding.item.id}-${deciding.approve}` : 'none'}
        request={deciding?.item ?? null}
        approve={deciding?.approve ?? true}
        busy={busy}
        error={decideError}
        onConfirm={confirm}
        onClose={() => setDeciding(null)}
      />
    </>
  );
}
