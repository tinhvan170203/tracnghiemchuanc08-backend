const rateLimit = require("express-rate-limit");
const AiKnowledgeChunk = require("../models/AiKnowledgeChunk");
const AiKnowledgeFile = require("../models/AiKnowledgeFile");
const { getOpenAI, getChatModel } = require("../utils/openaiClient");
const { embedQuery, rankChunksByEmbedding } = require("../utils/embeddings");
const { webSearch, formatWebResults } = require("../utils/webSearch");

const NEED_WEB_MARKER = "NEED_WEB_SEARCH";
const MIN_SCORE = Number(process.env.AI_RAG_MIN_SCORE || 0.35);
const TOP_K = Number(process.env.AI_RAG_TOP_K || 6);
const MAX_HISTORY = 20;

const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Bạn gửi quá nhiều câu hỏi. Vui lòng thử lại sau." },
});

const BASE_SYSTEM = `Bạn là Trợ lý ảo cảnh sát giao thông (C08).
QUY TẮC:
1. Chỉ trả lời vấn đề liên quan an toàn giao thông, Luật Đường bộ, Nghị định 168/2024/NĐ-CP và quy định ATGT Việt Nam.
2. Không dùng Markdown (không **, #, danh sách phức tạp). Trả lời plain text, ngắn gọn, lịch sự.
3. Không bịa thông tin.`;

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
    .map((m) => ({
      role: m.role,
      content: String(m.content).slice(0, 4000),
    }))
    .slice(-MAX_HISTORY);
}

function lastUserQuestion(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].content;
  }
  return "";
}

async function callChat(messages) {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: getChatModel(),
    messages,
    temperature: 0.2,
  });
  return response?.choices?.[0]?.message?.content?.trim() || "";
}

function buildFileContext(ranked) {
  return ranked
    .map(
      (item, i) =>
        `[Tài liệu ${i + 1} | ${item.chunk.fileName || "file"} | score=${item.score.toFixed(3)}]\n${item.chunk.content}`
    )
    .join("\n\n---\n\n");
}

const chatController = {
  chat: async (req, res) => {
    try {
      if (!process.env.API_GPT_4) {
        return res.status(503).json({ error: "Chưa cấu hình API_GPT_4" });
      }

      const history = sanitizeHistory(req.body?.history);
      const question = lastUserQuestion(history);
      if (!question) {
        return res.status(400).json({ error: "Thiếu câu hỏi của người dùng" });
      }

      const readyFiles = await AiKnowledgeFile.find({ status: "ready" })
        .select("_id")
        .lean();
      const readyIds = readyFiles.map((f) => f._id);

      let ranked = [];
      if (readyIds.length) {
        const chunks = await AiKnowledgeChunk.find({
          fileId: { $in: readyIds },
          embedding: { $exists: true, $ne: [] },
        })
          .select("content embedding fileName fileId")
          .lean();

        if (chunks.length) {
          const { vector } = await embedQuery(question);
          ranked = rankChunksByEmbedding(vector, chunks, {
            topK: TOP_K,
            minScore: MIN_SCORE,
          });
        }
      }

      let reply = "";
      let sourceType = "web";
      let sources = [];

      const tryFromFiles = ranked.length > 0;

      if (tryFromFiles) {
        const context = buildFileContext(ranked);
        const fileSystem = {
          role: "system",
          content: `${BASE_SYSTEM}

ƯU TIÊN TUYỆT ĐỐI tài liệu nội bộ bên dưới.
Chỉ trả lời dựa trên TÀI LIỆU NỘI BỘ.
Nếu tài liệu không đủ căn cứ để trả lời chính xác, hãy trả lời ĐÚNG MỘT DÒNG gồm đúng chuỗi: ${NEED_WEB_MARKER}
Không giải thích thêm khi dùng marker đó.

TÀI LIỆU NỘI BỘ:
${context}`,
        };

        reply = await callChat([fileSystem, ...history]);

        if (reply && !reply.includes(NEED_WEB_MARKER)) {
          sourceType = "file";
          sources = ranked.map((r) => ({
            type: "file",
            title: r.chunk.fileName || "Tài liệu nội bộ",
          }));
          // unique by title
          sources = sources.filter(
            (s, idx, arr) => arr.findIndex((x) => x.title === s.title) === idx
          );
          return res.json({ reply, sourceType, sources });
        }
      }

      // Web fallback
      const search = await webSearch(question);
      const webBlock = formatWebResults(search.results);

      const webSystem = {
        role: "system",
        content: `${BASE_SYSTEM}

Không tìm thấy đủ thông tin trong tài liệu nội bộ (hoặc chưa có tài liệu).
Hãy trả lời dựa trên KẾT QUẢ TÌM KIẾM WEB bên dưới.
Nêu rõ đây là thông tin ngoài tài liệu nội bộ nếu cần.
Nếu vẫn không đủ, nói trung thực là chưa có thông tin chắc chắn.

KẾT QUẢ TÌM KIẾM WEB:
${webBlock}`,
      };

      reply = await callChat([webSystem, ...history]);
      if (!reply) {
        return res.status(500).json({ error: "Lỗi trả lời từ AI" });
      }

      sourceType = search.results?.length ? "web" : "web";
      sources = (search.results || [])
        .filter((r) => r.title || r.url)
        .slice(0, 5)
        .map((r) => ({
          type: "web",
          title: r.title || r.url || "Web",
          url: r.url || "",
        }));

      if (tryFromFiles && ranked.length) {
        sourceType = "mixed";
      }

      return res.json({ reply, sourceType, sources });
    } catch (error) {
      console.error("chat error:", error.message);
      return res.status(500).json({ error: "Lỗi máy chủ AI" });
    }
  },
};

module.exports = chatController;
module.exports.chatRateLimiter = chatRateLimiter;
