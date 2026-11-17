// The animated Sanad mark: the Sanad bot's head on a rail-teal disc (owner decision 2026-11-17).
// It is the face of "the assistant that answers you":
//   idle     the eyes blink every few seconds and the antenna disc glows softly (nothing bounces);
//   opening  on press: a quick ripple and a bright antenna, then `onOpened` runs (300 ms, under 400);
//   thinking while a reply is on its way: the antenna pulses (the chat bubble shows typing dots);
//   still    no motion.
// The head is three image layers drawn by tools/sanad-bot (base, eyes, antenna halo), so only
// opacity and transforms move, all on the native driver (60 fps). With the system's reduce-motion
// setting on, the mark is static and `opening` calls `onOpened` at once.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, View } from 'react-native';
import { useSettings } from '../../lib/settings';
import { brand } from '../../lib/theme';

export type SanadMarkState = 'idle' | 'opening' | 'thinking' | 'still';

const BASE = require('../../../assets/bot/mark-base.png');
const EYES = require('../../../assets/bot/mark-eyes.png');
const HALO = require('../../../assets/bot/mark-halo.png');
// Where the eyes and the antenna disc sit on the layers (tools/sanad-bot/svg/mark-geometry.json).
const EYES_Y = '55.22%';
const ANTENNA_Y = '28.89%';
const OPEN_MS = 280; // ripple; onOpened follows 20 ms later (300 ms in all)

/** True while the system asks for reduced motion (follows changes while the app runs). */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.()).then((v) => live && setReduce(!!v), () => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

export function SanadMark({ size = 64, state = 'idle', onOpened, testID }: { size?: number; state?: SanadMarkState; onOpened?: () => void; testID?: string }) {
  const { c } = useSettings();
  const reduce = useReduceMotion();
  const fill = c.dark ? brand.railOn : brand.rail;
  const blink = useRef(new Animated.Value(1)).current; // eyes' vertical scale
  const glow = useRef(new Animated.Value(0.35)).current; // antenna halo opacity
  const ripple = useRef(new Animated.Value(0)).current;
  const opened = useRef(onOpened);
  opened.current = onOpened;

  useEffect(() => {
    const anims: Animated.CompositeAnimation[] = [];
    const run = (a: Animated.CompositeAnimation) => {
      anims.push(a);
      a.start();
    };
    const t = (v: Animated.Value, toValue: number, duration: number, easing = Easing.inOut(Easing.sin)) =>
      Animated.timing(v, { toValue, duration, easing, useNativeDriver: true });
    blink.setValue(1);
    ripple.setValue(0);
    glow.setValue(0.35);

    if (state === 'opening') {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        opened.current?.();
      };
      if (reduce) {
        finish();
        return;
      }
      run(Animated.parallel([t(ripple, 1, OPEN_MS - 20, Easing.out(Easing.quad)), t(glow, 1, 140, Easing.out(Easing.quad))]));
      // Open right after the ripple (a timer, so a dropped frame never delays it).
      const timer = setTimeout(finish, OPEN_MS + 20);
      return () => {
        clearTimeout(timer);
        anims.forEach((a) => a.stop());
      };
    }
    if (reduce || state === 'still') return;

    if (state === 'thinking') {
      // The antenna pulses while Sanad prepares the reply.
      run(Animated.loop(Animated.sequence([t(glow, 1, 420), t(glow, 0.25, 520)])));
    } else {
      // A blink every few seconds (a double blink now and then), and a slow breath on the antenna.
      const close = (ms = 70) => t(blink, 0.08, ms, Easing.in(Easing.quad));
      const open = (ms = 110) => t(blink, 1, ms, Easing.out(Easing.quad));
      run(
        Animated.loop(
          Animated.sequence([
            Animated.delay(3800),
            close(),
            open(),
            Animated.delay(5200),
            close(),
            open(90),
            Animated.delay(120),
            close(),
            open(),
          ]),
        ),
      );
      run(Animated.loop(Animated.sequence([Animated.delay(1600), t(glow, 0.95, 1200), t(glow, 0.35, 1500)])));
    }
    return () => anims.forEach((a) => a.stop());
  }, [state, reduce, blink, glow, ripple]);

  const layer = { position: 'absolute' as const, width: size, height: size };
  return (
    <View testID={testID} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: fill, overflow: 'hidden' }}>
        {/* Press ripple. */}
        <Animated.View
          pointerEvents="none"
          style={{
            ...layer,
            borderRadius: size / 2,
            backgroundColor: '#ffffff',
            opacity: ripple.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.3, 0] }),
            transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.25] }) }],
          }}
        />
        <Animated.Image
          source={HALO}
          style={{
            ...layer,
            opacity: glow,
            transformOrigin: `50% ${ANTENNA_Y}`,
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.1] }) }],
          }}
        />
        <Image source={BASE} style={layer} />
        <Animated.Image source={EYES} style={{ ...layer, transformOrigin: `50% ${EYES_Y}`, transform: [{ scaleY: blink }] }} />
      </View>
    </View>
  );
}
