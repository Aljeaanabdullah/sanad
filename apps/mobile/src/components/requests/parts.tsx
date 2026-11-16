// Small building blocks shared by the requests screens.
import { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RequestItem, SiteOption } from '../../lib/api';
import { requestSummary, requestTitle, searchSites, statusView, typeIcon, validateNote, NOTE_MAX } from '../../lib/requestsView';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { Badge, Button, EmptyState, Field, Icon, IconButton, ListRow, Notice, Row, Txt, useDir, type IconName } from '../ui';
import { Sheet } from './Sheet';

/** One request in a list: type icon, title, dates, status badge. */
export function RequestRow({ item, onPress, last }: { item: RequestItem; onPress: () => void; last?: boolean }) {
  const { t, lang } = useSettings();
  const st = statusView(item.status);
  return (
    <ListRow
      testID={`request-${item.id}`}
      icon={typeIcon(item.type) as IconName}
      title={requestTitle(item, t)}
      subtitle={requestSummary(item, t, lang)}
      trailing={<Badge label={t(st.key)} tone={st.tone} />}
      onPress={onPress}
      last={last}
    />
  );
}

/** A searchable list of mission sites in a sheet. */
export function SiteSheet({ visible, sites, selected, onSelect, onClose }: {
  visible: boolean;
  sites: SiteOption[];
  selected: string | null;
  onSelect: (s: SiteOption) => void;
  onClose: () => void;
}) {
  const { t, lang } = useSettings();
  const [q, setQ] = useState('');
  const shown = useMemo(() => searchSites(sites, q), [sites, q]);
  return (
    <Sheet visible={visible} onClose={onClose} title={t('choose_site')} tall>
      <Field label={t('search')} value={q} onChangeText={setQ} placeholder={t('req_site_search')} autoCorrect={false} returnKeyType="search" />
      <FlatList
        data={shown}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="search-outline" title={t('req_site_none')} />}
        renderItem={({ item, index }) => (
          <ListRow
            icon="location-outline"
            title={lang === 'ar' ? item.nameAr : item.nameEn}
            subtitle={lang === 'ar' ? item.nameEn : item.nameAr}
            trailing={item.id === selected ? <Icon name="checkmark-circle" tone="accent" /> : undefined}
            onPress={() => {
              onSelect(item);
              setQ('');
            }}
            last={index === shown.length - 1}
          />
        )}
      />
    </Sheet>
  );
}

/** Approve / reject with an optional note (as in the old app; the note is never required). */
export function DecisionSheet({ request, approve, busy, error, onConfirm, onClose }: {
  request: RequestItem | null;
  approve: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const { t, lang } = useSettings();
  const [note, setNote] = useState('');
  const noteError = validateNote(note);
  const close = () => {
    if (busy) return;
    setNote('');
    onClose();
  };
  if (!request) return null;
  const who = lang === 'ar' ? request.employeeNameAr : request.employeeNameEn;
  return (
    <Sheet visible onClose={close} title={t(approve ? 'req_approve_title' : 'req_reject_title')}>
      <View style={{ gap: space.xs }}>
        <Txt weight="bold">{requestTitle(request, t)}</Txt>
        {who ? <Txt variant="label" tone="muted">{who}</Txt> : null}
        <Txt variant="label" tone="muted">{requestSummary(request, t, lang)}</Txt>
      </View>
      <Field
        label={t('note_optional')}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={NOTE_MAX + 1}
        error={noteError ? t(noteError) : null}
        helper={t(approve ? 'req_note_hint_approve' : 'req_note_hint_reject')}
      />
      {error ? <Notice tone="danger" text={error} /> : null}
      <Button
        testID="confirmDecision"
        label={t(approve ? 'approve' : 'reject')}
        kind={approve ? 'primary' : 'danger'}
        icon={approve ? 'checkmark' : 'close'}
        loading={busy}
        disabled={!!noteError}
        onPress={() => onConfirm(note.trim())}
      />
    </Sheet>
  );
}

/** Full-screen punch photo; tap close or system Back to leave. */
export function PhotoViewer({ uri, caption, onClose }: { uri: string | null; caption?: string; onClose: () => void }) {
  const { t } = useSettings();
  const insets = useSafeAreaInsets();
  const d = useDir();
  return (
    <Modal visible={!!uri} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {uri ? (
          <Image source={{ uri }} resizeMode="contain" style={StyleSheet.absoluteFill} accessibilityLabel={caption ?? t('req_photo')} />
        ) : null}
        <View style={{ position: 'absolute', top: insets.top + space.sm, left: space.sm, right: space.sm, flexDirection: d.row, alignItems: 'center', gap: space.sm }}>
          <IconButton icon="close" label={t('close')} onPress={onClose} color="#F6F1E6" />
          {caption ? (
            <View style={{ flex: 1 }}>
              <Txt tone="onPrimary" numeric numberOfLines={2} style={{ color: '#F6F1E6' }}>{caption}</Txt>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** Previous / month name / next. `next` is hidden on the current month. */
export function MonthSwitcher({ label, onPrev, onNext, canNext }: { label: string; onPrev: () => void; onNext: () => void; canNext: boolean }) {
  const { t, rtl } = useSettings();
  const prevIcon: IconName = rtl ? 'chevron-forward' : 'chevron-back';
  const nextIcon: IconName = rtl ? 'chevron-back' : 'chevron-forward';
  return (
    <Row justify="space-between">
      <IconButton icon={prevIcon} label={t('prev_month')} onPress={onPrev} />
      <Txt variant="heading" center style={{ flex: 1 }}>{label}</Txt>
      {canNext ? <IconButton icon={nextIcon} label={t('next_month')} onPress={onNext} /> : <View style={{ width: 48 }} />}
    </Row>
  );
}

/** A label / value pair in the details card. */
export function InfoLine({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="caption" tone="muted">{label}</Txt>
      <Txt numeric={numeric}>{value}</Txt>
    </View>
  );
}

/** A pressable action tile (new request types). */
export function ActionTile({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID?: string }) {
  const { c } = useSettings();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: c.line }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 88,
        padding: space.md,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.line,
        backgroundColor: c.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} tone="primary" />
      </View>
      <Txt variant="label" weight="bold" center numberOfLines={2}>{label}</Txt>
    </Pressable>
  );
}
