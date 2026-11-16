// A password field with a show/hide button inside the border. Same look as the kit's `Field`
// (which has no trailing accessory), built from the same tokens.
import { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { useSettings } from '../../lib/settings';
import { fonts, radius, space, TOUCH, type } from '../../lib/theme';
import { IconButton, Txt, useDir } from '../ui';

type Props = Omit<TextInputProps, 'ref'> & {
  label: string;
  error?: string | null;
  helper?: string;
  /** Text is shown instead of dots. */
  visible: boolean;
  onToggleVisible?: () => void;
};

export const PasswordField = forwardRef<TextInputInstance, Props>(function PasswordField(
  { label, error, helper, visible, onToggleVisible, ...input },
  ref,
) {
  const { c, t } = useSettings();
  const d = useDir();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="label" weight="medium">{label}</Txt>
      <View
        style={{
          flexDirection: d.row,
          alignItems: 'center',
          minHeight: TOUCH + 4,
          borderRadius: radius.sm,
          borderWidth: focused ? 2 : 1,
          borderColor: error ? c.danger : focused ? c.accent : c.line,
          backgroundColor: c.surface,
        }}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          {...input}
          secureTextEntry={!visible}
          onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
          accessibilityLabel={label}
          style={[
            type.body,
            {
              flex: 1,
              minHeight: TOUCH,
              paddingHorizontal: space.md,
              paddingVertical: 0,
              fontFamily: fonts.regular,
              color: c.text,
              textAlign: d.align,
            },
          ]}
        />
        {onToggleVisible ? (
          <IconButton
            icon={visible ? 'eye-off-outline' : 'eye-outline'}
            label={t(visible ? 'auth_hide_password' : 'auth_show_password')}
            onPress={onToggleVisible}
            color={c.muted}
          />
        ) : null}
      </View>
      {error ? <Txt variant="caption" tone="danger">{error}</Txt> : helper ? <Txt variant="caption" tone="muted">{helper}</Txt> : null}
    </View>
  );
});
