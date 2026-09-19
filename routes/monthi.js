const express = require('express');

const router = express.Router();

const monthi = require('../controllers/monthi');
const thisinh = require('../controllers/thisinh');
const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');
const chuyende = require('../controllers/chuyende');
const common = require('../controllers/common');


router.get('/fetch', middlewareController.verifyToken, checkRole('xem môn thi'), monthi.getMonthiList)
router.get('/fetch-monthiOfUser', middlewareController.verifyToken, checkRole(['xem môn thi', 'xem cuộc thi', 'xem chuyên đề']), monthi.getMonthiOfUser)
router.get('/contest-scope-options', middlewareController.verifyToken, checkRole('xem cuộc thi'), monthi.contestScopeOptions)

const fanpage = require('../controllers/fanpage');
router.get('/fanpage-clicks/export-excel', middlewareController.verifyToken, checkRole('xem lượt theo dõi fanpage'), fanpage.exportExcel);
router.get('/fanpage-clicks/cuocthi-options', middlewareController.verifyToken, checkRole('xem lượt theo dõi fanpage'), fanpage.listCuocthiOptions);
router.get('/fanpage-clicks', middlewareController.verifyToken, checkRole('xem lượt theo dõi fanpage'), fanpage.listClicks);

const aichat = require('../controllers/aichat');
router.get('/ai-chat-logs/export-excel', middlewareController.verifyToken, checkRole('xem hỏi đáp AI'), aichat.exportExcel);
router.get('/ai-chat-logs', middlewareController.verifyToken, checkRole('xem hỏi đáp AI'), aichat.listLogs);

router.get('/detail/fetch/:id', middlewareController.verifyToken, checkRole('xem môn thi'), monthi.getMonthiDetail)
router.post('/add', middlewareController.verifyToken,checkRole('thêm môn thi'), monthi.addMonthi)
router.delete('/delete/:id',middlewareController.verifyToken,checkRole('xóa môn thi'),  monthi.deleteMonthi)
router.put('/edit/:id',middlewareController.verifyToken,checkRole('sửa môn thi'),  monthi.editMonthi)


router.get('/:id/cuoc-thi-list/fetch', middlewareController.verifyToken, checkRole('xem cuộc thi'), monthi.getCuocthis)
router.post('/:id/cuoc-thi/add', middlewareController.verifyToken,checkRole('thêm cuộc thi'), monthi.addCuocthi)
router.put('/:id/cuoc-thi/:id1/edit-status', middlewareController.verifyToken, checkRole(['sửa trạng thái cuộc thi', 'sửa cuộc thi']), monthi.updateStatusCuocthi)
router.put('/:id/cuoc-thi/:id1/update-option', middlewareController.verifyToken,checkRole('sửa cuộc thi'), monthi.updateOptionCuocthi)
router.put('/:id/cuoc-thi/:id1/assign-owner', middlewareController.verifyToken, checkRole('quản trị tất cả cuộc đánh giá'), monthi.assignCuocthiOwner)
router.delete('/:id/cuoc-thi/:id1/delete',middlewareController.verifyToken,checkRole('xóa cuộc thi'),  monthi.deleteCuocthi)

const exportJob = require('../controllers/exportJob');
router.post('/ket-qua/export-jobs', middlewareController.verifyToken, checkRole('xem cuộc thi'), exportJob.createJob)
router.get('/ket-qua/export-jobs/:id', middlewareController.verifyToken, checkRole('xem cuộc thi'), exportJob.getJob)
router.get('/ket-qua/export-jobs/:id/download', middlewareController.verifyToken, checkRole('xem cuộc thi'), exportJob.downloadJob)

router.get('/ket-qua/export-excel', middlewareController.verifyToken, checkRole('xem cuộc thi'), monthi.exportKetquaExcelNhieu)
router.get('/ket-qua/cuoc-thi/:id/export-excel', middlewareController.verifyToken, checkRole('xem cuộc thi'), monthi.exportKetquaExcel)
router.get('/ket-qua/cuoc-thi/:id', middlewareController.verifyToken, checkRole('xem cuộc thi'), monthi.getKetquathi)

// thí sinh dự thi 
router.get('/bai-thi/:id/preview', middlewareController.verifyToken, checkRole('xem cuộc thi'), common.previewTestAdmin)
router.get('/:id/chuyen-de/fetch', middlewareController.verifyToken, checkRole(['xem chuyên đề', 'xem cuộc thi', 'xem môn thi']), chuyende.getChuyendes)
router.post('/:id/chuyen-de/add', middlewareController.verifyToken, checkRole('thêm chuyên đề'), chuyende.addChuyende)
router.put('/:id/chuyen-de/:id1/edit', middlewareController.verifyToken, checkRole('sửa chuyên đề'), chuyende.updatedChuyende)
router.delete('/:id/chuyen-de/:id1/delete', middlewareController.verifyToken, checkRole('xóa chuyên đề'), chuyende.deleteChuyende)

router.get('/thongke', middlewareController.verifyToken, checkRole('xem thống kê hệ thống'), monthi.thongke);
router.get('/top-cau-hoi-sai', middlewareController.verifyToken, checkRole('xem câu hỏi hay sai'), monthi.thongKeCauHoiSai);
router.get('/thongke-cau-hoi-sai', middlewareController.verifyToken, checkRole('xem câu hỏi hay sai'), monthi.thongKeCauHoiSaiTongHop);
router.get('/ok', monthi.updateAnswers)
module.exports = router