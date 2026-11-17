// One idea in a list: category, title, two lines of text, status, support count, the reply countdown
// and who wrote it (never the name of an anonymous author: the server does not send it).
import { View } from 'react-native';
import { authorLabel, categoryIcon, categoryKey, countdownText, ideaStatusView, responseCountdown, type IdeaSummary } from '../../lib/ideas';
import { useSettings } from '../../lib/settings';
import { space } from '../../lib/theme';
import { Badge, Card, Icon, Row, Txt, type IconName } from '../ui';

export function IdeaCard({ idea, onPress, now }: { idea: IdeaSummary; onPress: () => void; now?: Date }) {
  const { t, lang } = useSettings();
  const s = ideaStatusView(idea.status);
  const cd = responseCountdown(idea, now);
  return (
    <Card onPress={onPress} accessibilityLabel={idea.title} testID={`idea-${idea.id}`}>
      <View style={{ gap: space.sm }}>
        <Row gap={space.xs}>
          <Icon name={categoryIcon(idea.category) as IconName} size={16} tone="muted" />
          <Txt variant="caption" tone="muted" style={{ flex: 1 }}>{t(categoryKey(idea.category))}</Txt>
          {idea.hasPhoto ? <Icon name="image-outline" size={16} tone="muted" /> : null}
        </Row>
        <Txt variant="heading" numberOfLines={2}>{idea.title}</Txt>
        <Txt tone="muted" numberOfLines={2}>{idea.description}</Txt>
        <Row gap={space.sm} wrap>
          <Badge label={t(s.key)} tone={s.tone} icon={s.icon as IconName} />
          {cd ? <Badge label={countdownText(cd, t)} tone={cd.overdue ? 'danger' : 'warn'} icon="hourglass-outline" /> : null}
        </Row>
        <Row gap={space.md} justify="space-between">
          <Row gap={space.xs}>
            <Icon name={idea.iVoted ? 'thumbs-up' : 'thumbs-up-outline'} size={18} tone={idea.iVoted ? 'accent' : 'muted'} />
            <Txt variant="label" weight="bold" numeric>{String(idea.voteCount)}</Txt>
            <Txt variant="label" tone="muted">{t('idea_supporters')}</Txt>
          </Row>
          <Txt variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>{authorLabel(idea, t, lang)}</Txt>
        </Row>
      </View>
    </Card>
  );
}
