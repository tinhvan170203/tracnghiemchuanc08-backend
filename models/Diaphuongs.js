const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const diaphuongSchema = new Schema({
    text: String,
    domain: String,
    thutu: Number
},{timestamps: true});

const Diaphuongs = mongoose.model('Diaphuongs', diaphuongSchema);

module.exports = Diaphuongs;