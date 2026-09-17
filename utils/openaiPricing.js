/**
 * Giá ước tính USD / 1 triệu tokens (dashboard AiChatLogs — không phải hóa đơn OpenAI).
 *
 * Tự chỉnh (ưu tiên): backend/.env rồi restart
 *   OPENAI_PRICE_CHAT_INPUT   — input chat
 *   OPENAI_PRICE_CHAT_OUTPUT  — output chat
 *   OPENAI_PRICE_EMBED        — embedding
 *   OPENAI_USD_TO_VND         — quy đổi VND (vd 32000)
 * Xem thêm: backend/.env.example
 *
 * Nếu không set env → suy từ OPENAI_CHAT_MODEL (luna 0.2/1.2, nano 0.05/0.4, …).
 */
const { getChatModel } = require("./openaiClient");

function getUsdToVndRate() {
  const rate = Number(process.env.OPENAI_USD_TO_VND || 32000);
  return Number.isFinite(rate) && rate > 0 ? rate : 32000;
}

/** Defaults theo family model (USD / 1M tokens). */
function defaultsForChatModel(model) {
  const m = String(model || "").toLowerCase();
  if (m.includes("luna") || m.includes("5.6-luna")) {
    return { chatInput: 0.2, chatOutput: 1.2 };
  }
  if (m.includes("terra") || m.includes("5.6-terra")) {
    return { chatInput: 2, chatOutput: 12 };
  }
  if (m.includes("sol") || m.includes("5.6-sol")) {
    return { chatInput: 5, chatOutput: 30 };
  }
  if (m.includes("gpt-5-nano") || m.includes("5-nano")) {
    return { chatInput: 0.05, chatOutput: 0.4 };
  }
  if (m.includes("gpt-5-mini") || m.includes("5-mini")) {
    return { chatInput: 0.25, chatOutput: 2 };
  }
  if (m.includes("gpt-5")) {
    return { chatInput: 1.25, chatOutput: 10 };
  }
  if (m.includes("gpt-4.1-nano") || m.includes("4.1-nano")) {
    return { chatInput: 0.1, chatOutput: 0.4 };
  }
  if (m.includes("gpt-4.1-mini") || m.includes("4.1-mini")) {
    return { chatInput: 0.4, chatOutput: 1.6 };
  }
  if (m.includes("gpt-4.1")) {
    return { chatInput: 2, chatOutput: 8 };
  }
  // fallback: khớp default chat model gpt-5.6-luna
  return { chatInput: 0.2, chatOutput: 1.2 };
}

function getOpenAiPrices() {
  const d = defaultsForChatModel(getChatModel());
  return {
    chatInput: Number(
      process.env.OPENAI_PRICE_CHAT_INPUT != null && process.env.OPENAI_PRICE_CHAT_INPUT !== ""
        ? process.env.OPENAI_PRICE_CHAT_INPUT
        : d.chatInput
    ),
    chatOutput: Number(
      process.env.OPENAI_PRICE_CHAT_OUTPUT != null && process.env.OPENAI_PRICE_CHAT_OUTPUT !== ""
        ? process.env.OPENAI_PRICE_CHAT_OUTPUT
        : d.chatOutput
    ),
    embed: Number(process.env.OPENAI_PRICE_EMBED || 0.02),
    usdToVnd: getUsdToVndRate(),
    chatModel: getChatModel(),
  };
}

function estimateUsd({
  promptTokens = 0,
  completionTokens = 0,
  embeddingTokens = 0,
} = {}) {
  const p = getOpenAiPrices();
  const usd =
    (Number(promptTokens) / 1e6) * p.chatInput +
    (Number(completionTokens) / 1e6) * p.chatOutput +
    (Number(embeddingTokens) / 1e6) * p.embed;
  return Math.round(usd * 1e8) / 1e8;
}

function usdToVnd(usd) {
  const vnd = Number(usd || 0) * getUsdToVndRate();
  return Math.round(vnd);
}

function estimateVnd(tokens) {
  return usdToVnd(estimateUsd(tokens));
}

function emptyTokenTotals() {
  return {
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    embeddingTokens: 0,
    estimatedUsd: 0,
    estimatedVnd: 0,
  };
}

function accumulateTokens(acc, row) {
  acc.requestCount += 1;
  acc.promptTokens += Number(row.promptTokens) || 0;
  acc.completionTokens += Number(row.completionTokens) || 0;
  acc.totalTokens += Number(row.totalTokens) || 0;
  acc.embeddingTokens += Number(row.embeddingTokens) || 0;
  return acc;
}

function finalizeSummary(acc) {
  const estimatedUsd = estimateUsd(acc);
  return {
    ...acc,
    estimatedUsd,
    estimatedVnd: usdToVnd(estimatedUsd),
    prices: getOpenAiPrices(),
  };
}

function summarizeRows(rows = []) {
  const acc = emptyTokenTotals();
  for (const row of rows) accumulateTokens(acc, row);
  return finalizeSummary(acc);
}

module.exports = {
  getOpenAiPrices,
  getUsdToVndRate,
  defaultsForChatModel,
  estimateUsd,
  estimateVnd,
  usdToVnd,
  emptyTokenTotals,
  accumulateTokens,
  finalizeSummary,
  summarizeRows,
};
