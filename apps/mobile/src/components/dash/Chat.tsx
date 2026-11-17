// Chat pieces for "Ask Sanad": a message bubble and the input bar. The kit's Field has a label above
// it, which a chat bar does not want, so the bar is drawn here with the same tokens.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSettings } from '../../lib/settings';
import { fonts, radius, space, TOUCH, type } from '../../lib/theme';
import { SanadMark, useReduceMotion } from '../nav/SanadMark';
import { Row, Txt, useDir } from '../ui';

/** Three dots that bounce one after another, like typing (static with reduce motion). */
export function TypingDots() {
  const reduce = useReduceMotion();
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduce) return;
    const hop = (v: Animated.Value) =>
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]);
    const loop = Animated.loop(Animated.sequence([Animated.stagger(140, dots.map(hop)), Animated.delay(220)]));
    loop.start();
    return () => loop.stop();
  }, [reduce, dots]);
  const hues = ['#1fa89c', '#5fd3c6', '#a8ece4'];
  return (
    <View testID="typing-dots" style={{ flexDirection: 'row', gap: 6, paddingVertical: 4 }}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: hues[i], transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }}
        />
      ))}
    </View>
  );
}

/** One message. Sanad's replies carry the Sanad bot; while `thinking` its antenna pulses and the bubble shows typing dots. */
export function ChatBubble({ mine, text, children, testID, thinking }: { mine: boolean; text: string; children?: ReactNode; testID?: string; thinking?: boolean }) {
  const { c, t } = useSettings();
  const d = useDir();
  // Mine sits on the reading end, Sanad's replies on the reading start.
  const side = mine === d.rtl ? 'flex-start' : 'flex-end';
  return (
    <View testID={testID} style={{ alignSelf: side, maxWidth: '86%' }} accessible accessibilityLabel={mine ? `${t('asst_you')}: ${text}` : `${t('app_name')}: ${text}`}>
      <Row gap={space.sm} align="flex-end">
        {!mine ? (
          <SanadMark size={32} state={thinking ? 'thinking' : 'still'} testID={thinking ? 'sanad-thinking' : undefined} />
        ) : null}
        <View
          style={{
            flexShrink: 1,
            backgroundColor: mine ? c.primary : c.surface,
            borderWidth: mine ? 0 : StyleSheet.hairlineWidth,
            borderColor: c.line,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            paddingVertical: space.sm + 2,
            gap: space.sm,
          }}
        >
          {/* While thinking: typing dots, with the words small under them. */}
          {thinking ? (
            <View style={{ gap: 2 }}>
              <TypingDots />
              <Txt variant="caption" tone="muted">{text}</Txt>
            </View>
          ) : (
            <Txt tone={mine ? 'onPrimary' : 'default'}>{text}</Txt>
          )}
          {children}
        </View>
      </Row>
    </View>
  );
}

export function ChatInput({ onSend, placeholder, sendLabel }: { onSend: (text: string) => void; placeholder: string; sendLabel: string }) {
  const { c } = useSettings();
  const d = useDir();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const send = () => {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText('');
  };
  const empty = text.trim().length === 0;
  return (
    <Row gap={space.sm}>
      <TextInput
        testID="assistant-input"
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        accessibilityLabel={placeholder}
        maxLength={200}
        returnKeyType="send"
        submitBehavior="submit"
        style={[
          type.body,
          {
            flex: 1,
            minHeight: TOUCH,
            paddingHorizontal: space.lg,
            borderRadius: radius.pill,
            borderWidth: focused ? 2 : 1,
            borderColor: focused ? c.primary : c.control,
            backgroundColor: c.surface,
            color: c.text,
            fontFamily: fonts.regular,
            textAlign: d.align,
          },
        ]}
      />
      <Pressable
        testID="assistant-send"
        onPress={send}
        disabled={empty}
        accessibilityRole="button"
        accessibilityLabel={sendLabel}
        accessibilityState={{ disabled: empty }}
        style={({ pressed }) => ({
          width: TOUCH,
          height: TOUCH,
          borderRadius: TOUCH / 2,
          backgroundColor: c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: empty ? 0.45 : pressed ? 0.8 : 1,
        })}
      >
        {/* The paper plane points along the reading direction. */}
        <View style={{ transform: [{ scaleX: d.rtl ? -1 : 1 }] }}>
          <Ionicons name="send" size={20} color={c.onPrimary} />
        </View>
      </Pressable>
    </Row>
  );
}
