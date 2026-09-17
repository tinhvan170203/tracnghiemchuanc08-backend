const mongoose = require("mongoose");

const aiKnowledgeFileSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
    chunkCount: { type: Number, default: 0 },
    embeddingTokens: { type: Number, default: 0 },
    embeddingModel: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    /** Số hiệu văn bản (vd. 168/2024/NĐ-CP) */
    documentCode: { type: String, default: "" },
    /** Ngày hiệu lực yyyy-mm-dd nếu biết */
    effectiveDate: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AiKnowledgeFile", aiKnowledgeFileSchema);
