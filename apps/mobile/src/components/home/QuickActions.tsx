// Home: shortcuts to the everyday tasks.
import { useRouter } from 'expo-router';
import { useSettings } from '../../lib/settings';
import { Card, ListRow, Section, type IconName } from '../ui';

const ITEMS: { href: string; icon: IconName; title: string; sub: string }[] = [
  { href: '/leave', icon: 'airplane-outline', title: 'leave_request', sub: 'home_leave_sub' },
  { href: '/assistant', icon: 'chatbubbles-outline', title: 'dash_ask', sub: 'home_ask_sub' },
  { href: '/requests', icon: 'document-text-outline', title: 'my_requests', sub: 'home_requests_sub' },
  { href: '/reports', icon: 'calendar-outline', title: 'home_calendar', sub: 'home_calendar_sub' },
];

export function QuickActions() {
  const { t } = useSettings();
  const router = useRouter();
  return (
    <Section title={t('home_quick')}>
      <Card padded={false}>
        {ITEMS.map((it, i) => (
          <ListRow
            key={it.href}
            testID={`quick-${it.href.slice(1)}`}
            icon={it.icon}
            title={t(it.title)}
            subtitle={t(it.sub)}
            onPress={() => router.push(it.href)}
            last={i === ITEMS.length - 1}
          />
        ))}
      </Card>
    </Section>
  );
}
