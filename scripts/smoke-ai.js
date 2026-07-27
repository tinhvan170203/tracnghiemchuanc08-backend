/**
 * Smoke checks for AI knowledge / chat modules (no live OpenAI/Mongo required).
 */
const assert = require("assert");
const { chunkText } = require("../utils/textChunk");
const { cosineSimilarity, rankChunksByEmbedding } = require("../utils/embeddings");

const chunks = chunkText("A".repeat(2500), { chunkSize: 1000, overlap: 150 });
assert.ok(chunks.length >= 2, "chunkText should split long text");
assert.ok(chunks.every((c) => c.length > 0), "chunks non-empty");

const a = [1, 0, 0];
const b = [1, 0, 0];
const c = [0, 1, 0];
assert.ok(Math.abs(cosineSimilarity(a, b) - 1) < 1e-9, "identical vectors");
assert.ok(Math.abs(cosineSimilarity(a, c)) < 1e-9, "orthogonal vectors");

const ranked = rankChunksByEmbedding(
  [1, 0],
  [
    { content: "near", embedding: [0.9, 0.1], fileName: "a.txt" },
    { content: "far", embedding: [0, 1], fileName: "b.txt" },
  ],
  { topK: 2, minScore: 0.5 }
);
assert.strictEqual(ranked.length, 1, "only high-score chunk");
assert.strictEqual(ranked[0].chunk.content, "near");

console.log("smoke-test: OK");
