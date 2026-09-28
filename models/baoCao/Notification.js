/**
 * MODULE BÁO CÁO — Thông báo in-app (chuông).
 * Collection BaoCaoNotifications — tách khỏi module khác.
 * type: bao_cao_moi | c08_bieu_mau | nhac_nop | he_thong
 */
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    link: { type: String, default: "" },
    type: {
      type: String,
      enum: ["bao_cao_moi", "c08_bieu_mau", "nhac_nop", "he_thong"],
      default: "he_thong",
    },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model("BaoCaoNotifications", notificationSchema);
