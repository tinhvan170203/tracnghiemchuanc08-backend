const express = require('express');

const router = express.Router();

const cauhoi = require('../controllers/cauhoi');
const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');
const { imageUpload, handleMulterError } = require('../utils/upload');

const uploadImage = (req, res, next) => {
  imageUpload.single('file')(req, res, (err) => handleMulterError(err, req, res, next));
};

router.get('/fetch/:id', middlewareController.verifyToken, checkRole('xem câu hỏi'), cauhoi.getCauhois)

router.post('/add',  middlewareController.verifyToken,checkRole('thêm câu hỏi'), uploadImage, cauhoi.addCauhoi)
router.delete('/delete/:id',middlewareController.verifyToken,checkRole('xóa câu hỏi'),  cauhoi.deleteCauhoi)
router.put('/edit/:id',middlewareController.verifyToken,checkRole('sửa câu hỏi'), uploadImage, cauhoi.updatedCauhoi)
router.put('/:id/active', middlewareController.verifyToken, checkRole('sửa câu hỏi'), cauhoi.toggleActive)

module.exports = router
