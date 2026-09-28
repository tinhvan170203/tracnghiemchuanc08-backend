/**
 * MODULE BÁO CÁO — Model biểu mẫu (template) dùng lại cho nhiều kỳ.
 * Map Excel BM: sections ≈ sheet Biểu 1…7; fields ≈ cột chỉ tiêu; summaryItems ≈ sheet TONG HOP.
 * Không liên quan môn thi / cuộc thi — collection riêng ReportTemplates.
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/** Một cột chỉ tiêu trong Biểu.
 * aggregatable = hiện trên hàng TỔNG CỘNG; formula = CT ô tổng (rỗng = SUM).
 */
const fieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    groupKey: { type: String, default: "" },
    dataType: {
      type: String,
      enum: ["number", "text", "date", "boolean"],
      default: "number",
    },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    unit: { type: String, default: "" },
    aggregatable: { type: Boolean, default: true },
    /** Công thức ô TỔNG CỘNG; để trống = SUM các đơn vị */
    formula: { type: String, default: "" },
    visibleForRoles: { type: [String], default: [] },
  },
  { _id: false }
);

const groupSchema = new Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    sheetName: { type: String, default: "" },
    order: { type: Number, default: 0 },
    groups: { type: [groupSchema], default: [] },
    fields: { type: [fieldSchema], default: [] },
  },
  { _id: false }
);

const metaFieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    dataType: {
      type: String,
      enum: ["number", "text", "date", "boolean", "select"],
      default: "text",
    },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const summaryItemSchema = new Schema(
  {
    label: { type: String, required: true },
    /** field = lấy 1 key sau SUM; formula = công thức trên các tổng key */
    mode: {
      type: String,
      enum: ["field", "formula"],
      default: "field",
    },
    sourceFieldKey: { type: String, default: "" },
    /** VD: "so_a / so_b * 100" — chỉ dùng key đã SUM + số + + - * / ( ) */
    formula: { type: String, default: "" },
    unit: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const reportTemplateSchema = new Schema(
  {
    ten: { type: String, required: true },
    mota: { type: String, default: "" },
    version: { type: Number, default: 1 },
    nguon: { type: String, enum: ["local", "c08"], default: "local" },
    c08Id: { type: String, default: null },
    /** Bật hàng TỔNG CỘNG trên tổng hợp / Excel BM */
    coHangTongCong: { type: Boolean, default: true },
    metaFields: { type: [metaFieldSchema], default: [] },
    sections: { type: [sectionSchema], default: [] },
    summaryItems: { type: [summaryItemSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "Users", default: null },
  },
  { timestamps: true }
);

reportTemplateSchema.index({ ten: 1 });
reportTemplateSchema.index({ c08Id: 1 });

module.exports = mongoose.model("ReportTemplates", reportTemplateSchema);
