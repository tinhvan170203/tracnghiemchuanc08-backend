const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const chuyendeSchema = new Schema({
    title: String,
    monthi: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Monthis",
    },
    link_test: String,
    hien_thi_hoctap: {
        type: Boolean,
        default: false,
    },
},{timestamps: true});

chuyendeSchema.index({ monthi: 1 });

const Chuyendes = mongoose.model('Chuyendes', chuyendeSchema);

module.exports = Chuyendes;