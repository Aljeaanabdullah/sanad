// «أفكار صارت حقيقة»: ideas that were implemented. The author's name shows only for named ideas.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { IdeaCard } from '../../../components/ideas/IdeaCard';
import { EmptyState, ErrorState, Header, Screen, SkeletonCard, Txt } from '../../../components/ui';
import { ideaErrorKey, type IdeaSummary } from '../../../lib/ideas';
import { listIdeas } from '../../../lib/ideasApi';
import { useSettings } from '../../../lib/settings';

export default function ImplementedIdeas() {
  const { t, c } = useSettings();
  const router = useRouter();
  const [ideas, setIdeas] = useState<IdeaSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setIdeas(await listIdeas({ scope: 'implemented', sort: 'new' }));
    } catch (e) {
      setError(t(ideaErrorKey(e)));
    }
  }, [t]);

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

  return (
    <>
      <Header title={t('ideas_implemented_title')} back />
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />}>
        <Txt tone="muted">{t('ideas_implemented_intro')}</Txt>
        {error && !ideas ? (
          <ErrorState message={error} onRetry={load} />
        ) : !ideas ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </>
        ) : ideas.length === 0 ? (
          <EmptyState icon="trophy-outline" title={t('ideas_implemented_empty')} />
        ) : (
          ideas.map((i) => <IdeaCard key={i.id} idea={i} onPress={() => router.push(`/ideas/${i.id}`)} />)
        )}
      </Screen>
    </>
  );
}
