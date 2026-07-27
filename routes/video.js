const express = require('express');
const path = require('path')
const multer = require('multer')
const router = express.Router();
// Hàm bổ trợ: Chuyển tiếng Việt có dấu & xóa ký tự đặc biệt
function slugifyFileName(str) {
    return str
        .normalize('NFD')                   // Tách các dấu câu ra khỏi chữ cái
        .replace(/[\u0300-\u036f]/g, '')     // Xóa các dấu câu tiếng Việt
        .replace(/đ/g, 'd').replace(/Đ/g, 'D') // Chuyển đ/Đ -> d/D
        .toLowerCase()                       // Chuyển thành chữ thường
        .trim()
        .replace(/[^a-z0-9 -]/g, '')        // Xóa tất cả ký tự không phải chữ, số, khoảng trắng, dấu '-'
        .replace(/\s+/g, '-')                // Thay khoảng trắng thành dấu '-'
        .replace(/-+/g, '-');                // Loại bỏ các dấu '-' dư thừa
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public'));
    },

    filename: function (req, file, cb) {
        // 1. Tách tên file và đuôi file (extension)
        const ext = path.extname(file.originalname); // Ví dụ: ".mp4"
        const nameWithoutExt = path.basename(file.originalname, ext); // Ví dụ: "Bài Giảng Tiếng Việt #1"

        // 2. Chuẩn hóa tên file
        const cleanName = slugifyFileName(nameWithoutExt);

        // 3. Ghép: timestamp + tên sạch + đuôi file
        // Kết quả ví dụ: 17182938102-bai-giang-tieng-viet-1.mp4
        const finalFileName = `${Date.now()}-${cleanName}${ext}`;

        cb(null, finalFileName);
    }
});

const upload = multer({
    storage: storage,
});


const video = require('../controllers/video');
const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');

router.get('/fetch',  video.getVideos)
router.get('/tang-view',  video.incView)
router.post('/add', middlewareController.verifyToken,upload.single('file'),  video.addVideo)
router.put('/edit/:id', middlewareController.verifyToken, video.updatedVideo)
router.delete('/delete/:id', middlewareController.verifyToken, video.deleteVideo)

module.exports = router