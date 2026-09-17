const rateLimit = require("express-rate-limit");
const AiKnowledgeChunk = require("../models/AiKnowledgeChunk");
const AiKnowledgeFile = require("../models/AiKnowledgeFile");
const AiChatLog = require("../models/AiChatLog");
const {
  getOpenAI,
  getChatModel,
  getEmbeddingModel,
} = require("../utils/openaiClient");
const { embedQuery, rankChunksByEmbedding } = require("../utils/embeddings");
const { resolveOriginHostname } = require("./fanpage");

/** Web tắt mặc định (tránh OpenAI web tool). Bật: AI_WEB_SEARCH_ENABLED=true + BING_SEARCH_KEY */
const WEB_SEARCH_ENABLED = process.env.AI_WEB_SEARCH_ENABLED === "true";
const MIN_SCORE = Number(process.env.AI_RAG_MIN_SCORE || 0.32);
const MIN_SCORE_FOLLOWUP = Number(process.env.AI_RAG_MIN_SCORE_FOLLOWUP || 0.26);
const TOP_K = Number(process.env.AI_RAG_TOP_K || 8);
/** ~4 cặp hỏi–đáp gần nhất */
const MAX_HISTORY = Number(process.env.AI_CHAT_MAX_HISTORY || 8);
const MAX_USER_CHARS = Number(process.env.AI_CHAT_MAX_USER_CHARS || 1500);
const MAX_ASSISTANT_CHARS = Number(process.env.AI_CHAT_MAX_ASSISTANT_CHARS || 900);
const MAX_TOKENS = Number(process.env.AI_CHAT_MAX_TOKENS || 450);

const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Bạn gửi quá nhiều câu hỏi. Vui lòng thử lại sau." },
});

const BASE_SYSTEM = `Bạn là Trợ lý ảo cảnh sát giao thông Việt Nam.

PHẠM VI BẮT BUỘC:
- CHỈ trả lời câu hỏi về luật, nghị định, thông tư, quy định, mức phạt, GPLX, biển báo, tín hiệu đèn, tốc độ, nồng độ cồn, hành vi tham gia giao thông đường bộ và trách nhiệm theo quy định ATGT Việt Nam.
- Nếu câu hỏi NGOÀI phạm vi trên: trả lời ĐÚNG một câu sau, không thêm gì khác:
Tôi chỉ hỗ trợ câu hỏi về luật và quy định an toàn giao thông đường bộ Việt Nam.

CÁCH TRẢ LỜI (khi trong phạm vi) — BẮT BUỘC NGẮN:
1. Trả lời CỰC NGẮN: chỉ mức phạt / Điều–Khoản cần thiết để trả lời đúng câu hỏi. Tối đa vài câu. Plain text, không Markdown.
2. CẤM liệt kê dài, định nghĩa lan man, ví dụ phụ, mở rộng chủ đề, lời khuyên, "nên/không nên", kết luận dài.
3. Câu hỏi nối tiếp: dùng ngữ cảnh hội thoại gần đây để hiểu (vd "Điều nào?"), vẫn chỉ ATGT.
4. Không viết meta nguồn (web/tài liệu nội bộ...).
5. Có TÀI LIỆU NỘI BỘ thì ưu tiên; không có thì dùng kiến thức ATGT của bạn. Không chắc số thì nói ngắn chưa rõ, không bịa.
6. Không hứa "tra cứu lại". Trả lời ngay.`;

const SCOPE_REFUSE_MSG =
  "Tôi chỉ hỗ trợ câu hỏi về luật và quy định an toàn giao thông đường bộ Việt Nam.";

const NO_KB_MSG =
  "Hiện chưa có đủ thông tin để trả lời. Vui lòng thử lại sau.";
const NO_MATCH_MSG =
  "Chưa tìm thấy thông tin phù hợp để trả lời câu hỏi này.";

const FOLLOWUP_HINT =
  /điều|khoản|điểm|dẫn chứng|từ đâu|nguồn|nói rõ|cụ thể|chi tiết|ở đâu|cái gì|thế nào|tiếp đi|vậy|hả|là sao|bao nhiêu|mức nào|theo đâu/i;

function sanitizeHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .map((m) => {
      const max =
        m.role === "assistant" ? MAX_ASSISTANT_CHARS : MAX_USER_CHARS;
      return {
        role: m.role,
        content: String(m.content).slice(0, max),
      };
    })
    .slice(-MAX_HISTORY);
}

function lastUserQuestion(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].content;
  }
  return "";
}

function previousUserQuestions(history) {
  const users = history
    .filter((m) => m.role === "user")
    .map((m) => String(m.content || "").trim())
    .filter(Boolean);
  if (users.length <= 1) return [];
  return users.slice(0, -1).slice(-2);
}

function lastAssistantSnippet(history, maxLen = 400) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") {
      return String(history[i].content || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLen);
    }
  }
  return "";
}

function looksLikeFollowUp(question) {
  const q = String(question || "").trim();
  if (!q) return false;
  if (q.length <= 72) return true;
  return FOLLOWUP_HINT.test(q);
}

function buildRetrievalQuery(history, question) {
  const q = String(question || "").trim();
  const prevUsers = previousUserQuestions(history);
  if (!prevUsers.length || !looksLikeFollowUp(q)) {
    return q;
  }
  const assist = lastAssistantSnippet(history);
  const parts = [...prevUsers, q];
  if (assist) parts.push(`Ngữ cảnh trả lời trước: ${assist}`);
  return parts.join("\n").slice(0, 2500);
}

function extractLegalRefs(...texts) {
  const joined = texts.filter(Boolean).join("\n");
  const refs = new Set();
  for (const m of joined.matchAll(/Điều\s+(\d+)/gi)) {
    refs.add(`Điều ${m[1]}`);
  }
  for (const m of joined.matchAll(/Khoản\s+(\d+)/gi)) {
    refs.add(`Khoản ${m[1]}`);
  }
  return [...refs];
}

function chunkKey(chunk) {
  return `${chunk.fileId || ""}:${chunk.chunkIndex ?? ""}:${String(chunk.content || "").slice(0, 48)}`;
}

function mergeRanked(lists, topK) {
  const best = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      if (!item?.chunk) continue;
      const key = chunkKey(item.chunk);
      const prev = best.get(key);
      if (!prev || item.score > prev.score) best.set(key, item);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

function keywordRankChunks(chunks, refs) {
  if (!refs.length) return [];
  const scored = [];
  for (const chunk of chunks) {
    const content = String(chunk.content || "");
    let hits = 0;
    for (const ref of refs) {
      if (content.includes(ref) || content.toLowerCase().includes(ref.toLowerCase())) {
        hits += 1;
      }
    }
    if (hits > 0) {
      scored.push({ chunk, score: 0.92 + Math.min(0.07, hits * 0.02) });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, TOP_K);
}

function expandWithNeighbors(ranked, allChunks, { radius = 1, limit } = {}) {
  const byFile = new Map();
  for (const c of allChunks) {
    const fid = String(c.fileId);
    if (!byFile.has(fid)) byFile.set(fid, []);
    byFile.get(fid).push(c);
  }
  for (const list of byFile.values()) {
    list.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
  }

  const added = new Map();
  for (const item of ranked) {
    added.set(chunkKey(item.chunk), item);
    const list = byFile.get(String(item.chunk.fileId)) || [];
    const idx = list.findIndex(
      (c) =>
        c.chunkIndex === item.chunk.chunkIndex ||
        c.content === item.chunk.content
    );
    if (idx < 0) continue;
    for (let d = -radius; d <= radius; d++) {
      if (d === 0) continue;
      const n = list[idx + d];
      if (!n) continue;
      const k = chunkKey(n);
      if (!added.has(k)) {
        added.set(k, { chunk: n, score: item.score * 0.88 });
      }
    }
  }
  const max = limit || TOP_K + 4;
  return [...added.values()].sort((a, b) => b.score - a.score).slice(0, max);
}

function emptyUsage() {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    embeddingTokens: 0,
    chatModel: getChatModel(),
    embeddingModel: "",
  };
}

function parseChatUsage(response, usageAcc) {
  const u = response?.usage || {};
  usageAcc.promptTokens += Number(u.prompt_tokens) || 0;
  usageAcc.completionTokens += Number(u.completion_tokens) || 0;
  usageAcc.totalTokens += Number(u.total_tokens) || 0;
  usageAcc.chatModel = getChatModel();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableChatError(err) {
  const status = err?.status || err?.statusCode || err?.response?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503) {
    return true;
  }
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("timeout") || msg.includes("econnreset");
}

function formatChatOpenAIError(err) {
  const status = err?.status || err?.statusCode || err?.response?.status;
  // Log chi tiết phía server; user chỉ thấy thông báo chung
  const detail =
    err?.error?.message ||
    err?.response?.data?.error?.message ||
    err?.message ||
    "unknown";
  console.error("chat provider error:", status || "", detail);
  if (status === 429) {
    return {
      status: 429,
      error: "Có lỗi xảy ra. Vui lòng thử lại sau.",
    };
  }
  return {
    status: status && status >= 400 && status < 600 ? status : 500,
    error: "Có lỗi xảy ra. Vui lòng thử lại sau.",
  };
}

async function callChat(messages, usageAcc, { maxRetries = 3 } = {}) {
  const openai = getOpenAI();
  const model = getChatModel();
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages,
        max_tokens: MAX_TOKENS,
      });
      parseChatUsage(response, usageAcc);
      return response?.choices?.[0]?.message?.content?.trim() || "";
    } catch (err) {
      lastErr = err;
      // Một số model dùng max_completion_tokens thay max_tokens
      const detail = String(
        err?.error?.message || err?.message || ""
      ).toLowerCase();
      if (
        attempt === 0 &&
        (detail.includes("max_tokens") || detail.includes("unsupported"))
      ) {
        try {
          const response = await openai.chat.completions.create({
            model,
            messages,
            max_completion_tokens: MAX_TOKENS,
          });
          parseChatUsage(response, usageAcc);
          return response?.choices?.[0]?.message?.content?.trim() || "";
        } catch (err2) {
          lastErr = err2;
        }
      }
      if (attempt < maxRetries && isRetryableChatError(err)) {
        await sleep(Math.min(8000, 500 * Math.pow(2, attempt)));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

function buildFileContext(ranked) {
  return ranked
    .map(
      (item, i) =>
        `[Tài liệu ${i + 1} | ${item.chunk.fileName || "file"} | score=${Number(item.score || 0).toFixed(3)}]\n${item.chunk.content}`
    )
    .join("\n\n---\n\n");
}

function documentOnlyReply(hasKb) {
  return {
    reply: hasKb ? NO_MATCH_MSG : NO_KB_MSG,
    sourceType: "none",
    sources: [],
  };
}

function uniqueFileSources(ranked) {
  let sources = ranked.map((r) => ({
    type: "file",
    title: r.chunk.fileName || "Tài liệu nội bộ",
  }));
  return sources.filter(
    (s, idx, arr) => arr.findIndex((x) => x.title === s.title) === idx
  );
}

function persistChatLog(req, payload) {
  const { origin, hostname } = resolveOriginHostname(req.body || {}, req.headers);
  const usage = payload.usage || emptyUsage();
  AiChatLog.create({
    question: String(payload.question || "").slice(0, 8000),
    answer: String(payload.answer || "").slice(0, 16000),
    sourceType: payload.sourceType || "none",
    sources: Array.isArray(payload.sources)
      ? payload.sources.slice(0, 10).map((s) => ({
          type: s.type || "",
          title: String(s.title || "").slice(0, 300),
          url: String(s.url || "").slice(0, 500),
        }))
      : [],
    chatModel: usage.chatModel || getChatModel(),
    embeddingModel: usage.embeddingModel || "",
    promptTokens: usage.promptTokens || 0,
    completionTokens: usage.completionTokens || 0,
    totalTokens: usage.totalTokens || 0,
    embeddingTokens: usage.embeddingTokens || 0,
    origin,
    hostname,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
  }).catch((err) => {
    console.error("AiChatLog save error:", err.message);
  });
}

function sendChatJson(req, res, question, body, usage) {
  persistChatLog(req, {
    question,
    answer: body.reply,
    sourceType: body.sourceType,
    sources: body.sources,
    usage,
  });
  return res.json(body);
}

async function retrieveRanked(history, question, chunks, usage) {
  const followUp = looksLikeFollowUp(question);
  const retrievalQuery = buildRetrievalQuery(history, question);
  const minScore = followUp ? MIN_SCORE_FOLLOWUP : MIN_SCORE;
  const lists = [];

  const embedded = await embedQuery(retrievalQuery);
  usage.embeddingTokens +=
    Number(embedded.totalTokens) || Number(embedded.promptTokens) || 0;
  usage.embeddingModel = embedded.model || getEmbeddingModel();
  lists.push(
    rankChunksByEmbedding(embedded.vector, chunks, {
      topK: TOP_K,
      minScore,
    })
  );

  if (followUp) {
    const prev = previousUserQuestions(history);
    const anchor = prev[prev.length - 1];
    if (anchor && anchor !== retrievalQuery) {
      const emb2 = await embedQuery(anchor);
      usage.embeddingTokens +=
        Number(emb2.totalTokens) || Number(emb2.promptTokens) || 0;
      lists.push(
        rankChunksByEmbedding(emb2.vector, chunks, {
          topK: TOP_K,
          minScore: MIN_SCORE_FOLLOWUP,
        })
      );
    }
  }

  const refs = extractLegalRefs(
    question,
    retrievalQuery,
    ...previousUserQuestions(history),
    lastAssistantSnippet(history)
  );
  lists.push(keywordRankChunks(chunks, refs));

  let ranked = mergeRanked(lists, TOP_K);
  if (ranked.length) {
    ranked = expandWithNeighbors(ranked, chunks, {
      radius: 1,
      limit: TOP_K + 4,
    });
  }
  return ranked;
}

function webSourcesFromSearch(search) {
  return (search?.results || [])
    .filter((r) => r.title || r.url)
    .slice(0, 5)
    .map((r) => ({
      type: "web",
      title: r.title || r.url || "Web",
      url: r.url || "",
    }));
}

function buildCombinedSystem(ranked, webBlock) {
  const hasFile = ranked.length > 0;
  const hasWeb = Boolean(webBlock && !String(webBlock).startsWith("Không có kết quả"));

  if (hasWeb && hasFile) {
    return `${BASE_SYSTEM}

Dữ liệu tham chiếu (chỉ để bạn dùng nội bộ; KHÔNG nêu tên nguồn trong câu trả lời).
Ưu tiên khối WEB; khối NỘI BỘ để đối chiếu.

[WEB]:
${webBlock}

[NỘI BỘ]:
${buildFileContext(ranked)}`;
  }

  if (hasWeb) {
    return `${BASE_SYSTEM}

Dữ liệu tham chiếu (không nêu nguồn trong câu trả lời):

[WEB]:
${webBlock}`;
  }

  if (hasFile) {
    return `${BASE_SYSTEM}

Dữ liệu tham chiếu (không nêu nguồn trong câu trả lời). Ưu tiên khối NỘI BỘ; thiếu thì dùng kiến thức ATGT của bạn.

[NỘI BỘ]:
${buildFileContext(ranked)}`;
  }

  return `${BASE_SYSTEM}

Không có đoạn tài liệu nội bộ khớp. Hãy trả lời từ kiến thức ATGT Việt Nam của bạn (ngắn gọn, trong phạm vi). Không chắc thì nói chưa rõ.`;
}

const chatController = {
  chat: async (req, res) => {
    const usage = emptyUsage();
    try {
      if (!process.env.API_GPT_4) {
        return res.status(503).json({ error: "Có lỗi xảy ra. Vui lòng thử lại sau." });
      }

      const history = sanitizeHistory(req.body?.history);
      const question = lastUserQuestion(history);
      if (!question) {
        return res.status(400).json({ error: "Thiếu câu hỏi của người dùng" });
      }

      const readyFiles = await AiKnowledgeFile.find({ status: "ready" })
        .select("_id originalName documentCode")
        .lean();
      const readyIds = readyFiles.map((f) => f._id);

      let ranked = [];
      const searchQuery = buildRetrievalQuery(history, question);

      const ragPromise = (async () => {
        if (!readyIds.length) return [];
        const chunks = await AiKnowledgeChunk.find({
          fileId: { $in: readyIds },
          embedding: { $exists: true, $ne: [] },
        })
          .select("content embedding fileName fileId chunkIndex")
          .lean();
        if (!chunks.length) return [];
        return retrieveRanked(history, question, chunks, usage);
      })();

      const webPromise = WEB_SEARCH_ENABLED
        ? (async () => {
            try {
              const { webSearch } = require("../utils/webSearch");
              return await webSearch(searchQuery);
            } catch (err) {
              console.error("webSearch:", err.message);
              return { provider: "none", results: [] };
            }
          })()
        : Promise.resolve({ provider: "none", results: [] });

      const [rankedResult, search] = await Promise.all([ragPromise, webPromise]);
      ranked = rankedResult || [];

      const { formatWebResults } = require("../utils/webSearch");
      const webBlock =
        search?.results?.length > 0 ? formatWebResults(search.results) : "";
      const hasWeb = Boolean(webBlock);
      const hasFile = ranked.length > 0;

      const systemContent = buildCombinedSystem(ranked, webBlock);
      const reply = await callChat(
        [{ role: "system", content: systemContent }, ...history],
        usage
      );
      if (!reply) {
        return res.status(500).json({ error: "Có lỗi xảy ra. Vui lòng thử lại sau." });
      }

      let sourceType = "none";
      let sources = [];
      if (hasFile && hasWeb) {
        sourceType = "mixed";
        sources = [...webSourcesFromSearch(search), ...uniqueFileSources(ranked)].slice(
          0,
          10
        );
      } else if (hasWeb) {
        sourceType = "web";
        sources = webSourcesFromSearch(search);
      } else if (hasFile) {
        sourceType = "file";
        sources = uniqueFileSources(ranked);
      } else {
        sourceType = "model";
        sources = [];
      }

      return sendChatJson(
        req,
        res,
        question,
        { reply, sourceType, sources },
        usage
      );
    } catch (error) {
      console.error("chat error:", error.message || error);
      const mapped = formatChatOpenAIError(error);
      return res.status(mapped.status).json({ error: mapped.error });
    }
  },
};

module.exports = chatController;
module.exports.chatRateLimiter = chatRateLimiter;
module.exports.__test = {
  sanitizeHistory,
  lastUserQuestion,
  previousUserQuestions,
  looksLikeFollowUp,
  buildRetrievalQuery,
  extractLegalRefs,
  mergeRanked,
  buildCombinedSystem,
  buildFileContext,
  WEB_SEARCH_ENABLED,
  MIN_SCORE,
  TOP_K,
  MAX_HISTORY,
  MAX_TOKENS,
  MAX_ASSISTANT_CHARS,
  SCOPE_REFUSE_MSG,
  BASE_SYSTEM,
};
