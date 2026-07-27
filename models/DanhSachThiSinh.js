const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const danhsachthisinhSchema = new Schema({
  hoten: {
    type: String,
  },
  namsinh: String,
  sbd: Number,
  sohieuCAND: String,
  capbac: String,
  chucvu: String,
  donvi: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Donvi",
  },
  cuocthi: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cuocthis",
  },
  donviString: String,
  cuocthiString: String,
});

const Danhsachthisinhs = mongoose.model(
  "Danhsachthisinhs",
  danhsachthisinhSchema
);

module.exports = Danhsachthisinhs;
