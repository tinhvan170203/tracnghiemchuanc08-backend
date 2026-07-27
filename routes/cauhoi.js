const express = require('express');

const router = express.Router();
const path = require('path')
const multer = require('multer')

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, path.join(__dirname,`../upload`))
    },
    filename: function(req, file, cb) {
        const originalName = file.originalname; // tên file gốc
        const encodedName = Buffer.from(originalName, 'latin1').toString('utf8'); // mã hóa tên file
        file.originalname = encodedName;
        // cb(null, encodedName); // dùng tên file đã mã hóa
        cb(null, + (new Date()) +  '_'  + encodedName)
    }
});

const upload = multer({
    storage: storage,
});


const cauhoi = require('../controllers/cauhoi');
const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');


router.get('/fetch/:id', middlewareController.verifyToken, checkRole('xem câu hỏi'), cauhoi.getCauhois)

router.post('/add',  middlewareController.verifyToken,checkRole('thêm câu hỏi'), upload.single('file'), cauhoi.addCauhoi)
router.delete('/delete/:id',middlewareController.verifyToken,checkRole('xóa câu hỏi'),  cauhoi.deleteCauhoi)
router.put('/edit/:id',middlewareController.verifyToken,checkRole('sửa câu hỏi'), upload.single('file'), cauhoi.updatedCauhoi)

module.exports = router