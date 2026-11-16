// More tab: my profile, links (dashboard, assistant, notifications; approvals and employee lookup for
// supervisors, HR and the admin, as in the old app), language and theme, privacy text, version, sign out.
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Header, Icon, ListRow, Row, Screen, Section, Segmented, Txt } from '../../../components/ui';
import type { Role } from '../../../lib/auth';
import { useSession } from '../../../lib/session';
import { useSettings, type ThemeMode } from '../../../lib/settings';
import type { Lang } from '../../../lib/i18n';
import { fonts, space } from '../../../lib/theme';

const ROLE_KEY: Record<Role, string> = {
  employee: 'more_role_employee',
  supervisor: 'more_role_supervisor',
  hr: 'more_role_hr',
  admin: 'more_role_admin',
};

function appVersion(): string {
  const v = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '';
  const build = Application.nativeBuildVersion;
  return build ? `${v} (${build})` : v;
}

export default function MoreScreen() {
  const { t, lang, theme, update, c } = useSettings();
  const { profile, signOut } = useSession();
  const router = useRouter();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const role = profile?.role ?? 'employee';
  const staff = role !== 'employee';
  const name = (lang === 'ar' ? profile?.nameAr : profile?.nameEn) ?? '';
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('');

  const confirmSignOut = () =>
    Alert.alert(t('sign_out'), t('more_sign_out_confirm'), [
      { text: t('no'), style: 'cancel' },
      {
        text: t('sign_out'),
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);

  const links: { key: string; icon: Parameters<typeof ListRow>[0]['icon']; title: string; subtitle: string; href: string }[] = [
    { key: 'dashboard', icon: 'stats-chart-outline', title: t('dash_title'), subtitle: t('more_dashboard_hint'), href: '/dashboard' },
    { key: 'assistant', icon: 'chatbubbles-outline', title: t('assistant_title'), subtitle: t('more_assistant_hint'), href: '/assistant' },
    { key: 'notifications', icon: 'notifications-outline', title: t('notifications'), subtitle: t('more_notifications_hint'), href: '/notifications' },
    ...(staff
      ? [
          { key: 'approvals', icon: 'checkmark-done-outline' as const, title: t('approvals'), subtitle: t('more_approvals_hint'), href: '/approvals' },
          { key: 'lookup', icon: 'people-outline' as const, title: t('employee_record'), subtitle: t('more_lookup_hint'), href: '/lookup' },
        ]
      : []),
  ];

  return (
    <>
      <Header title={t('tab_more')} big />
      <Screen>
        <Card testID="profile-card">
          <Row gap={space.md}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#0B1A33', alignItems: 'center', justifyContent: 'center' }}>
              {initials ? (
                <Txt variant="heading" center style={{ color: '#E6C878', fontFamily: fonts.bold }}>{initials}</Txt>
              ) : (
                <Icon name="person" color="#E6C878" />
              )}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="heading" numberOfLines={2}>{name}</Txt>
              <Row gap={space.xs}>
                <Txt variant="label" tone="muted">{t('file_no_label')}</Txt>
                <Txt variant="label" tone="muted" numeric weight="bold">{String(profile?.fileNumber ?? '')}</Txt>
              </Row>
              <Badge label={t(ROLE_KEY[role])} tone={staff ? 'info' : 'neutral'} icon={staff ? 'shield-checkmark-outline' : 'person-outline'} />
            </View>
          </Row>
        </Card>

        <Section title={t('more_services')}>
          <Card padded={false}>
            {links.map((l, i) => (
              <ListRow
                key={l.key}
                testID={`more-${l.key}`}
                icon={l.icon}
                title={l.title}
                subtitle={l.subtitle}
                onPress={() => router.push(l.href)}
                last={i === links.length - 1}
              />
            ))}
          </Card>
        </Section>

        <Section title={t('settings')}>
          <Card>
            <View style={{ gap: space.md }}>
              <Row gap={space.sm}>
                <Icon name="language-outline" size={20} tone="muted" />
                <Txt weight="medium">{t('language')}</Txt>
              </Row>
              <Segmented<Lang>
                options={[
                  { value: 'ar', label: t('more_lang_ar') },
                  { value: 'en', label: t('more_lang_en') },
                ]}
                value={lang}
                onChange={(v) => update({ lang: v })}
              />
              <Row gap={space.sm} style={{ marginTop: space.sm }}>
                <Icon name={theme === 'dark' ? 'moon-outline' : 'sunny-outline'} size={20} tone="muted" />
                <Txt weight="medium">{t('theme')}</Txt>
              </Row>
              <Segmented<ThemeMode>
                options={[
                  { value: 'light', label: t('light') },
                  { value: 'dark', label: t('dark') },
                ]}
                value={theme}
                onChange={(v) => update({ theme: v })}
              />
            </View>
          </Card>
        </Section>

        <Section title={t('more_about')}>
          <Card padded={false}>
            <ListRow
              testID="more-privacy"
              icon="shield-checkmark-outline"
              title={t('more_privacy')}
              onPress={() => setPrivacyOpen((o) => !o)}
              trailing={<Icon name={privacyOpen ? 'chevron-up' : 'chevron-down'} size={18} tone="muted" />}
              last={!privacyOpen}
            />
            {privacyOpen ? (
              <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
                <Txt weight="bold">{t('consent_title')}</Txt>
                <Txt tone="muted">{t('consent_body_sanad')}</Txt>
              </View>
            ) : null}
            <ListRow icon="information-circle-outline" title={t('more_version')} trailing={<Txt numeric tone="muted">{appVersion()}</Txt>} last />
          </Card>
        </Section>

        <Button label={t('sign_out')} icon="log-out-outline" kind="danger" onPress={confirmSignOut} loading={signingOut} testID="sign-out" />
      </Screen>
    </>
  );
}
