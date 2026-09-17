const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const lichsuthiSchema = new Schema({
  thoigianbatdau: {
    type: Number,
  },
  thoigianketthuc: Number,
  thoigiannopbai: Number,
  questions: [{
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cauhois",
    },
    options_sort: [String],
    choice: String,
    is_sai: Number,
    is_khong_tra_loi: Number
  }],
  id_cuocthi: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cuocthis",
    },
  thongtinthisinh: {
    name: String,
    phone: String, // la  don vi
    birthday: String,
    donvi: String, // la so dien thoai
    hokhau: String,
    gioitinh: String,
    loaixe: String,
    hang_gplx: String,
    nghenghiep: String,
  },
  soluongcauhoi: Number,
  socaudung: Number,
  secretKey: String
}, {timestamps: true});

lichsuthiSchema.index({ id_cuocthi: 1, createdAt: 1 });
lichsuthiSchema.index({ "questions.question": 1 });
lichsuthiSchema.index({
  id_cuocthi: 1,
  "thongtinthisinh.gioitinh": 1,
  "thongtinthisinh.loaixe": 1,
  "thongtinthisinh.birthday": 1,
});
lichsuthiSchema.index({
  createdAt: 1,
  "thongtinthisinh.gioitinh": 1,
  "thongtinthisinh.loaixe": 1,
  "thongtinthisinh.birthday": 1,
});

const LichsuThis = mongoose.model(
  "LichsuThis",
  lichsuthiSchema
);

module.exports = LichsuThis;
