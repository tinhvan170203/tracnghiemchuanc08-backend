/**
 * Insert one AiChatLog and verify publicList aggregation.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const AiChatLog = require("../models/AiChatLog");
const { estimateUsd } = require("../utils/openaiPricing");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");
  await mongoose.connect(uri);

  const doc = await AiChatLog.create({
    question: "[SMOKE] Phạt vượt đèn đỏ bao nhiêu?",
    answer: "[SMOKE] Đây là câu trả lời kiểm thử.",
    sourceType: "file",
    sources: [{ type: "file", title: "smoke.pdf", url: "" }],
    chatModel: "gpt-5-nano",
    embeddingModel: "text-embedding-3-small",
    promptTokens: 1200,
    completionTokens: 300,
    totalTokens: 1500,
    embeddingTokens: 40,
    origin: "http://localhost:5173",
    hostname: "localhost",
    userAgent: "smoke-script",
  });

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);

  const items = await AiChatLog.find({
    createdAt: { $gte: from, $lte: to },
    question: /\[SMOKE\]/,
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  const agg = await AiChatLog.aggregate([
    {
      $match: {
        createdAt: { $gte: from, $lte: to },
        question: /\[SMOKE\]/,
      },
    },
    {
      $group: {
        _id: null,
        requestCount: { $sum: 1 },
        promptTokens: { $sum: "$promptTokens" },
        completionTokens: { $sum: "$completionTokens" },
        embeddingTokens: { $sum: "$embeddingTokens" },
      },
    },
  ]);

  const usd = estimateUsd(items[0] || {});
  console.log(
    JSON.stringify(
      {
        insertedId: String(doc._id),
        found: items.length,
        sampleSourceType: items[0]?.sources?.[0]?.type,
        agg: agg[0],
        estimatedUsd: usd,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
