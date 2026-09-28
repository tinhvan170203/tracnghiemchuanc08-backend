/**
 * MODULE BÁO CÁO — Phiếu nhập của 1 đơn vị × 1 kỳ.
 * Unique (periodId, userId). values = map fieldKey → giá trị; sectionDone = đã xong từng Biểu.
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const reportSubmissionSchema = new Schema(
  {
    periodId: {
      type: Schema.Types.ObjectId,
      ref: "ReportPeriods",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    tenDonVi: { type: String, default: "" },
    values: { type: Schema.Types.Mixed, default: {} },
    /** Thông tin chung phiếu (theo metaFields của template snapshot) */
    metaValues: { type: Schema.Types.Mixed, default: {} },
    sectionDone: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ["draft", "submitted"],
      default: "draft",
    },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reportSubmissionSchema.index({ periodId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("ReportSubmissions", reportSubmissionSchema);
