const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const cauhoiSchema = new Schema({
    question: String,
    option_a: String,
    option_b: String,
    option_c: String,
    option_d: String,
    option_e: String,
    answer: String,
    image: String,
    chuyende: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Chuyendes",
    },
    chuyendeString: String
},{timestamps: true});

const Cauhois = mongoose.model('Cauhois', cauhoiSchema);

module.exports = Cauhois;