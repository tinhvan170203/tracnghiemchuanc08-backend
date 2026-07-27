const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const donviSchema = new Schema({
    tendonvi: {
        type: String
    },
    kyhieu: String,
    thutu: Number
});

const Donvis = mongoose.model('Donvi', donviSchema);

module.exports = Donvis;