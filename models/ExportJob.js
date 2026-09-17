const mongoose = require("mongoose");

const exportJobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["ketqua-one", "ketqua-many"],
      required: true,
    },
    params: {
      type: Object,
      default: {},
    },
    status: {
      type: String,
      enum: ["queued", "running", "ready", "failed"],
      default: "queued",
      index: true,
    },
    progress: {
      processedRows: { type: Number, default: 0 },
      totalEstimate: { type: Number, default: 0 },
      percent: { type: Number, default: 0 },
    },
    message: { type: String, default: "" },
    filePath: String,
    fileName: String,
    error: String,
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  { timestamps: true }
);

exportJobSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("ExportJobs", exportJobSchema);
