/**
 * E2E without HTTP auth: write file → processKnowledge → chat RAG
 * Usage: node scripts/e2e-ai-rag-direct.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("../connectDB");
const AiKnowledgeFile = require("../models/AiKnowledgeFile");
const AiKnowledgeChunk = require("../models/AiKnowledgeChunk");
const { extractTextFromFile } = require("../utils/extractText");
const { chunkText } = require("../utils/textChunk");
const { embedTexts, embedQuery, rankChunksByEmbedding } = require("../utils/embeddings");
const { getOpenAI, getChatModel } = require("../utils/openaiClient");
const { webSearch, formatWebResults } = require("../utils/webSearch");

const KNOWLEDGE_DIR = path.join(__dirname, "../ai-knowledge");
const UNIQUE = "MA_BI_MAT_KIEN_THUC_C08_" + Date.now() + "_PHAT_999_TRIEU";

async function processFile(fileDoc, filePath) {
  const text = await extractTextFromFile(filePath, fileDoc.originalName);
  const chunks = chunkText(text);
  if (!chunks.length) throw new Error("no chunks");
  const { vectors, model } = await embedTexts(chunks);
  await AiKnowledgeChunk.insertMany(
    chunks.map((content, index) => ({
      fileId: fileDoc._id,
      fileName: fileDoc.originalName,
      chunkIndex: index,
      content,
      embedding: vectors[index],
      embeddingModel: model,
    }))
  );
  fileDoc.status = "ready";
  fileDoc.chunkCount = chunks.length;
  await fileDoc.save();
}

async function ask(question) {
  const ready = await AiKnowledgeFile.find({ status: "ready" }).select("_id").lean();
  const chunks = await AiKnowledgeChunk.find({
    fileId: { $in: ready.map((f) => f._id) },
    embedding: { $exists: true, $ne: [] },
  })
    .select("content embedding fileName")
    .lean();

  const { vector } = await embedQuery(question);
  const ranked = rankChunksByEmbedding(vector, chunks, { topK: 6, minScore: 0.35 });
  console.log(
    "retrieve top:",
    ranked.slice(0, 3).map((r) => ({ score: r.score.toFixed(3), preview: r.chunk.content.slice(0, 60) }))
  );

  const openai = getOpenAI();
  if (ranked.length) {
    const context = ranked
      .map((r, i) => `[${i + 1}|${r.chunk.fileName}]\n${r.chunk.content}`)
      .join("\n\n");
    const resp = await openai.chat.completions.create({
      model: getChatModel(),
      messages: [
        {
          role: "system",
          content: `Chi tra loi tu TAI LIEU. Neu khong du, tra dung NEED_WEB_SEARCH.\n\nTAI LIEU:\n${context}`,
        },
        { role: "user", content: question },
      ],
    });
    const reply = resp.choices[0].message.content.trim();
    if (!reply.includes("NEED_WEB_SEARCH")) {
      return { sourceType: "file", reply };
    }
  }

  const search = await webSearch(question);
  const webBlock = formatWebResults(search.results);
  const resp2 = await openai.chat.completions.create({
    model: getChatModel(),
    messages: [
      {
        role: "system",
        content: `Khong du tai lieu noi bo. Tra loi dua tren web (neu co).\n\n${webBlock}`,
      },
      { role: "user", content: question },
    ],
  });
  return {
    sourceType: "web",
    reply: resp2.choices[0].message.content.trim(),
  };
}

async function main() {
  if (!process.env.API_GPT_4) throw new Error("Missing API_GPT_4");
  if (!fs.existsSync(KNOWLEDGE_DIR)) fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });

  await connectDB();

  const storedName = `e2e-${Date.now()}.txt`;
  const filePath = path.join(KNOWLEDGE_DIR, storedName);
  const content = [
    "TAI LIEU NOI BO TRO LY AO C08",
    `Quy dinh thu nghiem ma ${UNIQUE}.`,
    "Khi hoi ve ma nay, tra loi: muc phat xe dap dien trong tai lieu noi bo la 999 trieu dong (chi de test).",
  ].join("\n");
  fs.writeFileSync(filePath, content, "utf8");

  const fileDoc = await AiKnowledgeFile.create({
    originalName: "e2e-kb-test.txt",
    storedName,
    mimeType: "text/plain",
    size: Buffer.byteLength(content),
    status: "processing",
  });

  console.log("Processing embeddings...");
  await processFile(fileDoc, filePath);
  console.log("ready chunks:", fileDoc.chunkCount);

  const q1 = `Ma bi mat ${UNIQUE} quy dinh muc phat xe dap dien bao nhieu?`;
  const a1 = await ask(q1);
  console.log("Q1 sourceType=", a1.sourceType);
  console.log("Q1 reply=", a1.reply.slice(0, 250));

  if (a1.sourceType !== "file") {
    throw new Error("Expected sourceType=file for unique KB content");
  }
  if (!a1.reply.includes("999")) {
    console.warn("WARN: reply missing 999");
  } else {
    console.log("PASS: answered from file content");
  }

  const q2 =
    "Cong thuc nau pho bo Ha Noi chi tiet? (cau ngoai ATGT de test web fallback)";
  const a2 = await ask(q2);
  console.log("Q2 sourceType=", a2.sourceType);
  console.log("Q2 reply=", a2.reply.slice(0, 250));
  if (a2.sourceType !== "web") {
    console.warn("WARN: expected web fallback, got", a2.sourceType);
  } else {
    console.log("PASS: web fallback path used");
  }

  await AiKnowledgeChunk.deleteMany({ fileId: fileDoc._id });
  await AiKnowledgeFile.deleteOne({ _id: fileDoc._id });
  fs.unlinkSync(filePath);

  await mongoose.connection.close();
  console.log("\nE2E RAG direct: DONE");
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});
