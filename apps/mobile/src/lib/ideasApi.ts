// Ideas box server calls. Every rule (anonymity, review, threshold, monthly limit) is enforced by the
// SECURITY DEFINER functions of supabase/migrations/*_ideas_box.sql; the ideas tables are not readable directly.
import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { base64ToBytes, photoObjectName, toDetail, toSummary, type IdeaCategory, type IdeaDetail, type IdeaSummary, type SimilarIdea } from './ideas';
import { supabase } from './supabase';

const BUCKET = 'idea-photos';
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export async function listIdeas(p: { scope: 'all' | 'mine' | 'implemented'; sort: 'top' | 'new'; category?: IdeaCategory | null }): Promise<IdeaSummary[]> {
  const { data, error } = await supabase.rpc('ideas_list', {
    p_scope: p.scope, p_sort: p.sort, p_category: p.category ?? null, p_limit: 100, p_offset: 0,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toSummary);
}

export async function getIdea(id: string): Promise<IdeaDetail | null> {
  const { data, error } = await supabase.rpc('idea_get', { p_idea: id });
  if (error) throw error;
  const row = (data as Record<string, unknown>[] | null)?.[0];
  return row ? toDetail(row) : null;
}

/** Returns the new vote count. */
export async function voteIdea(id: string, support: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('idea_vote', { p_idea: id, p_support: support });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function ideaQuota(): Promise<{ used: number; limit: number; remaining: number }> {
  const { data, error } = await supabase.rpc('idea_quota');
  if (error) throw error;
  const r = (data as Record<string, number>[] | null)?.[0];
  return { used: Number(r?.used ?? 0), limit: Number(r?.monthly_limit ?? 3), remaining: Number(r?.remaining ?? 0) };
}

export async function similarIdeas(title: string, description: string): Promise<SimilarIdea[]> {
  const { data, error } = await supabase.rpc('idea_similar', { p_title: title, p_description: description });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), title: String(r.title ?? ''), category: r.category as IdeaCategory, status: r.status as SimilarIdea['status'],
    voteCount: Number(r.vote_count ?? 0), iVoted: !!r.i_voted,
  }));
}

/** Resizes a camera picture and uploads it under a random name. Returns the object name for idea_submit. */
export async function uploadIdeaPhoto(uri: string): Promise<string> {
  let bytes: Uint8Array | null = null;
  for (const [width, compress] of [[1280, 0.7], [800, 0.55]] as const) {
    const ref = await ImageManipulator.manipulate(uri).resize({ width }).renderAsync();
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    const b = out.base64 ? base64ToBytes(out.base64) : null;
    if (b && b.length <= PHOTO_MAX_BYTES) {
      bytes = b;
      break;
    }
  }
  if (!bytes) throw new Error('idea_photo_invalid');
  const name = photoObjectName(randomUUID);
  const { error } = await supabase.storage.from(BUCKET).upload(name, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('idea_photo_invalid');
  return name;
}

export async function submitIdea(p: { title: string; description: string; category: IdeaCategory; anonymous: boolean; photoPath: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc('idea_submit', {
    p_title: p.title.trim(), p_description: p.description.trim(), p_category: p.category,
    p_anonymous: p.anonymous, p_photo_path: p.photoPath,
  });
  if (error) throw error;
  return String(data);
}

/** A short-lived link to the idea photo (the storage policy checks the idea is visible to me). */
export async function ideaPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
