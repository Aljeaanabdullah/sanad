// صندوق الأفكار: everyone's published ideas (most supported / newest, by category) or my own,
// a way to the new-idea form (with the monthly quota) and to «أفكار صارت حقيقة».
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { IdeaCard } from '../../../components/ideas/IdeaCard';
import { Button, Card, Chip, EmptyState, ErrorState, Header, ListRow, Notice, Row, Screen, Segmented, SkeletonCard, Txt } from '../../../components/ui';
import { categoryKey, ideaErrorKey, IDEA_CATEGORIES, type IdeaCategory, type IdeaSummary } from '../../../lib/ideas';
import { ideaQuota, listIdeas } from '../../../lib/ideasApi';
import { useSettings } from '../../../lib/settings';
import { space } from '../../../lib/theme';

type Scope = 'all' | 'mine';
type Sort = 'top' | 'new';

export default function IdeasScreen() {
  const { t, c } = useSettings();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<Sort>('top');
  const [category, setCategory] = useState<IdeaCategory | null>(null);
  const [ideas, setIdeas] = useState<IdeaSummary[] | null>(null);
  const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, q] = await Promise.all([
        listIdeas({ scope, sort, category }),
        ideaQuota().catch(() => null),
      ]);
      setIdeas(list);
      if (q) setQuota(q);
    } catch (e) {
      setError(t(ideaErrorKey(e)));
    }
  }, [scope, sort, category, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const change = <V,>(set: (v: V) => void) => (v: V) => {
    setIdeas(null);
    set(v);
  };

  return (
    <>
      <Header title={t('ideas_title')} subtitle={t('ideas_subtitle')} back />
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />}>
        <Card>
          <Txt weight="medium">{t('ideas_intro')}</Txt>
          <Row style={{ marginTop: space.md }}>
            <Button
              testID="newIdea"
              label={t('idea_new')}
              icon="add-circle-outline"
              disabled={quota?.remaining === 0}
              onPress={() => router.push('/ideas/new')}
            />
          </Row>
          {quota ? (
            <Txt variant="caption" tone={quota.remaining === 0 ? 'danger' : 'muted'} style={{ marginTop: space.sm }}>
              {quota.remaining === 0 ? t('idea_quota_none', { limit: quota.limit }) : t('idea_quota_left', { n: quota.remaining, limit: quota.limit })}
            </Txt>
          ) : null}
        </Card>

        <Card padded={false}>
          <ListRow icon="trophy-outline" iconTone="accent" title={t('ideas_implemented_title')} subtitle={t('ideas_implemented_hint')} onPress={() => router.push('/ideas/implemented')} last />
        </Card>

        <Segmented<Scope>
          options={[{ value: 'all', label: t('ideas_scope_all') }, { value: 'mine', label: t('ideas_scope_mine') }]}
          value={scope}
          onChange={change(setScope)}
        />
        {scope === 'all' ? (
          <Segmented<Sort>
            options={[{ value: 'top', label: t('ideas_sort_top') }, { value: 'new', label: t('ideas_sort_new') }]}
            value={sort}
            onChange={change(setSort)}
          />
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          <Chip label={t('ideas_cat_all')} selected={category == null} onPress={() => change(setCategory)(null)} />
          {IDEA_CATEGORIES.map((k) => (
            <Chip key={k} label={t(categoryKey(k))} selected={category === k} onPress={() => change(setCategory)(k)} />
          ))}
        </ScrollView>

        {error && !ideas ? (
          <ErrorState message={error} onRetry={load} />
        ) : !ideas ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </>
        ) : ideas.length === 0 ? (
          <EmptyState
            icon="bulb-outline"
            title={scope === 'mine' ? t('ideas_empty_mine') : t('ideas_empty')}
            body={t('ideas_empty_hint')}
          />
        ) : (
          ideas.map((i) => <IdeaCard key={i.id} idea={i} onPress={() => router.push(`/ideas/${i.id}`)} />)
        )}

        <Notice tone="neutral" text={t('ideas_not_bonus')} />
      </Screen>
    </>
  );
}
