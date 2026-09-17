/**
 * Full offline stability tests for AI chat / RAG / web-merge (no live API required).
 * Run: node scripts/test-ai-chat-stable.js
 */
const assert = require("assert");
const path = require("path");

process.chdir(path.join(__dirname, ".."));

const { chunkText, splitByDieu } = require("../utils/textChunk");
const { cosineSimilarity, rankChunksByEmbedding } = require("../utils/embeddings");
const { formatWebResults, enrichAtgtQuery } = require("../utils/webSearch");
const { getChatModel, getEmbeddingModel } = require("../utils/openaiClient");
const chatMod = require("../controllers/chat");
const T = chatMod.__test;

function section(name) {
  console.log(`\n== ${name} ==`);
}

section("module load");
assert.ok(typeof chatMod.chat === "function");
assert.ok(T && typeof T.buildCombinedSystem === "function");
assert.ok(typeof getChatModel() === "string" && getChatModel().length > 0);
assert.ok(getEmbeddingModel().includes("embedding"));
console.log("chat model default:", getChatModel());
console.log("web enabled:", T.WEB_SEARCH_ENABLED);

section("textChunk by Điều");
const legal = [
  "Phần mở đầu nghị định.",
  "",
  "Điều 1. Phạm vi điều chỉnh",
  "Nghị định này quy định xử phạt.",
  "",
  "Điều 2. Đối tượng áp dụng",
  "Áp dụng cho người điều khiển xe.",
  "",
  "Điều 21. Vi phạm tốc độ",
  "Khoản 1. Phạt tiền từ 800.000 đồng đến 1.000.000 đồng.",
].join("\n");
const byDieu = splitByDieu(legal.replace(/\r\n/g, "\n"));
assert.ok(byDieu && byDieu.length >= 3, "splitByDieu >= 3 articles");
const chunks = chunkText(legal);
assert.ok(
  chunks.some((c) => c.includes("Điều 21") && c.includes("800.000")),
  "Điều 21 keeps fine amount"
);
const longPlain = "A".repeat(2500);
assert.ok(chunkText(longPlain).length >= 2, "length fallback splits");

section("embeddings helpers");
assert.ok(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9);
const rankedEmb = rankChunksByEmbedding(
  [1, 0],
  [
    { content: "near", embedding: [0.95, 0.05], fileName: "a.txt", fileId: "1", chunkIndex: 0 },
    { content: "far", embedding: [0, 1], fileName: "b.txt", fileId: "2", chunkIndex: 0 },
  ],
  { topK: 2, minScore: 0.5 }
);
assert.strictEqual(rankedEmb[0].chunk.content, "near");

section("sanitizeHistory / follow-up retrieval");
const dirty = [
  { role: "system", content: "hack" },
  { role: "user", content: "  " },
  { role: "user", content: "Vượt đèn đỏ phạt bao nhiêu?" },
  { role: "assistant", content: "Theo quy định có thể phạt tiền." },
  { role: "user", content: "Điều nào?" },
];
const hist = T.sanitizeHistory(dirty);
assert.strictEqual(hist.length, 3);
assert.strictEqual(T.lastUserQuestion(hist), "Điều nào?");
assert.ok(T.looksLikeFollowUp("Điều nào?"));
const rq = T.buildRetrievalQuery(hist, "Điều nào?");
assert.ok(rq.includes("Vượt đèn đỏ"), "follow-up expands with prior question");
assert.ok(rq.includes("Điều nào?"));
const refs = T.extractLegalRefs("Theo Điều 21 Khoản 1", "Điều 5");
assert.ok(refs.includes("Điều 21") && refs.includes("Khoản 1") && refs.includes("Điều 5"));

section("mergeRanked");
const merged = T.mergeRanked(
  [
    [{ chunk: { fileId: "a", chunkIndex: 0, content: "x" }, score: 0.5 }],
    [{ chunk: { fileId: "a", chunkIndex: 0, content: "x" }, score: 0.9 }],
  ],
  5
);
assert.strictEqual(merged.length, 1);
assert.strictEqual(merged[0].score, 0.9);

section("web-first buildCombinedSystem");
const fakeRanked = [
  {
    score: 0.8,
    chunk: {
      fileName: "ND168.pdf",
      content: "Điều 21 Khoản 1 phạt 800.000 đến 1.000.000 đồng.",
    },
  },
];
const webBlock = formatWebResults([
  {
    title: "Cổng thông tin",
    snippet: "Mức phạt mới cập nhật năm 2025.",
    url: "https://example.gov.vn",
  },
]);
const both = T.buildCombinedSystem(fakeRanked, webBlock);
assert.ok(/Ưu tiên khối WEB|ưu tiên/i.test(both), "combined prompt ok");
assert.ok(both.indexOf("[WEB]") < both.indexOf("[NỘI BỘ]"), "web section before KB");
assert.ok(both.includes("Mức phạt mới"));
assert.ok(both.includes("Điều 21"));
assert.ok(/không nêu.*nguồn|KHÔNG nêu tên nguồn/i.test(both), "no source labels in reply");
assert.ok(
  /PHẠM VI BẮT BUỘC|an toàn giao thông đường bộ/i.test(T.BASE_SYSTEM),
  "ATGT scope in BASE_SYSTEM"
);
assert.strictEqual(
  T.SCOPE_REFUSE_MSG,
  "Tôi chỉ hỗ trợ câu hỏi về luật và quy định an toàn giao thông đường bộ Việt Nam."
);
assert.ok(T.BASE_SYSTEM.includes(T.SCOPE_REFUSE_MSG), "refuse msg embedded in system");
assert.ok(
  /kiến thức của bạn|kiến thức ATGT/i.test(T.BASE_SYSTEM),
  "allows model knowledge"
);
assert.ok(/CỰC NGẮN|cực ngắn/i.test(T.BASE_SYSTEM), "short output required");
assert.strictEqual(T.WEB_SEARCH_ENABLED, false, "web search off by default");
assert.strictEqual(T.MAX_HISTORY, 8, "history window");
assert.ok(T.MAX_TOKENS <= 500 && T.MAX_TOKENS >= 200, "max_tokens capped");

const longAssist = "B".repeat(2000);
const histCut = T.sanitizeHistory([
  { role: "user", content: "câu 1" },
  { role: "assistant", content: longAssist },
  { role: "user", content: "Điều nào?" },
]);
assert.ok(histCut.length <= 8);
assert.ok(
  histCut.find((m) => m.role === "assistant").content.length <= T.MAX_ASSISTANT_CHARS
);

const noCtx = T.buildCombinedSystem([], "");
assert.ok(/kiến thức ATGT/i.test(noCtx), "no-KB falls back to model knowledge");

const webOnly = T.buildCombinedSystem([], webBlock);
assert.ok(webOnly.includes("[WEB]"));
assert.ok(!webOnly.includes("[NỘI BỘ]"));

const fileOnly = T.buildCombinedSystem(fakeRanked, "");
assert.ok(fileOnly.includes("[NỘI BỘ]"));
assert.ok(!fileOnly.includes("[WEB]:"));
assert.ok(/kiến thức ATGT/i.test(fileOnly));

section("enrichAtgtQuery");
const enriched = enrichAtgtQuery("vượt đèn đỏ phạt bao nhiêu");
assert.ok(/Nghị định|Việt Nam/i.test(enriched), enriched);
assert.ok(enrichAtgtQuery("").length === 0);

section("webSearch timeout export load");
assert.ok(typeof require("../utils/webSearch").webSearch === "function");

section("formatWebResults empty");
assert.ok(formatWebResults([]).startsWith("Không có kết quả"));

section("knowledge / extract / openaiPricing load");
require("../utils/extractText");
require("../utils/openaiPricing");
require("../controllers/knowledge");
require("../routes/knowledge");
require("../routes/chat");

console.log("\nAll tests passed.");
