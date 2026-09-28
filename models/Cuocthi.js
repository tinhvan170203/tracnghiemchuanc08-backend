const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const cuocthiSchema = new Schema({
  tencuocthi: {
    type: String,
  },
  status: {
    type: Boolean,
    default: false
  }
  ,
  monthi: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Monthis",
  },
  soluongcauhoi: Number,
  thoigianthi: Number,
  ngaytochucthi: String,
  monthiString: String,
  config: [{
    chuyende: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chuyendes"
    },
    soluongcauhoi: Number
  }],
  tongsonguoithamgia: { type: Number, default: 0 },
  canbothamgiatuyentruyen: { type: String},
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Users",
    default: null,
    index: true,
  },
  /** Ký cam kết sau nộp bài — snapshot nội dung hiệu lực của cuộc */
  camKet: {
    enabled: { type: Boolean, default: false },
    mode: { type: String, enum: ["template", "custom"], default: "custom" },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CamKetTemplates",
      default: null,
    },
    snapshot: {
      ten: { type: String, default: "" },
      questions: { type: Array, default: [] },
      freeText: { type: Schema.Types.Mixed, default: null },
      signature: { type: Schema.Types.Mixed, default: null },
    },
  },
}, { timestamps: true });

cuocthiSchema.index({ monthi: 1, createdAt: -1 });
cuocthiSchema.index({ monthi: 1, createdBy: 1, createdAt: -1 });
cuocthiSchema.index({ "config.chuyende": 1 });
cuocthiSchema.index({ createdBy: 1, createdAt: -1 });
const Cuocthis = mongoose.model(
  "Cuocthis",
  cuocthiSchema
);

module.exports = Cuocthis;
