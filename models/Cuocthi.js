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
}, { timestamps: true });

const Cuocthis = mongoose.model(
  "Cuocthis",
  cuocthiSchema
);

module.exports = Cuocthis;
