// New idea: title, description, category, optional photo (camera), named or anonymous.
// While typing, similar existing ideas are shown with «أؤيد», so people support one instead of repeating it.
// The server enforces the 3-per-month limit and keeps an anonymous author hidden from everyone.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { Button, Card, Chip, Field, Header, IconButton, ListRow, Notice, Row, Screen, Section, Segmented, Txt, useSnackbar } from '../../../components/ui';
import {
  categoryKey, DESCRIPTION_MAX, ideaErrorKey, ideaStatusView, IDEA_CATEGORIES, IDEA_RULES, shouldSearchSimilar, TITLE_MAX,
  validateDraft, type DraftErrors, type IdeaCategory, type SimilarIdea,
} from '../../../lib/ideas';
import { ideaQuota, similarIdeas, submitIdea, uploadIdeaPhoto, voteIdea } from '../../../lib/ideasApi';
import { useSettings } from '../../../lib/settings';
import { radius, space } from '../../../lib/theme';

export default function NewIdea() {
  const { t, c } = useSettings();
  const router = useRouter();
  const snack = useSnackbar();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IdeaCategory | null>(null);
  const [identity, setIdentity] = useState<'named' | 'anonymous'>('named');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [camPerm, requestCam] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [similar, setSimilar] = useState<SimilarIdea[]>([]);
  const [voting, setVoting] = useState<string | null>(null);

  useEffect(() => {
    ideaQuota().then((q) => setRemaining(q.remaining)).catch(() => setRemaining(null));
  }, []);

  // Similar ideas, a moment after the person stops typing.
  useEffect(() => {
    if (!shouldSearchSimilar(title)) {
      setSimilar([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      similarIdeas(title, description).then((r) => { if (live) setSimilar(r); }).catch(() => { if (live) setSimilar([]); });
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [title, description]);

  const support = async (s: SimilarIdea) => {
    setVoting(s.id);
    try {
      const n = await voteIdea(s.id, !s.iVoted);
      setSimilar((list) => list.map((x) => (x.id === s.id ? { ...x, iVoted: !s.iVoted, voteCount: n } : x)));
      snack(t(s.iVoted ? 'idea_unvoted' : 'idea_voted'), 'ok');
    } catch (e) {
      snack(t(ideaErrorKey(e)), 'danger');
    } finally {
      setVoting(null);
    }
  };

  const openCamera = async () => {
    if (!camPerm?.granted) {
      const r = await requestCam();
      if (!r.granted) {
        snack(t('idea_camera_denied'), 'danger');
        return;
      }
    }
    setCamera(true);
  };

  const shoot = async () => {
    try {
      const pic = await camRef.current?.takePictureAsync({ quality: 0.7, exif: false });
      if (pic?.uri) setPhotoUri(pic.uri);
    } catch {
      snack(t('idea_err_idea_photo_invalid'), 'danger');
    } finally {
      setCamera(false);
    }
  };

  const send = async () => {
    const e = validateDraft({ title, description, category });
    setErrors(e);
    setSendError(null);
    if (Object.keys(e).length || !category) return;
    setBusy(true);
    try {
      const photoPath = photoUri ? await uploadIdeaPhoto(photoUri) : null;
      const id = await submitIdea({ title, description, category, anonymous: identity === 'anonymous', photoPath });
      snack(t('idea_sent'), 'ok');
      router.replace(`/ideas/${id}`);
    } catch (err) {
      setSendError(t(ideaErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const blocked = remaining === 0;
  const footer = (
    <Button testID="sendIdea" label={t('idea_send')} icon="paper-plane-outline" loading={busy} disabled={blocked} onPress={send} />
  );

  return (
    <>
      <Header title={t('idea_new')} back />
      <Screen footer={footer}>
        {blocked ? (
          <Notice tone="danger" text={t('idea_quota_none', { limit: IDEA_RULES.monthlyLimit })} />
        ) : remaining != null ? (
          <Notice tone="info" text={t('idea_quota_left', { n: remaining, limit: IDEA_RULES.monthlyLimit })} />
        ) : null}

        <Field
          label={t('idea_title_label')}
          placeholder={t('idea_title_placeholder')}
          value={title}
          onChangeText={setTitle}
          maxLength={TITLE_MAX}
          error={errors.title ? t(errors.title) : null}
          testID="ideaTitle"
        />

        {similar.length ? (
          <Section title={t('idea_similar_title')}>
            <Notice tone="warn" text={t('idea_similar_hint')} />
            <Card padded={false}>
              {similar.map((s, k) => (
                <ListRow
                  key={s.id}
                  icon="bulb-outline"
                  title={s.title}
                  subtitle={`${t(ideaStatusView(s.status).key)} · ${t('idea_n_supporters', { n: s.voteCount })}`}
                  onPress={() => router.push(`/ideas/${s.id}`)}
                  last={k === similar.length - 1}
                  trailing={
                    <Button
                      label={s.iVoted ? t('idea_supported') : t('idea_vote')}
                      kind={s.iVoted ? 'ghost' : 'secondary'}
                      full={false}
                      loading={voting === s.id}
                      onPress={() => support(s)}
                    />
                  }
                />
              ))}
            </Card>
          </Section>
        ) : null}

        <Field
          label={t('idea_description_label')}
          placeholder={t('idea_description_placeholder')}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={DESCRIPTION_MAX}
          error={errors.description ? t(errors.description) : null}
          helper={t('idea_description_helper')}
          testID="ideaDescription"
        />

        <View style={{ gap: space.sm }}>
          <Txt variant="label" weight="medium">{t('idea_category_label')}</Txt>
          <Row gap={space.sm} wrap>
            {IDEA_CATEGORIES.map((k) => (
              <Chip key={k} label={t(categoryKey(k))} selected={category === k} onPress={() => setCategory(k)} />
            ))}
          </Row>
          {errors.category ? <Txt variant="caption" tone="danger">{t(errors.category)}</Txt> : null}
        </View>

        <View style={{ gap: space.sm }}>
          <Txt variant="label" weight="medium">{t('idea_identity_label')}</Txt>
          <Segmented
            options={[{ value: 'named', label: t('idea_named') }, { value: 'anonymous', label: t('idea_anonymous_choice') }]}
            value={identity}
            onChange={setIdentity}
          />
          <Txt variant="caption" tone="muted">{identity === 'anonymous' ? t('idea_anonymous_help') : t('idea_named_help')}</Txt>
        </View>

        <View style={{ gap: space.sm }}>
          <Txt variant="label" weight="medium">{t('idea_photo_label')}</Txt>
          {camera ? (
            <View style={{ gap: space.sm }}>
              <View style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.surfaceAlt }}>
                <CameraView ref={camRef} style={{ flex: 1 }} facing="back" animateShutter={false} onMountError={() => setCamera(false)} />
              </View>
              <Row gap={space.sm}>
                <View style={{ flex: 1 }}><Button label={t('idea_photo_take')} icon="camera" onPress={shoot} /></View>
                <View style={{ flex: 1 }}><Button label={t('idea_photo_cancel')} kind="secondary" onPress={() => setCamera(false)} /></View>
              </Row>
            </View>
          ) : photoUri ? (
            <View>
              <Image source={{ uri: photoUri }} accessibilityLabel={t('idea_photo')} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.sm, backgroundColor: c.surfaceAlt }} />
              <View style={{ position: 'absolute', top: space.xs, right: space.xs, backgroundColor: c.surface, borderRadius: radius.pill }}>
                <IconButton icon="trash-outline" label={t('idea_photo_remove')} onPress={() => setPhotoUri(null)} />
              </View>
            </View>
          ) : (
            <Button label={t('idea_photo_add')} icon="camera-outline" kind="secondary" onPress={openCamera} />
          )}
          <Txt variant="caption" tone="muted">{t('idea_photo_helper')}</Txt>
        </View>

        <Notice tone="info" text={t('idea_review_notice')} />
        {sendError ? <Notice tone="danger" text={sendError} /> : null}
      </Screen>
    </>
  );
}
