const express = require('express');
const https = require('https');
const app = express();
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv').config();
var cookies = require("cookie-parser");
var bodyParser = require('body-parser')
const { OpenAI } = require('openai');
app.use(cookies());
const fs = require('fs')
const rateLimit = require('express-rate-limit');
const helmet = require('helmet')
const connectDB = require("./connectDB.js");
const Cauhois = require('./models/CauHoi');
const LichsuThis = require('./models/LichsuThi.js');
const xss = require('xss-clean');
const RedisStore = require('rate-limit-redis').default;
const sharp = require("sharp");
// const path = require("path");
const { createClient } = require('redis');
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 3 phút
//   max: 100, // Giới hạn mỗi IP tối đa 100 request
//   standardHeaders: true, // Trả về thông tin giới hạn trong header `RateLimit-*`
//   legacyHeaders: false, // Tắt header `X-RateLimit-*` cũ
// });

// Sử dụng middleware
// app.use(limiter);
const crypto = require('crypto');
// Cần một khóa bí mật (32 ký tự) và một vector khởi tạo (16 ký tự)
// Trong thực tế, hãy lưu cái này vào file .env, KHÔNG để trực tiếp trong code
// const SECRET_KEY = Buffer.from('12345678901234567890123456789012'); // 32 bytes
const IV_LENGTH = 16;

// 1. Hàm mã hóa (Dùng cho Tên, Tuổi, SĐT...)
const encryptData = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', process.env.SECRET_KEY, iv);
  let encrypted = cipher.update(text.toString());
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  // Trả về iv + dữ liệu mã hóa để sau này còn giải mã được
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};
// 1. CẤU HÌNH HELMET (Quan trọng để sửa lỗi COOP và Inline Script)

// app.use(
//   helmet({
//     contentSecurityPolicy: {
//       directives: {
//         "default-src": ["'self'"],
//         "script-src": [
//           "'self'",
//           "'unsafe-inline'",
//           "https://antoangiaothong.conganhungyen.com/"
//         ],
//         "style-src": ["'self'", "'unsafe-inline'"],
//         "img-src": [
//           "'self'",
//           "data:",
//           "blob:",
//           "https://antoangiaothong.conganhungyen.com/",
//           "http://localhost:4000/"
//         ],
//       },
//     },
//   })
// );

app.set('trust proxy', 1); // Số 1 nếu chỉ qua 1 lớp proxy (như Nginx)


// Vô hiệu hóa tiêu đề X-Powered-By
app.disable('x-powered-by');

app.use((req, res, next) => {
  try {
    decodeURIComponent(req.path);
    next();
  } catch (e) {
    // Nếu có lỗi giải mã, trả về lỗi 400 luôn thay vì in ra đống lỗi dài ngoằng
    res.status(400).send('Bad Request: Invalid URI');
  }
});

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://tuyentruyenphapluatpc08hungyen.com",
    "https://antoangiaothong.conganhungyen.com",
  ],
  credentials: true,
}));
// app.use(express.json());

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));
// Data sanitization against XSS (Đặt sau express.json)
app.use(xss());

const authRoute = require('./routes/auth');
const monthiRoute = require('./routes/monthi');
const donviRoute = require('./routes/donvi');
const commonRoute = require('./routes/common');
const cauhoiRoute = require('./routes/cauhoi');
const videoRoute = require('./routes/video');
const learningRoute = require('./routes/learning');

app.use('/c08/public', commonRoute);
app.use('/c08/learning', learningRoute);
app.use('/c08/video', videoRoute);
app.use('/c08/auth', authRoute);
app.use('/c08/mon-thi', monthiRoute);
app.use('/c08/cau-hoi', cauhoiRoute);
app.use('/c08', donviRoute);
const path = require("path");
const generateCertificate = require('./certicate.js');
const middlewareController = require('./middlewares/verifyToken.js');
const checkRole = require('./middlewares/checkRole.js');

const decryptPii = (encryptedText) => {
  if (!encryptedText || !String(encryptedText).includes(':')) return encryptedText || '';
  const textParts = String(encryptedText).split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedData = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', process.env.SECRET_KEY, iv);
  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

const basePath = '';

app.use(
  '/public',
  (req, res, next) => {
    // Cho phép các trang web origin khác (frontend) tải tài nguyên static này
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(__dirname, 'public'))
);

// app.get('/test', async (req, res)  => {
//   let items = await Cauhois.find();
//   for(let item of items){
//     if(item?.image && item?.image !== ""){{
//       console.log(item.image)
//       let index = item?.image.lastIndexOf("/");
//       console.log(index)
//       if(index !== -1){
//         item.image = item.image.slice( index+ 1);
//       }
//       // console.log(item.image)
//       await item.save()
//     }}
//   }
// })

const openai = new OpenAI({ apiKey: process.env.API_GPT_4 });

// System prompt cố định (theo yêu cầu của bạn)
// Bạn là Trợ lý ảo của Cảnh sát giao thông Công an tỉnh Hưng Yên.
// Nếu như câu hỏi về địa chỉ của Phòng cảnh sát giao thông Hưng Yên, thì bạn trả lời rằng: số xx Hải thượng lãn ông, phường Phố Hiến, tỉnh Hưng Yên".
// Số điện thoại đường dây nóng của cảnh sát giao thông Hưng yên là : 0794898989.
// Phó giám đốc - Đại tá Nguyễn Trung Thành đang phụ trách phòng giao thông.
// Để phản ánh thông tin về tình hình trật tự giao thông thì có thể phản ánh, liên hệ trực tiếp với đồng chí Vũ Trung Thành - PGĐ Công an tỉnh.
const systemInstruction = {
  role: 'system',
  content: `
QUY TẮC BẮT BUỘC:
1. Phải tuân thủ nguyên tắc trả lời các kết quả, thông tin mới nhất, cập nhật theo thời gian gần đây nhất ví dụ như mức phạt, trừ điểm giấy phép lái xe... thì phải theo ghị định 168/2024/NĐ-CP ngày 26/12/2024 của Chính phủ Việt Nam
2. Phạm vi trả lời: Chỉ trả lời các vấn đề liên quan đến lĩnh vực giao thông; nội dung của Nghị định 168/2024/NĐ-CP ngày 26/12/2024 của Chính phủ, Luật Đường bộ và các quy định an toàn giao thông tại Việt Nam.
3. Định dạng: Tuyệt đối KHÔNG sử dụng các ký tự định dạng Markdown như dấu sao đôi (**), dấu thăng (#) hay danh sách phức tầm. Trả lời bằng văn bản thuần (plain text), ngắn gọn, dễ đọc.
4. Thái độ: Lịch sự, chuyên nghiệp, trả lời ngắn gọn, đúng trọng tâm.`
};


app.post(
  "/c08/certificate",
  async (req, res) => {
   try {
      const { mabaithi, secretKey } = req.body || {};
      if (!mabaithi || !secretKey) {
        return res.status(400).json({
          success: false,
          message: "Thiếu mabaithi hoặc secretKey",
        });
      }

      const item = await LichsuThis.findById(mabaithi).populate("id_cuocthi");
      if (!item) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy bài thi",
        });
      }

      if (String(item.secretKey) !== String(secretKey)) {
        return res.status(403).json({
          success: false,
          message: "Phiên bài thi không hợp lệ",
        });
      }

      if (!item.thoigiannopbai || item.thoigiannopbai === 0) {
        return res.status(400).json({
          success: false,
          message: "Chỉ tạo chứng nhận sau khi đã nộp bài",
        });
      }

      const name = decryptPii(item.thongtinthisinh?.name);
      const tencuocthi = item.id_cuocthi?.tencuocthi || "";
      const timeTest =
        Number(item.thoigiannopbai) - Number(item.thoigianbatdau);

      const buffer = await generateCertificate({
        name,
        tencuocthi,
        mabaithi: String(item._id),
        socaudung: item.socaudung || 0,
        socauhoi: item.soluongcauhoi || item.questions?.length || 0,
        time: timeTest,
        thoigianbatdau: item.thoigianbatdau,
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=certificate.pdf"
      );
      res.send(buffer);

    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: "Không tạo được chứng nhận",
      });
    }
  }
);

// app.post('/c08/chat-gpt', async (req, res) => {
//   try {
//     const { history = [] } = req.body;
//     // Đảm bảo lịch sử là mảng và có thể ghép với hệ thống prompt
//     const messages = [systemInstruction, ...history];

//     const callModel = async (modelName) => {
//       const response = await openai.chat.completions.create({
//         model: modelName,
//         messages: messages,
//         // max_tokens: 500,
//         // temperature: 0.2,
//       });
//       // console.log('OpenAI response:', JSON.stringify(response, null, 2));
//       return response?.choices?.[0]?.message?.content ?? response?.choices?.[0]?.text ?? '';
//     };

//     let reply = await callModel('gpt-5.4-mini-2026-03-17');
//     // let reply = await callModel('gpt-5.4-2026-03-05');

//     if (!reply) {
//       return res.status(500).json({ error: 'Lỗi trả lời từ AI' });
//     }

//     res.json({ reply });

//   } catch (error) {
//     console.log(error.message)
//     // Xử lý lỗi, thử fallback nếu là lỗi liên quan đến mô hình
//     return res.status(500).json({ error: 'Lỗi máy chủ AI' });
//   }
// });


app.get("/c08/uploads/:filename", (req, res) => {
  const { sendSafeFile } = require("./utils/safePath");
  return sendSafeFile(res, path.join(__dirname, "upload"), req.params.filename);
});
app.get("/c08/public/:filename", (req, res) => {
  const { sendSafeFile } = require("./utils/safePath");
  return sendSafeFile(res, path.join(__dirname, "public"), req.params.filename);
});


const c08controller = require("../backend/c08/c08.js")
const commoncontroller = require("../backend/controllers/common.js")
app.get('/public/sumary/toan-quoc',  commoncontroller.publicThongke)
// chuc nang rieng cua c08
app.get('/c08/dia-phuong/list', middlewareController.verifyToken, checkRole('xem cuộc thi'), c08controller.getDiaphuongs);
app.post('/c08/dia-phuong', middlewareController.verifyToken, checkRole('xem cuộc thi'), c08controller.addDiaphuong);
app.put('/c08/dia-phuong/:id', middlewareController.verifyToken, checkRole('xem cuộc thi'), c08controller.updatedDiaphuong);
app.delete('/c08/dia-phuong/:id', middlewareController.verifyToken, checkRole('xem cuộc thi'), c08controller.deleteDiaphuong);

app.get('/c08/toan-quoc', middlewareController.verifyToken, checkRole('xem cuộc thi'), c08controller.sumaryKetquas)

const PORT = process.env.PORT || 4000;
connectDB();

app.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng: ${PORT}`);
});

