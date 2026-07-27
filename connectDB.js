const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI chưa được cấu hình trong .env");
    }

    await mongoose.connect(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
    });
    console.log("Kết nối DB thành công");
  } catch (err) {
    console.error("Lỗi kết nối DB:", err.message || err);
  }
};

module.exports = connectDB;
