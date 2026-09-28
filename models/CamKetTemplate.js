/**
 * Mẫu ký cam kết dùng chung — chọn nhanh khi cấu hình cuộc đánh giá.
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const optionSchema = new Schema(
  {
    value: { type: String, default: "" },
    label: { type: String, default: "" },
  },
  { _id: false }
);

const questionSchema = new Schema(
  {
    key: { type: String, default: "" },
    noiDung: { type: String, default: "" },
    type: { type: String, enum: ["single", "multi"], default: "single" },
    options: { type: [optionSchema], default: [] },
    required: { type: Boolean, default: true },
  },
  { _id: false }
);

const camKetTemplateSchema = new Schema(
  {
    ten: { type: String, required: true },
    mota: { type: String, default: "" },
    active: { type: Boolean, default: true },
    questions: { type: [questionSchema], default: [] },
    freeText: {
      enabled: { type: Boolean, default: true },
      label: { type: String, default: "Nội dung cam kết" },
      placeholder: { type: String, default: "Viết nội dung cam kết..." },
      required: { type: Boolean, default: true },
      minLength: { type: Number, default: 10 },
    },
    signature: {
      enabled: { type: Boolean, default: true },
      required: { type: Boolean, default: true },
      label: { type: String, default: "Chữ ký" },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      default: null,
    },
  },
  { timestamps: true }
);

camKetTemplateSchema.index({ active: 1, updatedAt: -1 });

module.exports = mongoose.model("CamKetTemplates", camKetTemplateSchema);
