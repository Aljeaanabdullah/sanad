// A bottom sheet for the requests group (site picker, decision note, iOS date picker, new request).
// The kit has no sheet yet; this one uses kit tokens and components only.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../../lib/settings';
import { radius, space } from '../../lib/theme';
import { IconButton, Row, Txt } from '../ui';

export function Sheet({ visible, onClose, title, children, tall }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Take most of the screen height (long lists). */
  tall?: boolean;
}) {
  const { c, t } = useSettings();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,37,40,0.55)' }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />
        <View
          style={{
            backgroundColor: c.bg,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingBottom: insets.bottom + space.md,
            maxHeight: '90%',
            height: tall ? '85%' : undefined,
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: space.sm }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.line }} />
          </View>
          <Row style={{ paddingHorizontal: space.lg, paddingTop: space.xs }}>
            <View style={{ flex: 1 }}>
              <Txt variant="heading">{title}</Txt>
            </View>
            <IconButton icon="close" label={t('close')} onPress={onClose} />
          </Row>
          <View style={{ paddingHorizontal: space.lg, gap: space.md, flexShrink: 1, flexGrow: tall ? 1 : 0 }}>{children}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
