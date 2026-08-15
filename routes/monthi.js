const express = require('express');

const router = express.Router();

const monthi = require('../controllers/monthi');
const thisinh = require('../controllers/thisinh');
const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');
const chuyende = require('../controllers/chuyende');
const common = require('../controllers/common');


router.get('/fetch', middlewareController.verifyToken, checkRole('xem môn thi'), monthi.getMonthiList)
router.get('/fetch-monthiOfUser', middlewareController.verifyToken, checkRole('xem môn thi'), monthi.getMonthiOfUser)

router.get('/detail/fetch/:id', middlewareController.verifyToken, checkRole('xem môn thi'), monthi.getMonthiDetail)
router.post('/add', middlewareController.verifyToken,checkRole('thêm môn thi'), monthi.addMonthi)
router.delete('/delete/:id',middlewareController.verifyToken,checkRole('xóa môn thi'),  monthi.deleteMonthi)
router.put('/edit/:id',middlewareController.verifyToken,checkRole('sửa môn thi'),  monthi.editMonthi)


router.get('/:id/cuoc-thi-list/fetch', middlewareController.verifyToken, checkRole('xem cuộc thi'), monthi.getCuocthis)
router.post('/:id/cuoc-thi/add', middlewareController.verifyToken,checkRole('thêm cuộc thi'), monthi.addCuocthi)
router.put('/:id/cuoc-thi/:id1/edit-status', middlewareController.verifyToken,checkRole('sửa trạng thái cuộc thi'), monthi.updateStatusCuocthi)
router.put('/:id/cuoc-thi/:id1/update-option', middlewareController.verifyToken,checkRole('sửa cuộc thi'), monthi.updateOptionCuocthi)
router.delete('/:id/cuoc-thi/:id1/delete',middlewareController.verifyToken,checkRole('xóa cuộc thi'),  monthi.deleteCuocthi)

router.get('/ket-qua/cuoc-thi/:id', middlewareController.verifyToken, checkRole('xem cuộc thi'), monthi.getKetquathi)
router.get('/ket-qua/cuoc-thi/:id/export-excel', middlewareController.verifyToken, checkRole('xem cuộc thi'), monthi.exportKetquaExcel)

// thí sinh dự thi 
router.get('/bai-thi/:id/preview', middlewareController.verifyToken, checkRole('xem cuộc thi'), common.previewTestAdmin)
router.get('/:id/chuyen-de/fetch', middlewareController.verifyToken, checkRole('xem môn thi'), chuyende.getChuyendes)
router.post('/:id/chuyen-de/add', middlewareController.verifyToken, checkRole('thêm môn thi'), chuyende.addChuyende)
router.put('/:id/chuyen-de/:id1/edit', middlewareController.verifyToken, checkRole('sửa môn thi'), chuyende.updatedChuyende)
router.delete('/:id/chuyen-de/:id1/delete', middlewareController.verifyToken, checkRole('xóa môn thi'), chuyende.deleteChuyende)

router.get('/thongke', middlewareController.verifyToken, checkRole('xem cuộc thi'), monthi.thongke);
router.get('/top-cau-hoi-sai', middlewareController.verifyToken, checkRole('xem cuộc thi'), monthi.thongKeCauHoiSai);
router.get('/ok', monthi.updateAnswers)
module.exports = router