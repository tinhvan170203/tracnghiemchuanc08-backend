const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const userSchema = new Schema({
    tentaikhoan: {
        type: String
    },
    matkhau: String,
    thutu: Number,
    roles: [String],
    quantrinhomdonvi: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Monthis"
    }]
});

const Users = mongoose.model('Users', userSchema);

module.exports = Users;