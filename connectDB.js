const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        // await mongoose.connect("mongodb://vuvantinh:Tv170203@localhost:4567/thitracnghiem?authSource=admin", {
        await mongoose.connect("mongodb://vuvantinh:Tv170203@localhost:4568/thitracnghiem?authSource=admin", {
          maxPoolSize: 10,
          minPoolSize: 2,
          socketTimeoutMS: 45000, // Đợi 45s trước khi ngắt socket lỗi
          serverSelectionTimeoutMS: 5000, // Giới hạn thời gian chọn server
          heartbeatFrequencyMS: 10000, // Kiểm tra trạng thái DB mỗi 10s
        });
        console.log('Kết nối DB thành công');
      } catch (err) {
        console.error('Lỗi kết nối DB:', err);
      }
};

module.exports = connectDB;