import { UserQueries } from '@poupaia/db';

const QUERY_SIMILARITY_THRESHOLD = 0.92;

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
};

export const mergeOrAppendQuery = (existing: UserQueries[], newQuery: string, newEmbeddings: number[]): UserQueries[] => {
  if (newEmbeddings.length === 0) {
    return [...existing, { query: newQuery, embeddings: newEmbeddings }];
  }

  for (let i = 0; i < existing.length; i++) {
    const existingEmbeddings = existing[i].embeddings ?? [];
    if (existingEmbeddings.length === 0) continue;

    const similarity = cosineSimilarity(newEmbeddings, existingEmbeddings);
    if (similarity >= QUERY_SIMILARITY_THRESHOLD) {
      const updated = [...existing];
      updated[i] = { query: newQuery, embeddings: newEmbeddings };
      return updated;
    }
  }

  return [...existing, { query: newQuery, embeddings: newEmbeddings }];
};
