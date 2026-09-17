/**
 * Live e2e: web-first merge + optional KB unique string.
 * Usage: node scripts/e2e-ai-web-first.js
 * Needs: API_GPT_4, Mongo (connectDB), optional BING_SEARCH_KEY
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("../connectDB");
const AiKnowledgeFile = require("../models/AiKnowledgeFile");
const AiKnowledgeChunk = require("../models/AiKnowledgeChunk");
const { chunkText } = require("../utils/textChunk");
const { embedTexts, embedQuery, rankChunksByEmbedding } = require("../utils/embeddings");
const { getOpenAI, getChatModel } = require("../utils/openaiClient");
const { webSearch, formatWebResults } = require("../utils/webSearch");
const chatMod = require("../controllers/chat");
const T = chatMod.__test;

const KNOWLEDGE_DIR = path.join(__dirname, "../ai-knowledge");
const UNIQUE = "MA_BI_MAT_KIEN_THUC_C08_" + Date.now() + "_PHAT_999_TRIEU";

async function callChat(messages) {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: getChatModel(),
    messages,
  });
  return response?.choices?.[0]?.message?.content?.trim() || "";
}

async function main() {
  if (!process.env.API_GPT_4) throw new Error("Missing API_GPT_4");
  console.log("model:", getChatModel());
  console.log("web enabled flag:", T.WEB_SEARCH_ENABLED);

  // 1) Offline assert web section order
  const sys = T.buildCombinedSystem(
    [{ score: 0.9, chunk: { fileName: "t.txt", content: "Điều 1 nội bộ test." } }],
    formatWebResults([{ title: "Web", snippet: "Web cập nhật 2026", url: "https://x.gov.vn" }])
  );
  if (sys.indexOf("[DỮ LIỆU TÌM KIẾM TRÊN WEB]") > sys.indexOf("[DỮ LIỆU TÀI LIỆU NỘI BỘ]")) {
    throw new Error("WEB section must come before INTERNAL");
  }
  console.log("PASS: prompt order web-first");

  // 2) Live web search (bounded; never block e2e forever)
  console.log("web search...");
  const search = await webSearch("vượt đèn đỏ phạt bao nhiêu Nghị định giao thông Việt Nam");
  console.log("web provider:", search.provider, "results:", search.results?.length || 0);
  if (!search.results?.length) {
    console.warn("WARN: no web results — continue with synthetic web block");
  }
  const webBlock =
    search.results?.length > 0
      ? formatWebResults(search.results)
      : formatWebResults([
          {
            title: "Synthetic web",
            snippet: "Theo nguồn web mô phỏng, vượt đèn đỏ có thể bị phạt tiền theo nghị định hiện hành.",
            url: "https://example.gov.vn",
          },
        ]);

  await connectDB();
  if (!fs.existsSync(KNOWLEDGE_DIR)) fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });

  const storedName = `e2e-webfirst-${Date.now()}.txt`;
  const filePath = path.join(KNOWLEDGE_DIR, storedName);
  const content = [
    "TAI LIEU NOI BO TRO LY AO C08",
    `Quy dinh thu nghiem ma ${UNIQUE}.`,
    "Khi hoi ve ma nay, muc phat xe dap dien trong tai lieu noi bo la 999 trieu dong (chi de test).",
  ].join("\n");
  fs.writeFileSync(filePath, content, "utf8");

  const fileDoc = await AiKnowledgeFile.create({
    originalName: "e2e-webfirst-kb.txt",
    storedName,
    mimeType: "text/plain",
    size: Buffer.byteLength(content),
    status: "processing",
  });

  const chunks = chunkText(content);
  const { vectors, model } = await embedTexts(chunks);
  await AiKnowledgeChunk.insertMany(
    chunks.map((c, index) => ({
      fileId: fileDoc._id,
      fileName: fileDoc.originalName,
      chunkIndex: index,
      content: c,
      embedding: vectors[index],
      embeddingModel: model,
    }))
  );
  fileDoc.status = "ready";
  fileDoc.chunkCount = chunks.length;
  await fileDoc.save();
  console.log("KB ready chunks:", chunks.length);

  // 3) Unique KB question — expect answer with 999 from file (mixed or file)
  const qKb = `Ma bi mat ${UNIQUE} quy dinh muc phat xe dap dien bao nhieu?`;
  const { vector } = await embedQuery(qKb);
  const allChunks = await AiKnowledgeChunk.find({ fileId: fileDoc._id }).lean();
  const rankedKb = rankChunksByEmbedding(vector, allChunks, { topK: 4, minScore: 0.2 });
  console.log("KB retrieve hits:", rankedKb.length, rankedKb[0]?.score?.toFixed?.(3));

  const systemKb = T.buildCombinedSystem(rankedKb, webBlock);
  const replyKb = await callChat([
    { role: "system", content: systemKb },
    { role: "user", content: qKb },
  ]);
  console.log("KB reply:", replyKb.slice(0, 280));
  if (!/999/.test(replyKb)) {
    throw new Error("Expected KB unique fine 999 in reply");
  }
  console.log("PASS: unique KB fact preserved with web-first merge");

  // 4) General ATGT question — web should contribute
  const qWeb = "Vượt đèn đỏ xe máy bị phạt bao nhiêu theo quy định hiện hành?";
  const { vector: v2 } = await embedQuery(qWeb);
  const rankedGen = rankChunksByEmbedding(v2, allChunks, { topK: 4, minScore: 0.35 });
  const systemWeb = T.buildCombinedSystem(rankedGen, webBlock);
  const replyWeb = await callChat([
    { role: "system", content: systemWeb },
    { role: "user", content: qWeb },
  ]);
  console.log("General reply:", replyWeb.slice(0, 280));
  if (!replyWeb || replyWeb.length < 20) throw new Error("Empty general reply");
  console.log("PASS: general ATGT reply generated");

  // cleanup
  await AiKnowledgeChunk.deleteMany({ fileId: fileDoc._id });
  await AiKnowledgeFile.deleteOne({ _id: fileDoc._id });
  fs.unlinkSync(filePath);
  await mongoose.connection.close();
  console.log("\nE2E web-first: DONE");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("E2E FAIL:", err.message || err);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});
