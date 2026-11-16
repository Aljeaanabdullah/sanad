// Sanad component kit (see apps/mobile/DESIGN.md). Every screen builds from these so spacing,
// type, colour and right-to-left behave the same everywhere. Layouts read `rtl` from settings
// (Arabic) instead of the OS direction, so switching language needs no restart.
import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSettings } from '../lib/settings';
import { fonts, radius, space, TOUCH, type, type Palette } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------- direction

/** Row direction, text alignment and start/end helpers for the current language. */
export function useDir() {
  const { rtl } = useSettings();
  return {
    rtl,
    row: (rtl ? 'row-reverse' : 'row') as ViewStyle['flexDirection'],
    align: (rtl ? 'right' : 'left') as TextStyle['textAlign'],
    /** Cross-axis alignment for the reading start (right in Arabic). */
    start: (rtl ? 'flex-end' : 'flex-start') as ViewStyle['alignItems'],
    writing: (rtl ? 'rtl' : 'ltr') as TextStyle['writingDirection'],
    /** Icons that point "forward" (chevrons, arrows) flip in Arabic. */
    forward: (rtl ? 'chevron-back' : 'chevron-forward') as IconName,
    back: (rtl ? 'arrow-forward' : 'arrow-back') as IconName,
  };
}

// ---------------------------------------------------------------- text

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
type Tone = 'default' | 'muted' | 'primary' | 'accent' | 'ok' | 'danger' | 'onPrimary';

const weightOf: Record<Variant, string> = {
  display: fonts.black,
  title: fonts.bold,
  heading: fonts.bold,
  body: fonts.regular,
  label: fonts.medium,
  caption: fonts.regular,
};

export function toneColor(c: Palette, tone: Tone) {
  return { default: c.text, muted: c.muted, primary: c.primary, accent: c.accent, ok: c.ok, danger: c.danger, onPrimary: c.onPrimary }[tone];
}

/** Text in the Sanad type scale. `numeric` keeps digits left-to-right inside Arabic text. */
export function Txt({
  variant = 'body',
  tone = 'default',
  weight,
  center,
  numeric,
  numberOfLines,
  style,
  children,
  testID,
}: {
  variant?: Variant;
  tone?: Tone;
  weight?: 'regular' | 'medium' | 'bold' | 'black';
  center?: boolean;
  numeric?: boolean;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  testID?: string;
}) {
  const { c } = useSettings();
  const d = useDir();
  return (
    <Text
      testID={testID}
      numberOfLines={numberOfLines}
      style={[
        type[variant],
        {
          fontFamily: weight ? fonts[weight] : weightOf[variant],
          color: toneColor(c, tone),
          textAlign: center ? 'center' : d.align,
          writingDirection: numeric ? 'ltr' : d.writing,
        },
        numeric && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Icon({ name, size = 22, color, tone = 'default' }: { name: IconName; size?: number; color?: string; tone?: Tone }) {
  const { c } = useSettings();
  return <Ionicons name={name} size={size} color={color ?? toneColor(c, tone)} />;
}

// ---------------------------------------------------------------- layout

/** A row that follows the reading direction. */
export function Row({ children, gap = space.sm, align = 'center', justify, style, wrap }: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: StyleProp<ViewStyle>;
  wrap?: boolean;
}) {
  const d = useDir();
  return <View style={[{ flexDirection: d.row, alignItems: align, justifyContent: justify, gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Gap({ size = space.lg }: { size?: number }) {
  return <View style={{ height: size }} />;
}

/**
 * A screen body: background, safe-area bottom inset, 16 side gutters, optional pull-to-refresh
 * via `refreshControl`. Use `scroll={false}` for chat-like screens that manage their own list.
 */
export function Screen({ children, scroll = true, padded = true, refreshControl, contentStyle, footer }: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
  contentStyle?: StyleProp<ViewStyle>;
  /** Pinned at the bottom above the safe area (primary action of a form). */
  footer?: ReactNode;
}) {
  const { c } = useSettings();
  const insets = useSafeAreaInsets();
  const pad = padded ? { paddingHorizontal: space.lg, paddingTop: space.lg } : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: (footer ? space.lg : insets.bottom + space.xl), gap: space.lg }, contentStyle]}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: insets.bottom + space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, backgroundColor: c.bg }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Top app bar. Navy in both themes (the Sanad header). `back` shows a system-style back button;
 * `actions` go on the reading end. Pass `big` on tab roots for the large greeting header.
 */
export function Header({ title, subtitle, back, actions, big, children }: {
  title: string;
  subtitle?: string;
  back?: boolean;
  actions?: ReactNode;
  big?: boolean;
  /** Extra content inside the navy band (e.g. the punch card on Home). */
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const d = useDir();
  return (
    <View style={{ backgroundColor: '#0B1A33', paddingTop: insets.top + space.sm, paddingBottom: big ? space.xl : space.md, paddingHorizontal: space.lg }}>
      <Row gap={space.sm} style={{ minHeight: TOUCH }}>
        {back ? (
          <IconButton icon={d.back} label="back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} color="#F6F1E6" />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={[big ? type.title : type.heading, { fontFamily: fonts.bold, color: '#F6F1E6', textAlign: d.align, writingDirection: d.writing }]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[type.label, { fontFamily: fonts.regular, color: '#C9D3E3', textAlign: d.align, writingDirection: d.writing }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actions}
      </Row>
      {children ? <View style={{ marginTop: space.lg }}>{children}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------- surfaces

/** A flat white (or navy-mid in dark) card with a hairline border. Never nest cards. */
export function Card({ children, onPress, style, padded = true, accessibilityLabel, testID }: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { c } = useSettings();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.line,
    padding: padded ? space.lg : 0,
    overflow: 'hidden',
  };
  if (!onPress) return <View testID={testID} style={[base, style]}>{children}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}
    >
      {children}
    </Pressable>
  );
}

/** Section heading above a group of cards, with an optional action link on the reading end. */
export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children?: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Row justify="space-between">
        <Txt variant="heading">{title}</Txt>
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={12} accessibilityRole="link" style={{ minHeight: TOUCH, justifyContent: 'center' }}>
            <Txt variant="label" tone="accent" weight="bold">{action}</Txt>
          </Pressable>
        ) : null}
      </Row>
      {children}
    </View>
  );
}

/** One tappable row inside a card or list: icon, title, optional subtitle, trailing value or chevron. */
export function ListRow({ icon, iconTone = 'primary', title, subtitle, trailing, onPress, last, testID }: {
  icon?: IconName;
  iconTone?: Tone;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  /** Hide the bottom divider on the last row. */
  last?: boolean;
  testID?: string;
}) {
  const { c } = useSettings();
  const d = useDir();
  const body = (
    <Row gap={space.md} style={{ minHeight: 56, paddingVertical: space.md, paddingHorizontal: space.lg }}>
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} tone={iconTone} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt weight="medium" numberOfLines={2}>{title}</Txt>
        {subtitle ? <Txt variant="label" tone="muted" numberOfLines={2}>{subtitle}</Txt> : null}
      </View>
      {trailing}
      {onPress && !trailing ? <Icon name={d.forward} size={18} tone="muted" /> : null}
    </Row>
  );
  const divider = last ? null : <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginHorizontal: space.lg }} />;
  if (!onPress) return <View testID={testID}>{body}{divider}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" android_ripple={{ color: c.line }} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {body}
      {divider}
    </Pressable>
  );
}

/** A number with its label (period summary, month totals). */
export function StatTile({ value, label, tone = 'default', icon, onPress }: { value: string | number; label: string; tone?: Tone; icon?: IconName; onPress?: () => void }) {
  const { c } = useSettings();
  const content = (
    <View style={{ gap: space.xs }}>
      {icon ? <Icon name={icon} size={18} tone={tone === 'default' ? 'muted' : tone} /> : null}
      <Txt variant="title" tone={tone} numeric weight="black">{String(value)}</Txt>
      <Txt variant="caption" tone="muted" numberOfLines={2}>{label}</Txt>
    </View>
  );
  const style: ViewStyle = { flex: 1, minWidth: 96, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, padding: space.md };
  if (!onPress) return <View style={style}>{content}</View>;
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [style, pressed && { opacity: 0.8 }]}>{content}</Pressable>;
}

// ---------------------------------------------------------------- actions

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold';

/** Buttons: primary (navy, or gold-light in dark), gold (the punch-in hero), danger (punch out, reject), secondary (outlined), ghost (text). */
export function Button({ label, onPress, kind = 'primary', icon, loading, disabled, size = 'md', full = true, testID }: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg';
  full?: boolean;
  testID?: string;
}) {
  const { c } = useSettings();
  const d = useDir();
  const colors: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.primary, fg: c.onPrimary },
    gold: { bg: '#C9A24B', fg: '#0B1A33' },
    danger: { bg: c.danger, fg: c.dark ? '#0B1A33' : '#FFFFFF' },
    secondary: { bg: 'transparent', fg: c.primary, border: c.primary },
    ghost: { bg: 'transparent', fg: c.primary },
  };
  const k = colors[kind];
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={label}
      android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      style={({ pressed }) => ({
        minHeight: size === 'lg' ? 60 : TOUCH + 4,
        paddingHorizontal: space.xl,
        borderRadius: radius.md,
        backgroundColor: k.bg,
        borderWidth: k.border ? 1.5 : 0,
        borderColor: k.border,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: full ? 'stretch' : 'auto',
        opacity: off ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={k.fg} />
      ) : (
        <View style={{ flexDirection: d.row, alignItems: 'center', gap: space.sm }}>
          {icon ? <Ionicons name={icon} size={size === 'lg' ? 24 : 20} color={k.fg} /> : null}
          <Text style={[size === 'lg' ? type.heading : type.body, { fontFamily: fonts.bold, color: k.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A 48dp icon-only button; `label` is a strings.json key or plain text for screen readers. */
export function IconButton({ icon, label, onPress, color, badge }: { icon: IconName; label: string; onPress: () => void; color?: string; badge?: number }) {
  const { c, t } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === 'back' ? t('back') : label}
      hitSlop={4}
      style={({ pressed }) => ({ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: TOUCH / 2, opacity: pressed ? 0.6 : 1 })}
    >
      <Ionicons name={icon} size={24} color={color ?? c.text} />
      {badge ? (
        <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#C9A24B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: '#0B1A33' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Choice chips (filters, leave type). Selected = filled primary. */
export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const { c } = useSettings();
  const d = useDir();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!selected }}
      style={{
        minHeight: 40,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? c.primary : c.line,
        backgroundColor: selected ? c.primary : c.surface,
        flexDirection: d.row,
        alignItems: 'center',
        gap: space.xs,
      }}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? c.onPrimary : c.muted} /> : null}
      <Text style={[type.label, { fontFamily: fonts.medium, color: selected ? c.onPrimary : c.text }]}>{label}</Text>
    </Pressable>
  );
}

/** A segmented control for 2–4 options (month / period, Arabic / English, light / dark). */
export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const { c } = useSettings();
  const d = useDir();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: d.row, backgroundColor: c.surfaceAlt, borderRadius: radius.sm + 2, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface : 'transparent' }}
          >
            <Text style={[type.label, { fontFamily: on ? fonts.bold : fonts.medium, color: on ? c.text : c.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- status

type BadgeTone = 'ok' | 'danger' | 'warn' | 'info' | 'neutral';

/** A small status pill (accepted / rejected / pending / eligible...). Text always says the state; colour only supports it. */
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: BadgeTone; icon?: IconName }) {
  const { c } = useSettings();
  const d = useDir();
  const map: Record<BadgeTone, { bg: string; fg: string }> = c.dark
    ? { ok: { bg: '#163A2C', fg: '#7FD1A8' }, danger: { bg: '#3D1C22', fg: '#FF8A80' }, warn: { bg: '#3B3016', fg: '#F2C96B' }, info: { bg: '#16304F', fg: '#90C2F5' }, neutral: { bg: c.surfaceAlt, fg: c.muted } }
    : { ok: { bg: '#E3F2EA', fg: '#1F6B4A' }, danger: { bg: '#FBE7E7', fg: '#A31F1F' }, warn: { bg: '#FBF0D6', fg: '#7A5600' }, info: { bg: '#E3EEFA', fg: '#0F4F99' }, neutral: { bg: c.surfaceAlt, fg: c.muted } };
  const k = map[tone];
  return (
    <View style={{ flexDirection: d.row, alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: k.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      {icon ? <Ionicons name={icon} size={13} color={k.fg} /> : null}
      <Text style={[type.caption, { fontFamily: fonts.bold, color: k.fg }]}>{label}</Text>
    </View>
  );
}

/** Shimmer-free skeleton block (respects reduced motion by not animating). */
export function Skeleton({ height = 16, width = '100%', radius: r = 8, style }: { height?: number; width?: ViewStyle['width']; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useSettings();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View accessibilityLabel="loading" style={[{ height, width, borderRadius: r, backgroundColor: c.surfaceAlt, opacity: pulse }, style]} />;
}

/** A card-shaped skeleton for list placeholders. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <Skeleton height={18} width="55%" />
        {Array.from({ length: lines }, (_, i) => <Skeleton key={i} height={12} width={i === lines - 1 ? '35%' : '85%'} />)}
      </View>
    </Card>
  );
}

/** Nothing to show yet: icon, one line that says why, optional action. */
export function EmptyState({ icon, title, body, action, onAction }: { icon: IconName; title: string; body?: string; action?: string; onAction?: () => void }) {
  const { c } = useSettings();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm }}>
        <Icon name={icon} size={30} tone="muted" />
      </View>
      <Txt variant="heading" center>{title}</Txt>
      {body ? <Txt tone="muted" center>{body}</Txt> : null}
      {action && onAction ? <View style={{ marginTop: space.md, alignSelf: 'stretch' }}><Button label={action} onPress={onAction} kind="secondary" /></View> : null}
    </View>
  );
}

/** Load failed: says what happened and offers retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useSettings();
  return <EmptyState icon="cloud-offline-outline" title={message} action={onRetry ? t('retry') : undefined} onAction={onRetry} />;
}

/** An inline notice inside a form or card (warning, info, error). Full tinted background, no side stripe. */
export function Notice({ tone = 'info', text, icon }: { tone?: BadgeTone; text: string; icon?: IconName }) {
  const { c } = useSettings();
  const map: Record<BadgeTone, { bg: string; fg: string; icon: IconName }> = c.dark
    ? { ok: { bg: '#163A2C', fg: '#BFE8D3', icon: 'checkmark-circle' }, danger: { bg: '#3D1C22', fg: '#FFC9C4', icon: 'alert-circle' }, warn: { bg: '#3B3016', fg: '#F7E0A6', icon: 'warning' }, info: { bg: '#16304F', fg: '#C7DFF8', icon: 'information-circle' }, neutral: { bg: c.surfaceAlt, fg: c.text, icon: 'information-circle' } }
    : { ok: { bg: '#E3F2EA', fg: '#1F4F3A', icon: 'checkmark-circle' }, danger: { bg: '#FBE7E7', fg: '#7F1717', icon: 'alert-circle' }, warn: { bg: '#FBF0D6', fg: '#5C4100', icon: 'warning' }, info: { bg: '#E3EEFA', fg: '#0D3D75', icon: 'information-circle' }, neutral: { bg: c.surfaceAlt, fg: c.text, icon: 'information-circle' } };
  const k = map[tone];
  return (
    <Row gap={space.sm} align="flex-start" style={{ backgroundColor: k.bg, borderRadius: radius.sm, padding: space.md }}>
      <Ionicons name={icon ?? k.icon} size={20} color={k.fg} />
      <Text style={[type.label, { flex: 1, fontFamily: fonts.medium, color: k.fg, textAlign: useDir().align }]}>{text}</Text>
    </Row>
  );
}

// ---------------------------------------------------------------- inputs

/** Labelled text field with helper or error text below. */
export function Field({ label, error, helper, ...input }: TextInputProps & { label: string; error?: string | null; helper?: string }) {
  const { c } = useSettings();
  const d = useDir();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="label" weight="medium">{label}</Txt>
      <TextInput
        placeholderTextColor={c.muted}
        {...input}
        onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
        accessibilityLabel={label}
        style={[
          type.body,
          {
            fontFamily: fonts.regular,
            color: c.text,
            minHeight: TOUCH + 4,
            paddingHorizontal: space.md,
            paddingVertical: input.multiline ? space.md : 0,
            borderRadius: radius.sm,
            borderWidth: focused ? 2 : 1,
            borderColor: error ? c.danger : focused ? c.accent : c.line,
            backgroundColor: c.surface,
            textAlign: d.align,
            textAlignVertical: input.multiline ? 'top' : 'center',
          },
          input.multiline && { minHeight: 110 },
          input.style,
        ]}
      />
      {error ? <Txt variant="caption" tone="danger">{error}</Txt> : helper ? <Txt variant="caption" tone="muted">{helper}</Txt> : null}
    </View>
  );
}

/** A field-looking button that opens a picker (date, time, site). */
export function PickerField({ label, value, placeholder, icon = 'calendar-outline', onPress, error }: { label: string; value?: string | null; placeholder: string; icon?: IconName; onPress: () => void; error?: string | null }) {
  const { c } = useSettings();
  return (
    <View style={{ gap: space.xs }}>
      <Txt variant="label" weight="medium">{label}</Txt>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        style={{ minHeight: TOUCH + 4, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: error ? c.danger : c.line, backgroundColor: c.surface, justifyContent: 'center' }}
      >
        <Row gap={space.sm}>
          <Icon name={icon} size={20} tone="muted" />
          <Txt tone={value ? 'default' : 'muted'} style={{ flex: 1 }}>{value ?? placeholder}</Txt>
        </Row>
      </Pressable>
      {error ? <Txt variant="caption" tone="danger">{error}</Txt> : null}
    </View>
  );
}

// ---------------------------------------------------------------- snackbar

type Snack = { text: string; tone: 'ok' | 'danger' | 'info' };
const SnackCtx = createContext<(text: string, tone?: Snack['tone']) => void>(() => {});

/** Transient feedback ("request sent") at the bottom; replaces success dialogs. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<Snack | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback(
    (text: string, tone: Snack['tone'] = 'info') => {
      if (timer.current) clearTimeout(timer.current);
      setSnack({ text, tone });
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setSnack(null));
      }, 3200);
    },
    [anim],
  );
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const icon: Record<Snack['tone'], IconName> = { ok: 'checkmark-circle', danger: 'alert-circle', info: 'information-circle' };
  const color: Record<Snack['tone'], string> = { ok: '#7FD1A8', danger: '#FF8A80', info: '#E6C878' };
  return (
    <SnackCtx.Provider value={show}>
      {children}
      {snack ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={{
            position: 'absolute', left: space.lg, right: space.lg, bottom: insets.bottom + 72,
            opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          }}
        >
          <SnackBody text={snack.text} icon={icon[snack.tone]} color={color[snack.tone]} />
        </Animated.View>
      ) : null}
    </SnackCtx.Provider>
  );
}

function SnackBody({ text, icon, color }: { text: string; icon: IconName; color: string }) {
  const d = useDir();
  return (
    <View style={{ flexDirection: d.row, alignItems: 'center', gap: space.sm, backgroundColor: '#13274A', borderRadius: radius.sm, paddingHorizontal: space.lg, paddingVertical: space.md, elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[type.label, { flex: 1, fontFamily: fonts.medium, color: '#F6F1E6', textAlign: d.align }]}>{text}</Text>
    </View>
  );
}

export const useSnackbar = () => useContext(SnackCtx);
