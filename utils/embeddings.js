const { getOpenAI, getEmbeddingModel } = require("./openaiClient");

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedTexts(texts) {
  const openai = getOpenAI();
  const model = getEmbeddingModel();
  const input = texts.map((t) => String(t || "").slice(0, 8000));
  const response = await openai.embeddings.create({
    model,
    input,
  });
  const sorted = [...response.data].sort((x, y) => x.index - y.index);
  return {
    model,
    vectors: sorted.map((item) => item.embedding),
  };
}

async function embedQuery(text) {
  const { vectors, model } = await embedTexts([text]);
  return { vector: vectors[0], model };
}

/**
 * Rank chunks by cosine similarity to query embedding.
 */
function rankChunksByEmbedding(queryVector, chunks, { topK = 6, minScore = 0.35 } = {}) {
  const scored = chunks
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryVector, chunk.embedding || []),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

module.exports = {
  cosineSimilarity,
  embedTexts,
  embedQuery,
  rankChunksByEmbedding,
};
