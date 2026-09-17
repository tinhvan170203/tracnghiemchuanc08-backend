const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const monthiSchema = new Schema({
    tenmonthi: { // nghiệp vụ an ninh, cảnh sát, tìm hiểu Hồ Chí Minh...
        type: String,
        unique: true
    },
    mota: String,
    thutu: Number,
    link_test: String,
    hien_thi_hoctap: {
        type: Boolean,
        default: false,
    },
});

const Monthis = mongoose.model('Monthis', monthiSchema);

module.exports = Monthis;