const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const videoSchema = new Schema({
    link: {
        type: String,
    },
    nameFile: String,
    sizeFile: String,
    name: String,
    mota: String,
    thutu: Number,
    totalView: Number,
    is_source_link_orther: Boolean,
    link_orther: String,
});

const Videos = mongoose.model('Videos', videoSchema);

module.exports = Videos;