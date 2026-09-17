const fs = require("fs");
const path = require("path");
const AiKnowledgeFile = require("../models/AiKnowledgeFile");
const AiKnowledgeChunk = require("../models/AiKnowledgeChunk");
const AiChatLog = require("../models/AiChatLog");
const { extractTextFromFile } = require("../utils/extractText");
const { chunkText } = require("../utils/textChunk");
const { embedTexts } = require("../utils/embeddings");
const { resolveOriginHostname } = require("./fanpage");

const KNOWLEDGE_DIR = path.join(__dirname, "../ai-knowledge");
const EMBED_BATCH_SIZE = 16;

function ensureKnowledgeDir() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }
}

async function processKnowledgeFile(fileDoc, meta = {}) {
  const filePath = path.join(KNOWLEDGE_DIR, fileDoc.storedName);
  try {
    if (!fs.existsSync(filePath)) {
      fileDoc.status = "failed";
      fileDoc.errorMessage = "Không tìm thấy file trên ổ đĩa server";
      fileDoc.chunkCount = 0;
      fileDoc.embeddingTokens = 0;
      await fileDoc.save();
      return;
    }

    const text = await extractTextFromFile(filePath, fileDoc.originalName);
    const chunks = chunkText(text).filter((c) => String(c || "").trim());

    if (!chunks.length) {
      fileDoc.status = "failed";
      fileDoc.errorMessage =
        "Không trích xuất được nội dung văn bản từ file. Với PDF scan/ảnh, hãy dùng DOCX, TXT hoặc PDF chọn được chữ.";
      fileDoc.chunkCount = 0;
      fileDoc.embeddingTokens = 0;
      await fileDoc.save();
      return;
    }

    // Clear old chunks before (re)processing
    await AiKnowledgeChunk.deleteMany({ fileId: fileDoc._id });

    const allEmbeddings = [];
    let embeddingModel = "";
    let embeddingTokens = 0;

    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const { vectors, model, promptTokens, totalTokens } = await embedTexts(
        batch
      );
      embeddingModel = model;
      embeddingTokens +=
        Number(totalTokens) || Number(promptTokens) || 0;
      allEmbeddings.push(...vectors);
    }

    const docs = [];
    for (let index = 0; index < chunks.length; index++) {
      const embedding = allEmbeddings[index];
      if (!Array.isArray(embedding) || !embedding.length) continue;
      docs.push({
        fileId: fileDoc._id,
        fileName: fileDoc.originalName,
        chunkIndex: index,
        content: chunks[index],
        embedding,
        embeddingModel,
      });
    }

    if (!docs.length) {
      fileDoc.status = "failed";
      fileDoc.errorMessage = "Embedding không tạo được vector cho bất kỳ chunk nào";
      fileDoc.chunkCount = 0;
      fileDoc.embeddingTokens = embeddingTokens;
      fileDoc.embeddingModel = embeddingModel || "";
      await fileDoc.save();
      return;
    }

    await AiKnowledgeChunk.insertMany(docs);

    fileDoc.status = "ready";
    fileDoc.chunkCount = docs.length;
    fileDoc.embeddingTokens = embeddingTokens;
    fileDoc.embeddingModel = embeddingModel || "";
    fileDoc.errorMessage = "";
    await fileDoc.save();

    AiChatLog.create({
      question: fileDoc.originalName || "Tài liệu kiến thức",
      answer: `Đã tạo ${docs.length} chunk embedding`,
      sourceType: "knowledge_upload",
      sources: [
        {
          type: "file",
          title: fileDoc.originalName || "file",
          url: "",
        },
      ],
      chatModel: "",
      embeddingModel: embeddingModel || "",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      embeddingTokens,
      origin: meta.origin || "",
      hostname: meta.hostname || "",
      userAgent: meta.userAgent || "",
    }).catch((err) => {
      console.error("AiChatLog knowledge_upload save error:", err.message);
    });
  } catch (err) {
    console.error("processKnowledgeFile:", err);
    fileDoc.status = "failed";
    let msg = err.message || "Lỗi xử lý file";
    if (msg.length > 500) msg = msg.slice(0, 500);
    fileDoc.errorMessage = msg;
    fileDoc.chunkCount = 0;
    fileDoc.embeddingTokens = 0;
    await fileDoc.save();
  }
}

function buildRequestMeta(req) {
  const { origin, hostname } = resolveOriginHostname(
    {
      origin: req.body?.origin,
      hostname: req.body?.hostname,
    },
    req.headers
  );
  return {
    origin,
    hostname,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
  };
}

const knowledgeController = {
  upload: async (req, res) => {
    try {
      ensureKnowledgeDir();
      if (!req.file) {
        return res.status(400).json({ message: "Vui lòng chọn file PDF, DOCX hoặc TXT" });
      }

      const originalName = Buffer.from(req.file.originalname || "file", "latin1").toString("utf8");
      const meta = buildRequestMeta(req);

      const fileDoc = await AiKnowledgeFile.create({
        originalName,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        status: "processing",
        uploadedBy: req.userId?.username || req.userId?.user || req.userId?.id || "",
        documentCode: String(req.body?.documentCode || "").trim().slice(0, 120),
        effectiveDate: String(req.body?.effectiveDate || "").trim().slice(0, 32),
        notes: String(req.body?.notes || "").trim().slice(0, 500),
      });

      setImmediate(() => {
        processKnowledgeFile(fileDoc, meta).catch((err) =>
          console.error("Knowledge process error:", err)
        );
      });

      return res.status(201).json({
        message: "Đã nhận file, đang xử lý embedding",
        item: fileDoc,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Lỗi upload file kiến thức" });
    }
  },

  list: async (_req, res) => {
    try {
      const items = await AiKnowledgeFile.find().sort({ createdAt: -1 }).lean();
      return res.json({ items });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Lỗi lấy danh sách file" });
    }
  },

  reprocess: async (req, res) => {
    try {
      const item = await AiKnowledgeFile.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "Không tìm thấy file" });
      }

      const filePath = path.join(KNOWLEDGE_DIR, item.storedName);
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({
          message: "File gốc không còn trên server, hãy upload lại",
        });
      }

      item.status = "processing";
      item.errorMessage = "";
      item.chunkCount = 0;
      await item.save();

      const meta = buildRequestMeta(req);
      setImmediate(() => {
        processKnowledgeFile(item, meta).catch((err) =>
          console.error("Knowledge reprocess error:", err)
        );
      });

      return res.json({
        message: "Đang chạy lại embedding",
        item,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Lỗi chạy lại embedding" });
    }
  },

  remove: async (req, res) => {
    try {
      const item = await AiKnowledgeFile.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "Không tìm thấy file" });
      }

      await AiKnowledgeChunk.deleteMany({ fileId: item._id });

      const filePath = path.join(KNOWLEDGE_DIR, item.storedName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      await item.deleteOne();
      return res.json({ message: "Đã xóa file kiến thức" });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Lỗi xóa file" });
    }
  },
};

module.exports = knowledgeController;
module.exports.KNOWLEDGE_DIR = KNOWLEDGE_DIR;
module.exports.ensureKnowledgeDir = ensureKnowledgeDir;
module.exports.processKnowledgeFile = processKnowledgeFile;
