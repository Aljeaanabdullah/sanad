// Punch flow (PRD 4.6 / 4.7): phone checks -> front-camera review photo -> Face ID / fingerprint, which
// unlocks the phone's key to sign the punch (location + photo + checks) -> the punch function decides
// (server time, site, bound phone, signature) -> result.
// Mock location / root are reported, not blocked here: the server refuses and records the attempt.
// VPN is reported and recorded only (PRD 5.4, version 1.11).
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { PunchSteps } from '../../components/home/PunchSteps';
import { Button, Card, Gap, Header, Icon, Notice, Row, Screen, Skeleton, Txt } from '../../components/ui';
import { deviceId } from '../../lib/device';
import { signPunch } from '../../lib/deviceKey';
import { hm, longDate } from '../../lib/dates';
import { hasKey } from '../../lib/i18n';
import {
  biometricErrorKey,
  buildPunchBody,
  canRetry,
  errorKey,
  isStale,
  looksLikeJpeg,
  minutesUntil,
  reasonKey,
  reportProblems,
  resultMinutes,
  stepStates,
  type BiometricType,
  type GeoPoint,
  type PhoneReport,
  type PunchBody,
  type PunchOutcome,
  type StepId,
} from '../../lib/punch';
import * as Phone from '../../lib/punchDevice';
import { useSettings } from '../../lib/settings';
import { radius, space } from '../../lib/theme';

type Action = 'retry' | 'request' | 'settings';
type Problem = { step: StepId; key: string; vars?: Record<string, string | number>; note?: string; actions: Action[] };

export default function PunchScreen() {
  const { t, c, lang } = useSettings();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [camPerm, requestCam] = useCameraPermissions();

  const [step, setStep] = useState<StepId>('checks');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PunchOutcome | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  // Set synchronously so a double tap on the shutter can never send two punches.
  const busy = useRef(false);

  const alive = useRef(true);
  const run = useRef(0);
  const camera = useRef<CameraView>(null);
  const checks = useRef<{ location: GeoPoint; report: PhoneReport; at: number } | null>(null);
  /** The review photo taken in the photo step, signed and sent after Face ID / fingerprint. */
  const photoRef = useRef<string | null>(null);
  const askedCamera = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // System Back always works, except while the punch is being sent.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => step === 'sending' && !outcome && !problem);
    return () => sub.remove();
  }, [step, outcome, problem]);

  const fail = useCallback((p: Problem) => {
    if (!alive.current) return;
    setProblem(p);
  }, []);

  // ---------------------------------------------------------------- steps
  const runChecks = useCallback(async (id: number): Promise<boolean> => {
    setStep('checks');
    const net = await Phone.network();
    if (id !== run.current) return false;
    if (!net.online) {
      fail({ step: 'checks', key: 'punch_error_no_internet', actions: ['retry'] });
      return false;
    }
    const perm = await Phone.locationPermission(true).catch(() => 'ask' as const);
    if (id !== run.current) return false;
    if (perm === 'approximate') {
      fail({ step: 'checks', key: 'punch_location_precise', note: 'punch_location_why', actions: ['settings', 'retry'] });
      return false;
    }
    if (perm !== 'granted') {
      fail(
        perm === 'ask'
          ? { step: 'checks', key: 'punch_need_location', note: 'punch_location_why', actions: ['request'] }
          : { step: 'checks', key: 'punch_location_blocked', note: 'punch_location_why', actions: ['settings', 'retry'] },
      );
      return false;
    }
    if (!(await Phone.locationServicesOn())) {
      fail({ step: 'checks', key: 'punch_location_off', actions: ['retry'] });
      return false;
    }
    let loc: Awaited<ReturnType<typeof Phone.readLocation>>;
    try {
      loc = await Phone.readLocation();
    } catch {
      fail({ step: 'checks', key: 'punch_reason_no_location', actions: ['retry'] });
      return false;
    }
    const rooted = await Phone.rooted();
    if (id !== run.current) return false;
    const report: PhoneReport = { vpn: net.vpn, mockLocation: loc.mocked, rooted };
    checks.current = { location: { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy }, report, at: Date.now() };
    const first = reportProblems(report)[0];
    setWarning(first ? `punch_reason_${first}` : null);
    return true;
  }, [fail]);

  /**
   * Face ID / fingerprint. With a registered key (PRD 4.7) the prompt unlocks the key, which signs the punch;
   * without one (not registered yet, older build) it is a plain Face ID check and the server decides.
   * Returns the body to send, or null after showing the problem.
   */
  const runBiometric = useCallback(async (id: number, ch: { location: GeoPoint; report: PhoneReport }, photo: string): Promise<PunchBody | null> => {
    setStep('biometric');
    const info = await Phone.biometricInfo();
    if (id !== run.current) return null;
    if (!info.ready) {
      fail({ step: 'biometric', key: info.weak ? 'punch_biometric_weak' : 'biometric_not_enrolled', actions: ['retry'] });
      return null;
    }
    const bio: BiometricType = info.type ?? 'fingerprint';
    const body = buildPunchBody({ deviceId: await deviceId(), location: ch.location, report: ch.report, biometric: bio, photo });
    const signed = await signPunch(body, t('biometric_prompt'), t('punch_cancel'));
    if (id !== run.current) return null;
    if (signed.kind === 'signed') return { ...body, signature: signed.signature };
    if (signed.kind === 'failed') {
      fail({ step: 'biometric', key: signed.error === 'no_internet' ? 'punch_error_no_internet' : biometricErrorKey(signed.error), actions: ['retry'] });
      return null;
    }
    const r = await Phone.authenticate(t('biometric_prompt'), t('punch_cancel'));
    if (id !== run.current) return null;
    if (!r.ok) {
      fail({ step: 'biometric', key: biometricErrorKey(r.error), actions: ['retry'] });
      return null;
    }
    return body;
  }, [fail, t]);

  const start = useCallback(async (from: 'checks' | 'photo' = 'checks') => {
    const id = ++run.current;
    setProblem(null);
    setOutcome(null);
    setCameraReady(false);
    photoRef.current = null;
    if (from === 'checks' || isStale(checks.current?.at ?? null)) {
      if (!(await runChecks(id))) return;
    }
    if (id === run.current && alive.current) setStep('photo');
  }, [runChecks]);

  useEffect(() => {
    start('checks');
  }, [start]);

  // Ask for the camera once when the photo step opens.
  useEffect(() => {
    if (step !== 'photo' || !camPerm || camPerm.granted || !camPerm.canAskAgain || askedCamera.current) return;
    askedCamera.current = true;
    requestCam();
  }, [step, camPerm, requestCam]);

  /** Face ID / fingerprint (signs), then sends. Also the retry of a failed Face ID step (same photo). */
  const signAndSend = useCallback(async () => {
    const id = run.current;
    const ch = checks.current;
    const photo = photoRef.current;
    if (!ch || !photo) return start('checks');
    // The employee may have waited on the camera: never send an old location.
    if (isStale(ch.at)) return start('checks');
    setProblem(null);
    const body = await runBiometric(id, ch, photo);
    if (!body || id !== run.current || !alive.current) return;
    setStep('sending');
    const result = await Phone.sendPunch(body);
    if (id !== run.current || !alive.current) return;
    setOutcome(result);
  }, [start, runBiometric]);

  const capture = useCallback(async () => {
    if (!camera.current || busy.current) return;
    busy.current = true;
    setCapturing(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.7, exif: false });
      const photo = pic?.uri ? await Phone.shrinkPhoto(pic.uri) : null;
      if (!alive.current) return;
      if (!photo) {
        fail({ step: 'photo', key: 'punch_error_photo_too_big', actions: ['retry'] });
        return;
      }
      if (!looksLikeJpeg(photo)) {
        fail({ step: 'photo', key: 'punch_photo_failed', actions: ['retry'] });
        return;
      }
      photoRef.current = photo;
      await signAndSend();
    } catch {
      fail({ step: 'photo', key: 'punch_photo_failed', actions: ['retry'] });
    } finally {
      busy.current = false;
      if (alive.current) setCapturing(false);
    }
  }, [fail, signAndSend]);

  const act = (a: Action) => {
    if (a === 'settings') return Phone.openSettings();
    if (a === 'request') return start('checks');
    if (problem?.step === 'photo') {
      setProblem(null);
      setCameraReady(false);
      if (isStale(checks.current?.at ?? null)) start('checks');
      return;
    }
    if (problem?.step === 'biometric' && photoRef.current && !isStale(checks.current?.at ?? null)) {
      signAndSend();
      return;
    }
    start('checks');
  };

  // ---------------------------------------------------------------- view
  const sending = step === 'sending' && !outcome && !problem;
  const title = outcome
    ? t(outcome.kind === 'accepted' ? 'punch_accepted' : 'punch_rejected')
    : t(next === 'out' ? 'home_check_out' : next === 'in' ? 'home_check_in' : 'punch_title');

  if (outcome) {
    return (
      <>
        <Header title={title} back />
        <Screen
          footer={
            <View style={{ gap: space.sm }}>
              {canRetry(outcome) ? <Button label={t('punch_try_again')} icon="refresh" onPress={() => start('checks')} /> : null}
              <Button label={t('punch_back_home')} kind={canRetry(outcome) ? 'secondary' : 'primary'} onPress={() => router.back()} testID="punch-done" />
            </View>
          }
        >
          {resultView(outcome)}
        </Screen>
      </>
    );
  }

  const states = stepStates(step, !!problem);
  const camBlocked = step === 'photo' && !!camPerm && !camPerm.granted;
  const footer = problem ? (
    <View style={{ gap: space.sm }}>
      {problem.actions.map((a, i) => (
        <Button
          key={a}
          label={t(a === 'retry' ? 'punch_try_again' : a === 'request' ? 'allow' : 'punch_open_settings')}
          kind={i === 0 ? 'primary' : 'secondary'}
          icon={a === 'settings' ? 'settings-outline' : a === 'retry' ? 'refresh' : undefined}
          onPress={() => act(a)}
        />
      ))}
    </View>
  ) : camBlocked ? (
    camPerm.canAskAgain ? (
      <Button label={t('allow')} onPress={() => requestCam()} />
    ) : (
      <Button label={t('punch_open_settings')} icon="settings-outline" onPress={Phone.openSettings} />
    )
  ) : step === 'photo' && camPerm?.granted ? (
    <Button label={t('punch_take_photo')} kind="gold" size="lg" icon="camera" disabled={!cameraReady} loading={capturing} onPress={capture} testID="punch-shutter" />
  ) : undefined;

  return (
    <>
      <Header title={title} back={!sending} />
      <Screen footer={footer}>
        <PunchSteps states={states} />
        {problem ? (
          <View style={{ gap: space.sm }}>
            <Notice tone="danger" text={t(problem.key, problem.vars)} />
            {problem.note ? <Txt variant="label" tone="muted">{t(problem.note)}</Txt> : null}
          </View>
        ) : null}
        {warning && !problem ? <Notice tone="warn" text={t('punch_report_detected', { reason: t(warning) })} /> : null}
        {step === 'photo' && !problem ? (
          camPerm?.granted ? (
            <View style={{ gap: space.sm }}>
              <View style={{ width: '100%', aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0B1A33' }}>
                <CameraView
                  ref={camera}
                  style={{ flex: 1 }}
                  facing="front"
                  animateShutter={false}
                  onCameraReady={() => setCameraReady(true)}
                  onMountError={() => fail({ step: 'photo', key: 'camera_error', actions: ['retry', 'settings'] })}
                />
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: '62%', height: '82%', borderRadius: 999, borderWidth: 3, borderColor: '#C9A24B' }} />
                </View>
                {!cameraReady ? (
                  <View pointerEvents="none" style={{ position: 'absolute', bottom: space.md, left: 0, right: 0 }}>
                    <Txt variant="label" center style={{ color: '#F6F1E6' }}>{t('punch_camera_starting')}</Txt>
                  </View>
                ) : null}
              </View>
              <Txt center weight="medium">{t('punch_photo_hint')}</Txt>
              <Txt variant="caption" tone="muted" center>{t('punch_camera_why')}</Txt>
            </View>
          ) : camPerm ? (
            <View style={{ gap: space.sm }}>
              <Notice tone="info" icon="camera-outline" text={t(camPerm.canAskAgain ? 'punch_need_camera' : 'punch_camera_blocked')} />
              <Txt variant="label" tone="muted">{t('punch_camera_why')}</Txt>
            </View>
          ) : (
            <Skeleton height={320} radius={radius.lg} />
          )
        ) : null}
        {sending ? <Notice tone="info" icon="time-outline" text={t('punch_sending_wait')} /> : null}
        {!problem && (step === 'checks' || step === 'biometric') ? (
          <Txt variant="caption" tone="muted" center>{t('home_server_decides')}</Txt>
        ) : null}
        <Gap size={space.sm} />
      </Screen>
    </>
  );

  function resultView(o: PunchOutcome) {
    if (o.kind === 'error') {
      const minutes = minutesUntil(o.unlockAt);
      const key = o.code === 'locked' && minutes === 0 ? 'punch_reason_locked' : errorKey(o.code, hasKey);
      return (
        <Card>
          <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
            {resultIcon(false)}
            <Txt variant="title" center>{t('punch_rejected')}</Txt>
            <Txt center testID="punch-reason">{t(key, { minutes: Math.max(minutes, 1) })}</Txt>
            {o.code !== 'locked' ? <Txt variant="caption" tone="muted" center>{t('punch_nothing_recorded')}</Txt> : null}
          </View>
        </Card>
      );
    }
    const site = o.site ? (lang === 'ar' ? o.site.ar : o.site.en || o.site.ar) : null;
    const ok = o.kind === 'accepted';
    const mins = resultMinutes(o);
    return (
      <Card>
        <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
          {resultIcon(ok)}
          <Txt variant="title" center>
            {ok ? t(o.punchType === 'check_out' ? 'punch_out_success' : 'punch_in_success') : t('punch_rejected')}
          </Txt>
          <Txt variant="label" tone="muted" center>{t(o.punchType === 'check_out' ? 'out_label' : 'in_label')}</Txt>
          <Txt variant="display" numeric center>{hm(o.punchedAt)}</Txt>
          <Txt variant="caption" tone="muted" center>{t('punch_server_time')}</Txt>
          <Txt tone="muted" center>{longDate(o.punchedAt, lang)}</Txt>
          {site ? (
            <Row gap={space.xs} justify="center">
              <Icon name="location-outline" size={18} tone="muted" />
              <Txt weight="medium">{site}</Txt>
            </Row>
          ) : null}
        </View>
        {ok && mins ? <Notice tone="warn" text={t(mins.key, { minutes: mins.minutes })} /> : null}
        {!ok ? (
          <View style={{ gap: space.sm }}>
            <Notice tone="danger" text={t(reasonKey(o.reason, hasKey))} />
            {o.reason === 'outside_site' && o.distanceM != null ? <Txt variant="label" tone="muted" center>{t('punch_distance', { m: o.distanceM })}</Txt> : null}
          </View>
        ) : null}
      </Card>
    );
  }

  function resultIcon(ok: boolean) {
    return (
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={ok ? 'checkmark-circle' : 'close-circle'} size={56} tone={ok ? 'ok' : 'danger'} />
      </View>
    );
  }
}
