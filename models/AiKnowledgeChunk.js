const mongoose = require("mongoose");

const aiKnowledgeChunkSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiKnowledgeFile",
      required: true,
      index: true,
    },
    fileName: { type: String, default: "" },
    chunkIndex: { type: Number, required: true },
    content: { type: String, required: true },
    embedding: { type: [Number], default: [] },
    embeddingModel: { type: String, default: "text-embedding-3-small" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AiKnowledgeChunk", aiKnowledgeChunkSchema);
