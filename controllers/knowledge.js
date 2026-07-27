const fs = require("fs");
const path = require("path");
const AiKnowledgeFile = require("../models/AiKnowledgeFile");
const AiKnowledgeChunk = require("../models/AiKnowledgeChunk");
const { extractTextFromFile } = require("../utils/extractText");
const { chunkText } = require("../utils/textChunk");
const { embedTexts } = require("../utils/embeddings");

const KNOWLEDGE_DIR = path.join(__dirname, "../ai-knowledge");

function ensureKnowledgeDir() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }
}

async function processKnowledgeFile(fileDoc) {
  const filePath = path.join(KNOWLEDGE_DIR, fileDoc.storedName);
  try {
    const text = await extractTextFromFile(filePath, fileDoc.originalName);
    const chunks = chunkText(text);

    if (!chunks.length) {
      fileDoc.status = "failed";
      fileDoc.errorMessage = "Không trích xuất được nội dung văn bản từ file";
      fileDoc.chunkCount = 0;
      await fileDoc.save();
      return;
    }

    const batchSize = 32;
    const allEmbeddings = [];
    let embeddingModel = "";

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const { vectors, model } = await embedTexts(batch);
      embeddingModel = model;
      allEmbeddings.push(...vectors);
    }

    const docs = chunks.map((content, index) => ({
      fileId: fileDoc._id,
      fileName: fileDoc.originalName,
      chunkIndex: index,
      content,
      embedding: allEmbeddings[index],
      embeddingModel,
    }));

    await AiKnowledgeChunk.insertMany(docs);

    fileDoc.status = "ready";
    fileDoc.chunkCount = docs.length;
    fileDoc.errorMessage = "";
    await fileDoc.save();
  } catch (err) {
    console.error("processKnowledgeFile:", err);
    fileDoc.status = "failed";
    fileDoc.errorMessage = err.message || "Lỗi xử lý file";
    fileDoc.chunkCount = 0;
    await fileDoc.save();
  }
}

const knowledgeController = {
  upload: async (req, res) => {
    try {
      ensureKnowledgeDir();
      if (!req.file) {
        return res.status(400).json({ message: "Vui lòng chọn file PDF, DOCX hoặc TXT" });
      }

      const originalName = Buffer.from(req.file.originalname || "file", "latin1").toString("utf8");

      const fileDoc = await AiKnowledgeFile.create({
        originalName,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        status: "processing",
        uploadedBy: req.userId?.username || req.userId?.user || req.userId?.id || "",
      });

      // Process async so upload returns quickly
      setImmediate(() => {
        processKnowledgeFile(fileDoc).catch((err) =>
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
