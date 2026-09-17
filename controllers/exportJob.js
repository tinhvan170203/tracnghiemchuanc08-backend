const fs = require("fs");
const path = require("path");
const ExportJob = require("../models/ExportJob");
const Cuocthis = require("../models/Cuocthi");
const {
  createKetquaExportJob,
  getUserId,
  enqueueExportJob,
} = require("../services/exportJobWorker");
const { parseExportParams } = require("../utils/ketquaExport");
const { filterAccessibleCuocthiIds } = require("../utils/cuocthiAccess");

function jobPublicView(job) {
  return {
    _id: job._id,
    jobId: job._id,
    type: job.type,
    status: job.status,
    progress: job.progress || {},
    message: job.message || "",
    fileName: job.fileName || "",
    error: job.error || "",
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    mode: "async",
  };
}

module.exports = {
  createJob: async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "You are not authenticated" });
      }

      const body = { ...(req.body || {}), ...(req.query || {}) };
      const params = parseExportParams(body);
      const allowedIds = await filterAccessibleCuocthiIds(
        req.user,
        params.ids,
        Cuocthis
      );
      if (!allowedIds.length) {
        return res.status(400).json({
          status: "failed",
          message: "Không có cuộc đánh giá nào trong phạm vi được phép xuất",
        });
      }
      body.ids = allowedIds;

      const type =
        body.type === "ketqua-one" || body.type === "ketqua-many"
          ? body.type
          : allowedIds.length === 1
            ? "ketqua-one"
            : "ketqua-many";

      const job = await createKetquaExportJob(userId, type, body);
      return res.status(201).json(jobPublicView(job));
    } catch (error) {
      console.log("create export job lỗi:", error.message);
      return res.status(error.status || 500).json({
        status: "failed",
        message: error.message || "Không tạo được job xuất",
        jobId: error.jobId,
      });
    }
  },

  getJob: async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "You are not authenticated" });
      }

      const job = await ExportJob.findById(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Không tìm thấy job xuất" });
      }
      if (String(job.userId) !== String(userId)) {
        return res.status(403).json({ message: "Không có quyền xem job này" });
      }
      return res.json(jobPublicView(job));
    } catch (error) {
      return res.status(500).json({
        status: "failed",
        message: "Không lấy được trạng thái job",
      });
    }
  },

  downloadJob: async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "You are not authenticated" });
      }

      const job = await ExportJob.findById(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Không tìm thấy job xuất" });
      }
      if (String(job.userId) !== String(userId)) {
        return res.status(403).json({ message: "Không có quyền tải file này" });
      }
      if (job.status !== "ready" || !job.filePath) {
        return res.status(409).json({
          message: "File chưa sẵn sàng để tải",
          status: job.status,
        });
      }
      if (job.expiresAt && new Date(job.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ message: "File xuất đã hết hạn" });
      }
      if (!fs.existsSync(job.filePath)) {
        return res.status(404).json({ message: "File xuất không còn trên máy chủ" });
      }

      const fileName = job.fileName || path.basename(job.filePath);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      return fs.createReadStream(job.filePath).pipe(res);
    } catch (error) {
      console.log("download export job lỗi:", error.message);
      if (res.headersSent) {
        try {
          res.end();
        } catch (_) {
          /* ignore */
        }
        return;
      }
      return res.status(500).json({
        status: "failed",
        message: "Không tải được file xuất",
      });
    }
  },

  /** Dùng nội bộ từ sync export khi vượt ngưỡng */
  createJobForUser: createKetquaExportJob,
  enqueueExportJob,
  jobPublicView,
};
