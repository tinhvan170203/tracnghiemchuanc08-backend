const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const chuyendeSchema = new Schema({
    title: String,
    monthi: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Monthis",
    },
    link_test: String
},{timestamps: true});

const Chuyendes = mongoose.model('Chuyendes', chuyendeSchema);

module.exports = Chuyendes;