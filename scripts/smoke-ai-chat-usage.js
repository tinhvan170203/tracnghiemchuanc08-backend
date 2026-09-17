/**
 * Smoke checks for AI chat usage tracking (no OpenAI call required for most).
 */
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const {
  estimateUsd,
  summarizeRows,
  getOpenAiPrices,
  accumulateTokens,
  emptyTokenTotals,
  finalizeSummary,
} = require("../utils/openaiPricing");
const { getChatModel, getEmbeddingModel } = require("../utils/openaiClient");
const {
  buildDiaphuongPublicUrl,
  normalizeDiaphuongApiBase,
} = require("../utils/diaphuongApiUrl");
const { buildDateFilter, resolveOriginHostname } = require("../controllers/fanpage");
const aichat = require("../controllers/aichat");
const c08 = require("../c08/c08");

assert(getChatModel() === "gpt-5.6-luna" || process.env.OPENAI_CHAT_MODEL, "chat model default");
assert(getEmbeddingModel().includes("embedding"), "embedding model");

const prices = getOpenAiPrices();
assert(prices.chatInput > 0 && prices.chatOutput > 0 && prices.embed > 0, "prices");

const usd = estimateUsd({
  promptTokens: 1_000_000,
  completionTokens: 1_000_000,
  embeddingTokens: 1_000_000,
});
const expected = prices.chatInput + prices.chatOutput + prices.embed;
assert(Math.abs(usd - expected) < 1e-9, `usd got ${usd} expected ${expected}`);

const rows = [
  { promptTokens: 100, completionTokens: 50, embeddingTokens: 10, totalTokens: 150 },
  { promptTokens: 200, completionTokens: 0, embeddingTokens: 5, totalTokens: 200 },
];
const sum = summarizeRows(rows);
assert(sum.requestCount === 2, "requestCount");
assert(sum.promptTokens === 300, "promptTokens");
assert(sum.completionTokens === 50, "completionTokens");
assert(sum.embeddingTokens === 15, "embeddingTokens");

const base = normalizeDiaphuongApiBase("https://example.com/api/public/sumary/toan-quoc");
assert(base === "https://example.com/api", `base ${base}`);
const u = buildDiaphuongPublicUrl(base, "/public/sumary/ai-chat", {
  fromDate: "2026-09-01",
  toDate: "2026-09-05",
});
assert(
  u.pathname === "/api/public/sumary/ai-chat",
  `pathname ${u.pathname}`
);
assert(u.searchParams.get("fromDate") === "2026-09-01", "fromDate query");

const range = buildDateFilter("2026-09-01", "2026-09-05");
assert(range.$gte instanceof Date && range.$lte instanceof Date, "date range");

const oh = resolveOriginHostname(
  { origin: "https://foo.vn", hostname: "" },
  {}
);
assert(oh.hostname === "foo.vn", `hostname ${oh.hostname}`);

assert(typeof aichat.publicList === "function", "aichat.publicList");
assert(typeof aichat.listLogs === "function", "aichat.listLogs");
assert(typeof aichat.exportExcel === "function", "aichat.exportExcel");
assert(typeof c08.fetchAiChatToanquoc === "function", "c08.fetchAiChatToanquoc");

const query = aichat.buildAiChatQuery({
  query: { fromDate: "2026-09-01", toDate: "2026-09-05", q: "luat", hostname: "x.com" },
});
assert(query.createdAt, "query date");
assert(query.question.$regex === "luat", "query q");
assert(query.hostname.$options === "i", "query hostname");

const withUsd = aichat.withEstimatedUsd({
  promptTokens: 1000,
  completionTokens: 500,
  embeddingTokens: 100,
});
assert(typeof withUsd.estimatedUsd === "number", "estimatedUsd on row");

console.log("SMOKE_OK", {
  model: getChatModel(),
  prices,
  sampleUsd: withUsd.estimatedUsd,
  publicUrl: u.href,
});
