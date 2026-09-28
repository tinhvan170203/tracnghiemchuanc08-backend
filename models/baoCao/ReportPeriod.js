/**
 * MODULE BÁO CÁO — Một kỳ / cuộc báo cáo (tuNgay–denNgay).
 * schemaSnapshot: copy sections/fields lúc tạo/mở kỳ để sửa template sau không làm lệch số đã nộp.
 * assignees: danh sách đơn vị/user phải nộp (= sheet DANH MUC DON VI).
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const assigneeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "Users", default: null },
    tenDonVi: { type: String, default: "" },
    loaiDonVi: { type: String, default: "" },
  },
  { _id: false }
);

const reportPeriodSchema = new Schema(
  {
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "ReportTemplates",
      required: true,
    },
    tenKy: { type: String, required: true },
    tuNgay: { type: String, default: "" },
    denNgay: { type: String, default: "" },
    loaiBaoCao: { type: String, default: "Tháng" },
    status: {
      type: String,
      enum: ["draft", "open", "closed"],
      default: "draft",
    },
    nguon: { type: String, enum: ["local", "c08"], default: "local" },
    c08PeriodId: { type: String, default: null },
    metaValues: { type: Schema.Types.Mixed, default: {} },
    assignees: { type: [assigneeSchema], default: [] },
    /** Snapshot schema lúc mở kỳ — tránh lệch khi sửa template */
    schemaSnapshot: { type: Schema.Types.Mixed, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "Users", default: null },
  },
  { timestamps: true }
);

reportPeriodSchema.index({ status: 1, updatedAt: -1 });
reportPeriodSchema.index({ tuNgay: 1, denNgay: 1 });
reportPeriodSchema.index({ c08PeriodId: 1 });

module.exports = mongoose.model("ReportPeriods", reportPeriodSchema);
