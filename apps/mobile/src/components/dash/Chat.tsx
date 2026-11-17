// Chat pieces for "Ask Sanad": a message bubble and the input bar. The kit's Field has a label above
// it, which a chat bar does not want, so the bar is drawn here with the same tokens.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSettings } from '../../lib/settings';
import { brand, fonts, radius, space, TOUCH, type } from '../../lib/theme';
import { Icon, Row, Txt, useDir } from '../ui';

export function ChatBubble({ mine, text, children, testID }: { mine: boolean; text: string; children?: ReactNode; testID?: string }) {
  const { c, t } = useSettings();
  const d = useDir();
  // Mine sits on the reading end, Sanad's replies on the reading start.
  const side = mine === d.rtl ? 'flex-start' : 'flex-end';
  return (
    <View testID={testID} style={{ alignSelf: side, maxWidth: '86%' }} accessible accessibilityLabel={mine ? `${t('asst_you')}: ${text}` : `${t('app_name')}: ${text}`}>
      <Row gap={space.sm} align="flex-end">
        {!mine ? (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: brand.rail, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles-outline" size={16} color={brand.railDot} />
          </View>
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
          <Txt tone={mine ? 'onPrimary' : 'default'}>{text}</Txt>
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
