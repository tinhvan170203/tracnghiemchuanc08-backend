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

function formatOpenAIError(err) {
  const status = err?.status || err?.statusCode || err?.response?.status;
  const detail =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    "Lỗi embedding không xác định";
  if (status) {
    return `Embedding lỗi (${status}): ${detail}`;
  }
  return `Embedding lỗi: ${detail}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableEmbedError(err) {
  const status = err?.status || err?.statusCode || err?.response?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503) {
    return true;
  }
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("timeout") || msg.includes("econnreset");
}

/**
 * Embed texts with empty-input filtering and retry on 429/5xx.
 * Returns vectors aligned 1:1 with the original `texts` array (empty slots get []).
 */
async function embedTexts(texts, { maxRetries = 3 } = {}) {
  const openai = getOpenAI();
  const model = getEmbeddingModel();
  const list = Array.isArray(texts) ? texts : [texts];

  const prepared = list.map((t) => String(t || "").slice(0, 8000).trim());
  const nonEmptyIndexes = [];
  const input = [];
  for (let i = 0; i < prepared.length; i++) {
    if (prepared[i]) {
      nonEmptyIndexes.push(i);
      input.push(prepared[i]);
    }
  }

  if (!input.length) {
    return {
      model,
      vectors: list.map(() => []),
      promptTokens: 0,
      totalTokens: 0,
    };
  }

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model,
        input,
      });
      const sorted = [...response.data].sort((x, y) => x.index - y.index);
      const usage = response.usage || {};
      const vectors = list.map(() => []);
      sorted.forEach((item, idx) => {
        const originalIndex = nonEmptyIndexes[idx];
        if (originalIndex != null) {
          vectors[originalIndex] = item.embedding;
        }
      });
      return {
        model,
        vectors,
        promptTokens: Number(usage.prompt_tokens) || 0,
        totalTokens: Number(usage.total_tokens) || Number(usage.prompt_tokens) || 0,
      };
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isRetryableEmbedError(err)) {
        const delay = Math.min(8000, 500 * Math.pow(2, attempt));
        await sleep(delay);
        continue;
      }
      const wrapped = new Error(formatOpenAIError(err));
      wrapped.status = err?.status || err?.statusCode;
      throw wrapped;
    }
  }

  throw new Error(formatOpenAIError(lastErr));
}

async function embedQuery(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Embedding lỗi: câu hỏi trống");
  }
  const { vectors, model, promptTokens, totalTokens } = await embedTexts([trimmed]);
  return {
    vector: vectors[0],
    model,
    promptTokens,
    totalTokens,
  };
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
  formatOpenAIError,
};
