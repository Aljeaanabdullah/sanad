// The Sanad button (PRD 18.2, owner decision 2026-11-17): one round button at the bottom centre that
// opens the assistant. It shows the animated Sanad bot (SanadMark): at rest it blinks and its antenna
// glows softly; on press a quick ripple, then the assistant opens (about 300 ms). A ring of the screen ground around it keeps it apart from the content.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../../lib/settings';
import { SANAD_BUTTON, SANAD_BUTTON_HALO, SANAD_BUTTON_LIFT } from '../../lib/theme';
import { SanadMark, type SanadMarkState } from './SanadMark';

export function SanadButton({ onPress }: { onPress: () => void }) {
  const { c, t } = useSettings();
  const insets = useSafeAreaInsets();
  const size = SANAD_BUTTON;
  const halo = SANAD_BUTTON_HALO;
  const [state, setState] = useState<SanadMarkState>('idle');
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (reset.current) clearTimeout(reset.current);
    },
    [],
  );

  const opened = useCallback(() => {
    onPress();
    // If the button is still on screen afterwards, let the ring open again.
    reset.current = setTimeout(() => setState('idle'), 600);
  }, [onPress]);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + SANAD_BUTTON_LIFT, alignItems: 'center' }}>
      <Pressable
        testID="sanad-button"
        onPress={() => setState('opening')}
        disabled={state === 'opening'}
        accessibilityRole="button"
        accessibilityLabel={t('sanad_button')}
        accessibilityHint={t('sanad_button_hint')}
        hitSlop={6}
        style={({ pressed }) => ({
          width: size + halo * 2,
          height: size + halo * 2,
          borderRadius: (size + halo * 2) / 2,
          backgroundColor: c.bg,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pressed ? 0.96 : 1 }],
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: c.dark ? 0.45 : 0.18,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        })}
      >
        <SanadMark size={size} state={state} onOpened={opened} testID="sanad-mark" />
      </Pressable>
    </View>
  );
}
