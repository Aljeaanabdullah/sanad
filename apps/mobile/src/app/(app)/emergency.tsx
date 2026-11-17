// Emergency screen (PRD 8.4, 8.6): opens from Home's banner, on app start / return when an emergency is
// active, and from the push tap (lib/emergencyNotification.ts). Map in a WebView (Leaflet + OSM):
// danger building red, safe building green, the employee blue with a dashed line to the safe building.
// Location is read in the foreground only, while this screen is open during an active emergency, and once
// more at the moment of pressing. Nothing runs in the background. A press without a location still counts.
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { RefreshControl, View } from 'react-native';
import { WebView as WebViewBase, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { Badge, Button, Card, EmptyState, Header, Notice, Screen, SkeletonCard, Txt, useSnackbar } from '../../components/ui';
import { EmergencyError, myActiveEmergency, respondToEmergency } from '../../lib/emergency';
import {
  buildMapHtml,
  dangerBuildings,
  safeBuilding,
  safeStatus,
  type ActiveEmergency,
  type MyPosition,
  type ResponseStatus,
} from '../../lib/emergencyMap';
import { hm } from '../../lib/dates';
import { openSettings } from '../../lib/punchDevice';
import { useSettings } from '../../lib/settings';
import { radius, space } from '../../lib/theme';

const REFRESH_MS = 15_000;
const FRESH_FIX_MS = 20_000;
const PRESS_FIX_TIMEOUT_MS = 8_000;

// react-native-webview 14 types its class with `Props & undefined` (= never) under strict TypeScript;
// this narrows it to the props and the one method the screen uses.
type MapHandle = { injectJavaScript: (js: string) => void };
const WebView = WebViewBase as unknown as ComponentType<WebViewProps & { ref?: Ref<MapHandle> }>;

type Load = { state: 'loading' } | { state: 'none' } | { state: 'error' } | { state: 'ok'; data: ActiveEmergency };
type Perm = 'unknown' | 'granted' | 'denied';

export default function EmergencyScreen() {
  const { t, c, lang } = useSettings();
  const snack = useSnackbar();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [me, setMe] = useState<(MyPosition & { at: number }) | null>(null);
  const [perm, setPerm] = useState<Perm>('unknown');
  const [sending, setSending] = useState<ResponseStatus | null>(null);
  const [mapError, setMapError] = useState(false);
  const web = useRef<MapHandle>(null);
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  const emergency = load.state === 'ok' ? load.data : null;
  const active = !!emergency;

  const refresh = useCallback(
    () =>
      myActiveEmergency().then(
        (data) => setLoad(data ? { state: 'ok', data } : { state: 'none' }),
        () => setLoad((l) => (l.state === 'ok' ? l : { state: 'error' })),
      ),
    [],
  );

  // Load on focus and keep checking while the screen is open (to notice when the emergency ends).
  useFocusEffect(
    useCallback(() => {
      refresh();
      const id = setInterval(refresh, REFRESH_MS);
      return () => clearInterval(id);
    }, [refresh]),
  );

  // Foreground location only while this screen is focused AND an emergency is active.
  useFocusEffect(
    useCallback(() => {
      if (!active) return undefined;
      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;
      (async () => {
        let p = await Location.getForegroundPermissionsAsync();
        if (!p.granted && p.canAskAgain) p = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        setPerm(p.granted ? 'granted' : 'denied');
        if (!p.granted) return;
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 3 },
          (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() }),
        );
        if (cancelled) s.remove();
        else sub = s;
      })().catch(() => setPerm('denied'));
      return () => {
        cancelled = true;
        sub?.remove();
      };
    }, [active]),
  );

  // Move the blue dot without reloading the map.
  useEffect(() => {
    if (me) web.current?.injectJavaScript(`window.setMe && window.setMe(${me.lat}, ${me.lng}, ${me.accuracy ?? 0}); true;`);
  }, [me]);

  // The map page is rebuilt only when the emergency, language or theme changes.
  const mapKey = emergency ? `${emergency.id}:${lang}:${c.dark}` : '';
  const html = useMemo(
    () => (emergency ? buildMapHtml(emergency, { lang, dark: c.dark, me: meRef.current }) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapKey],
  );

  /** The location at the moment of pressing: the live fix if fresh, else one new reading, else none. */
  const positionNow = async (): Promise<MyPosition | null> => {
    const cur = meRef.current;
    if (cur && Date.now() - cur.at < FRESH_FIX_MS) return cur;
    if (perm !== 'granted') return null;
    try {
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), PRESS_FIX_TIMEOUT_MS)),
      ]);
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    } catch {
      return null;
    }
  };

  const press = async (status: ResponseStatus) => {
    if (!emergency || sending) return;
    setSending(status);
    try {
      const at = await positionNow();
      const r = await respondToEmergency(emergency.id, status, at);
      snack(t(status === 'arrived' && r.inside_safe === false ? 'emg_sent_outside' : status === 'arrived' ? 'emg_sent_arrived' : 'emg_sent_safe'), r.inside_safe === false && status === 'arrived' ? 'info' : 'ok');
      await refresh();
    } catch (e) {
      if (e instanceof EmergencyError && e.code === 'not_active') {
        snack(t('emg_err_not_active'), 'info');
        await refresh();
      } else {
        snack(t('emg_err_send'), 'danger');
      }
    } finally {
      setSending(null);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  };

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} />;

  if (load.state !== 'ok') {
    return (
      <>
        <Header title={t('emg_title')} back />
        <Screen refreshControl={refreshControl}>
          {load.state === 'loading' ? (
            <>
              <SkeletonCard lines={3} />
              <SkeletonCard lines={6} />
            </>
          ) : load.state === 'error' ? (
            <EmptyState icon="cloud-offline-outline" title={t('error_no_internet')} action={t('retry')} onAction={refresh} />
          ) : (
            <EmptyState icon="shield-checkmark-outline" title={t('emg_ended_title')} body={t('emg_ended_body')} />
          )}
        </Screen>
      </>
    );
  }

  const e = load.data;
  const name = (b: { name_ar: string; name_en: string }) => (lang === 'ar' ? b.name_ar : b.name_en);
  const safe = safeBuilding(e);
  const where = safeStatus(me, safe);
  const message = lang === 'ar' ? e.message_ar ?? e.message_en : e.message_en ?? e.message_ar;
  const answer = e.response;
  // PRD 8.6: "arrived" is accepted anywhere; outside the safe building's radius the employee is told so.
  const outside = answer?.status === 'arrived' && answer.distance_m != null && !!safe && answer.distance_m > safe.radius;

  return (
    <>
      <Header title={t('emg_title')} subtitle={e.is_drill ? t('emg_drill') : undefined} back />
      <Screen
        refreshControl={refreshControl}
        footer={
          <View style={{ gap: space.md }}>
            <Button
              label={t('emg_arrived')}
              icon="checkmark-circle"
              kind="accent"
              size="lg"
              loading={sending === 'arrived'}
              disabled={!!sending}
              onPress={() => press('arrived')}
              testID="emg-arrived"
            />
            <Button
              label={t('emg_safe_elsewhere')}
              icon="shield-checkmark"
              kind="primary"
              size="lg"
              loading={sending === 'safe_elsewhere'}
              disabled={!!sending}
              onPress={() => press('safe_elsewhere')}
              testID="emg-safe"
            />
          </View>
        }
      >
        <View style={{ gap: space.sm }}>
          {e.is_drill ? <Badge label={t('emg_drill')} tone="warn" icon="school-outline" /> : null}
          <Notice
            tone="danger"
            icon="warning"
            text={t('emg_headline', { hazard: t(`emg_hazard_${e.hazard}`), site: name(e.site) })}
          />
          <Txt variant="heading">{t(`emg_steps_${e.hazard}`)}</Txt>
          {message ? <Txt>{t('emg_message', { text: message })}</Txt> : null}
        </View>

        <Card padded={false}>
          {mapError ? (
            <View style={{ padding: space.lg }}>
              <Notice tone="warn" text={t('emg_map_error')} />
            </View>
          ) : (
            <View style={{ height: 320, borderRadius: radius.md, overflow: 'hidden' }}>
              <WebView
                key={mapKey}
                ref={web}
                originWhitelist={['*']}
                source={{ html }}
                javaScriptEnabled
                domStorageEnabled
                setSupportMultipleWindows={false}
                onMessage={(m: WebViewMessageEvent) => {
                  if (m.nativeEvent.data === 'map_error') setMapError(true);
                }}
                onError={() => setMapError(true)}
                style={{ backgroundColor: c.bg }}
                accessibilityLabel={t('emg_legend')}
              />
            </View>
          )}
          <View style={{ padding: space.md, gap: space.xs }}>
            <Txt variant="caption" tone="muted">{t('emg_legend')}</Txt>
            <Txt variant="label" weight="bold" tone="danger">
              {t('emg_danger', { names: dangerBuildings(e).map(name).join(lang === 'ar' ? '، ' : ', ') })}
            </Txt>
            {safe ? (
              <Txt variant="label" weight="bold" tone="ok">
                {t('emg_safe', { name: name(safe) })}
              </Txt>
            ) : null}
            {perm === 'granted' ? (
              <Txt variant="label">
                {where ? (where.inside ? t('emg_inside') : t('emg_distance', { m: where.metres })) : t('emg_no_fix')}
              </Txt>
            ) : null}
          </View>
        </Card>

        {perm === 'denied' ? (
          <View style={{ gap: space.sm }}>
            <Notice tone="warn" icon="location-outline" text={t('emg_location_off')} />
            <Button label={t('emg_allow_location')} icon="settings-outline" kind="secondary" onPress={openSettings} />
          </View>
        ) : null}

        {answer ? (
          <Card>
            <View style={{ gap: space.xs }}>
              <Txt weight="bold">
                {t('emg_your_answer', {
                  status: t(answer.status === 'arrived' ? 'emg_arrived' : 'emg_safe_elsewhere'),
                  time: hm(new Date(answer.responded_at)),
                })}
              </Txt>
              {outside ? <Notice tone="warn" text={t('emg_sent_outside')} /> : null}
              <Txt variant="caption" tone="muted">{t('emg_change_hint')}</Txt>
            </View>
          </Card>
        ) : (
          <Txt variant="caption" tone="muted">
            {t('emg_arrived_hint')} · {t('emg_safe_elsewhere_hint')}
          </Txt>
        )}

        <Txt variant="caption" tone="muted">{t('emg_location_why')}</Txt>
      </Screen>
    </>
  );
}
