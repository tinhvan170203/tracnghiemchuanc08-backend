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
