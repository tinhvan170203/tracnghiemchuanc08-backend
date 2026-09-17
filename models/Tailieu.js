const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const tailieuSchema = new Schema({
    text: String,
    tieu_de: String,
    chu_thich: String,
    ghi_chu: String,
    file: String,
    thutu: Number
},{timestamps: true});

const Tailieus = mongoose.model('Tailieus', tailieuSchema);

module.exports = Tailieus;