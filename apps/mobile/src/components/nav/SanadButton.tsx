// The Sanad button (PRD 18.2, owner decision 2026-11-17): one round button at the bottom centre that
// opens the assistant. It is a deep-teal disc ringed with small enamel discs like the Kuwait Towers'
// sequins, with the Sanad handshake logo in its middle, and a ring of the screen ground so it stands off the content.
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../../lib/settings';
import { brand, SANAD_BUTTON, SANAD_BUTTON_HALO, SANAD_BUTTON_LIFT } from '../../lib/theme';
import { BrandMark } from '../auth/Brand';

const SEQUINS = 12;
const SEQUIN = 5;
// The three enamel hues of the ring, repeating around it.
const HUES = [brand.railDot, brand.turquoise, '#a6cbc7'];

export function SanadButton({ onPress }: { onPress: () => void }) {
  const { c, t } = useSettings();
  const insets = useSafeAreaInsets();
  const size = SANAD_BUTTON;
  const halo = SANAD_BUTTON_HALO;
  const ring = size / 2 - SEQUIN - 2; // distance of each sequin's centre from the button's centre
  // Rail teal by day; one step lighter at night so it still stands off the dark ground.
  const fill = c.dark ? brand.railOn : brand.rail;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + SANAD_BUTTON_LIFT, alignItems: 'center' }}>
      <Pressable
        testID="sanad-button"
        onPress={onPress}
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
          transform: [{ scale: pressed ? 0.95 : 1 }],
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: c.dark ? 0.45 : 0.18,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        })}
      >
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: fill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {Array.from({ length: SEQUINS }, (_, i) => {
            const a = (i / SEQUINS) * Math.PI * 2;
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  width: SEQUIN,
                  height: SEQUIN,
                  borderRadius: SEQUIN / 2,
                  backgroundColor: HUES[i % HUES.length],
                  left: size / 2 + ring * Math.cos(a) - SEQUIN / 2,
                  top: size / 2 + ring * Math.sin(a) - SEQUIN / 2,
                }}
              />
            );
          })}
          <BrandMark size={34} decorative />
        </View>
      </Pressable>
    </View>
  );
}
