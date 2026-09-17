const ExcelJS = require("exceljs");
const AiChatLog = require("../models/AiChatLog");
const { buildDateFilter, resolveOriginHostname } = require("./fanpage");
const {
  estimateUsd,
  usdToVnd,
  summarizeRows,
  finalizeSummary,
} = require("../utils/openaiPricing");

const PUBLIC_LIST_MAX = 5000;
const LIST_SELECT =
  "question answer sourceType sources chatModel embeddingModel promptTokens completionTokens totalTokens embeddingTokens origin hostname createdAt";

function buildAiChatQuery(req) {
  const { fromDate, toDate, hostname, q } = req.query;
  const query = {};

  const dateRange = buildDateFilter(fromDate, toDate);
  if (dateRange) query.createdAt = dateRange;

  if (hostname && String(hostname).trim()) {
    query.hostname = {
      $regex: String(hostname).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  }

  if (q && String(q).trim()) {
    query.question = {
      $regex: String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  }

  return query;
}

function withEstimatedUsd(row) {
  const estimatedUsd = estimateUsd({
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    embeddingTokens: row.embeddingTokens,
  });
  return {
    ...row,
    estimatedUsd,
    estimatedVnd: usdToVnd(estimatedUsd),
  };
}

function aggregateSummaryFromDb(match) {
  return AiChatLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        requestCount: { $sum: 1 },
        promptTokens: { $sum: { $ifNull: ["$promptTokens", 0] } },
        completionTokens: { $sum: { $ifNull: ["$completionTokens", 0] } },
        totalTokens: { $sum: { $ifNull: ["$totalTokens", 0] } },
        embeddingTokens: { $sum: { $ifNull: ["$embeddingTokens", 0] } },
      },
    },
  ]).then((rows) => {
    const acc = rows[0] || {
      requestCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      embeddingTokens: 0,
    };
    delete acc._id;
    return finalizeSummary(acc);
  });
}

module.exports = {
  buildAiChatQuery,
  withEstimatedUsd,

  publicList: async (req, res) => {
    try {
      const { fromDate, toDate } = req.query;
      if (!fromDate || !toDate) {
        return res.status(400).json({
          status: "failed",
          message: "Thiếu fromDate hoặc toDate",
        });
      }

      const dateRange = buildDateFilter(fromDate, toDate);
      if (!dateRange) {
        return res.status(400).json({
          status: "failed",
          message: "Khoảng ngày không hợp lệ",
        });
      }

      const match = { createdAt: dateRange };
      const [items, summary] = await Promise.all([
        AiChatLog.find(match)
          .select(LIST_SELECT)
          .sort({ createdAt: -1 })
          .limit(PUBLIC_LIST_MAX)
          .lean(),
        aggregateSummaryFromDb(match),
      ]);

      return res.status(200).json({
        items: items.map(withEstimatedUsd),
        total: items.length,
        summary,
      });
    } catch (error) {
      console.log("aichat publicList:", error.message);
      return res.status(500).json({
        status: "failed",
        message: "Không tải được danh sách hỏi đáp AI",
      });
    }
  },

  listLogs: async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const perPage = 20;
      const query = buildAiChatQuery(req);

      const [items, tongbanghi, summary] = await Promise.all([
        AiChatLog.find(query)
          .select(LIST_SELECT)
          .sort({ createdAt: -1 })
          .skip((page - 1) * perPage)
          .limit(perPage)
          .lean(),
        AiChatLog.countDocuments(query),
        aggregateSummaryFromDb(query),
      ]);

      return res.status(200).json({
        items: items.map(withEstimatedUsd),
        page,
        total: tongbanghi,
        tongbanghi,
        summary,
      });
    } catch (error) {
      console.log("aichat listLogs:", error.message);
      return res.status(500).json({
        status: "failed",
        message: "Không tải được danh sách hỏi đáp AI",
      });
    }
  },

  exportExcel: async (req, res) => {
    try {
      const query = buildAiChatQuery(req);
      const items = await AiChatLog.find(query)
        .select(LIST_SELECT)
        .sort({ createdAt: -1 })
        .limit(20000)
        .lean();

      const summary = summarizeRows(items);
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("AI Chat");
      sheet.columns = [
        { header: "Thời gian", key: "createdAt", width: 22 },
        { header: "Câu hỏi", key: "question", width: 50 },
        { header: "Trả lời", key: "answer", width: 50 },
        { header: "Nguồn", key: "sourceType", width: 12 },
        { header: "Model chat", key: "chatModel", width: 16 },
        { header: "Prompt tokens", key: "promptTokens", width: 14 },
        { header: "Completion tokens", key: "completionTokens", width: 16 },
        { header: "Embed tokens", key: "embeddingTokens", width: 14 },
        { header: "Hostname", key: "hostname", width: 28 },
        { header: "Origin", key: "origin", width: 32 },
      ];

      for (const row of items) {
        sheet.addRow({
          createdAt: row.createdAt
            ? new Date(row.createdAt).toLocaleString("vi-VN")
            : "",
          question: row.question || "",
          answer: row.answer || "",
          sourceType: row.sourceType || "",
          chatModel: row.chatModel || "",
          promptTokens: row.promptTokens || 0,
          completionTokens: row.completionTokens || 0,
          embeddingTokens: row.embeddingTokens || 0,
          hostname: row.hostname || "",
          origin: row.origin || "",
        });
      }

      const sumSheet = workbook.addWorksheet("Tong hop");
      sumSheet.addRow(["Tổng request", summary.requestCount]);
      sumSheet.addRow(["Prompt tokens (input)", summary.promptTokens]);
      sumSheet.addRow(["Completion tokens (output)", summary.completionTokens]);
      sumSheet.addRow(["Embedding tokens", summary.embeddingTokens]);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="AiChatLogs.xlsx"'
      );
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.log("aichat exportExcel:", error.message);
      return res.status(500).json({
        status: "failed",
        message: "Không xuất được Excel hỏi đáp AI",
      });
    }
  },
};

// re-export for tests / reuse
module.exports.resolveOriginHostname = resolveOriginHostname;
