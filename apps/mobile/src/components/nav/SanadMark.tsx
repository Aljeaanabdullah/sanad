// The animated Sanad mark (owner request 2026-11-17): a rail-teal disc with the handshake logo in its
// middle and a ring of small enamel discs around it, like the Kuwait Towers' sequins. It is the face of
// "the assistant that answers you":
//   idle     the ring orbits very slowly and a soft glow breathes every few seconds (no bouncing);
//   opening  on press: a quick ripple, the ring speeds up and converges into the handshake, then
//            `onOpened` runs (about 300 ms, never more than 400 ms);
//   thinking while a reply is on its way: the ring turns faster and its discs light up one after
//            another, like typing;
//   still    no motion (chat avatars).
// Only opacity and transforms move, all on the native driver (60 fps, off the JS thread). With the
// system's reduce-motion setting on, the mark is static and `opening` calls `onOpened` at once.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { useSettings } from '../../lib/settings';
import { brand } from '../../lib/theme';
import { BrandMark } from '../auth/Brand';

export type SanadMarkState = 'idle' | 'opening' | 'thinking' | 'still';

// The three enamel hues of the ring, repeating around it.
const HUES = [brand.railDot, brand.turquoise, '#a6cbc7'];
const IDLE_TURN = 24000; // ms per full turn at rest
const THINK_TURN = 5000; // ms per full turn while thinking
const OPEN_MS = 280; // converge + ripple; onOpened follows 20 ms later (300 ms in all, under 400)

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
  const count = size >= 48 ? 12 : 8;
  const dot = Math.max(2.5, size * 0.078);
  const ring = size / 2 - dot - Math.max(1.5, size * 0.03); // centre of each disc from the centre
  const fill = c.dark ? brand.railOn : brand.rail;

  const spin = useRef(new Animated.Value(0)).current; // turns (0..1 = one turn; offsets accumulate)
  const glow = useRef(new Animated.Value(0)).current;
  const converge = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const dots = useMemo(() => Array.from({ length: count }, () => new Animated.Value(1)), [count]);
  const opened = useRef(onOpened);
  opened.current = onOpened;

  useEffect(() => {
    const anims: Animated.CompositeAnimation[] = [];
    const run = (a: Animated.CompositeAnimation) => {
      anims.push(a);
      a.start();
    };
    // Keep the ring's angle when the speed changes, so it never jumps.
    spin.extractOffset();
    glow.setValue(0);
    dots.forEach((d) => d.setValue(1));

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
      converge.setValue(0);
      ripple.setValue(0);
      run(
        Animated.parallel([
          Animated.timing(ripple, { toValue: 1, duration: OPEN_MS - 20, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(converge, { toValue: 1, duration: OPEN_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(spin, { toValue: 0.6, duration: OPEN_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      );
      // Open right after the ring has folded into the handshake (a timer, so a dropped frame never delays it).
      const t = setTimeout(finish, OPEN_MS + 20);
      return () => {
        clearTimeout(t);
        anims.forEach((a) => a.stop());
      };
    }

    // Back at rest (e.g. returning to the screen): the ring is open again.
    converge.setValue(0);
    ripple.setValue(0);
    if (reduce || state === 'still') return;

    const turn = state === 'thinking' ? THINK_TURN : IDLE_TURN;
    run(Animated.loop(Animated.timing(spin, { toValue: 1, duration: turn, easing: Easing.linear, useNativeDriver: true })));

    if (state === 'thinking') {
      // Discs light up one after another around the ring, like typing.
      dots.forEach((d) => d.setValue(0.3));
      run(
        Animated.loop(
          Animated.stagger(
            70,
            dots.map((d) =>
              Animated.sequence([
                Animated.timing(d, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(d, { toValue: 0.3, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
              ]),
            ),
          ),
        ),
      );
    } else {
      // A soft breath every few seconds.
      run(
        Animated.loop(
          Animated.sequence([
            Animated.delay(2600),
            Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ),
      );
    }
    return () => anims.forEach((a) => a.stop());
  }, [state, reduce, spin, glow, converge, ripple, dots]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ringScale = converge.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  const ringOpacity = converge.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.8, 0] });
  const logoScale = converge.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1.08, 1.14] });

  return (
    <View testID={testID} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size, height: size }}>
      {/* The breathing glow, just outside the disc. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: brand.railDot,
          opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] }),
          transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: fill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* Press ripple. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: '#ffffff',
            opacity: ripple.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.35, 0] }),
            transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.25] }) }],
          }}
        />
        {/* The ring of enamel discs. */}
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', width: size, height: size, opacity: ringOpacity, transform: [{ rotate }, { scale: ringScale }] }}
        >
          {dots.map((o, i) => {
            const a = (i / count) * Math.PI * 2;
            return (
              <Animated.View
                key={i}
                style={{
                  position: 'absolute',
                  width: dot,
                  height: dot,
                  borderRadius: dot / 2,
                  backgroundColor: HUES[i % HUES.length],
                  left: size / 2 + ring * Math.cos(a) - dot / 2,
                  top: size / 2 + ring * Math.sin(a) - dot / 2,
                  opacity: o,
                }}
              />
            );
          })}
        </Animated.View>
        <Animated.View style={{ transform: [{ scale: logoScale }] }}>
          <BrandMark size={Math.round(size * 0.53)} decorative />
        </Animated.View>
      </View>
    </View>
  );
}
