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
    choice: String
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
    hokhau: String
  },
  soluongcauhoi: Number,
  socaudung: Number,
  secretKey: String
}, {timestamps: true});

const LichsuThis = mongoose.model(
  "LichsuThis",
  lichsuthiSchema
);

module.exports = LichsuThis;
