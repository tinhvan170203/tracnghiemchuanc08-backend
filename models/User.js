const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const userSchema = new Schema({
    tentaikhoan: {
        type: String
    },
    /** Tên hiển thị (dùng trên báo cáo, danh sách…) — trống thì dùng tentaikhoan */
    tenHienThi: {
        type: String,
        default: "",
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