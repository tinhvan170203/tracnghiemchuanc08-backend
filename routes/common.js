const express = require('express');

const router = express.Router();
const RedisStore = require('rate-limit-redis').default;
const { createClient } = require('redis');
const common = require('../controllers/common');
const path = require('path')
const multer = require('multer')
const middlewareController = require('../middlewares/verifyToken');
const rateLimit = require('express-rate-limit');
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, path.join(__dirname,`../upload`))
    },
    filename: function(req, file, cb) {
        const originalName = file.originalname; // tên file gốc
        const encodedName = Buffer.from(originalName, 'latin1').toString('utf8'); // mã hóa tên file
        // cb(null, encodedName); // dùng tên file đã mã hóa
        cb(null, + new Date() + '_' + encodedName)
    }
});

const upload = multer({
    storage: storage,
});

// 1. Tạo và kết nối Redis Client
const redisClient = createClient({
    url: 'redis://127.0.0.1:6379'
});

redisClient.connect()
    .then(() => console.log('✅ Redis connected'))
    .catch(err => console.error('❌ Redis Connection Error', err));

// 2. Định nghĩa loginLimiter
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    handler: (req, res) => {
        res.status(429).json({
            message: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 1 phút.",
        });
    },
});

router.get('/fetch/danhsachdonvi', common.getDonviList)

//thitracnghiem
router.get('/fetch/danhsachmonthi', common.getAllMonthi)
router.get('/info/cuoc-thi/:id', common.getInfoCuocthi)
router.get('/checkedCuocthi', common.checkActiveTest)
router.post('/loginTest', common.loginTest)
// router.post('/loginTest',loginLimiter, common.loginTest)
router.get('/checkedTest/:id', common.checkedTest) // id laf lich sử thi hay bài thi
router.get('/preview/:id', common.previewTest) // id laf lich sử thi hay bài thi
router.post('/:id/submitTest', common.submitTest)


router.post('/save-file', middlewareController.verifyToken, upload.single('file'), common.saveFile);
router.get('/auth/tai-lieu/fetch', middlewareController.verifyToken, common.fetchFile)
router.get('/tai-lieu/fetch', common.fetchFile)
router.delete('/tai-lieu/delete',middlewareController.verifyToken,  common.deleteFile)
module.exports = router