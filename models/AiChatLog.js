const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const aiChatLogSchema = new Schema(
  {
    question: { type: String, default: "" },
    answer: { type: String, default: "" },
    sourceType: { type: String, default: "none" },
    sources: [
      {
        type: { type: String },
        title: String,
        url: String,
      },
    ],
    chatModel: { type: String, default: "" },
    embeddingModel: { type: String, default: "" },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    embeddingTokens: { type: Number, default: 0 },
    origin: { type: String, default: "" },
    hostname: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true }
);

aiChatLogSchema.index({ createdAt: -1 });
aiChatLogSchema.index({ hostname: 1, createdAt: -1 });
aiChatLogSchema.index({ question: "text" });

module.exports = mongoose.model("AiChatLog", aiChatLogSchema);
