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
    errorMessage: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AiKnowledgeFile", aiKnowledgeFileSchema);
