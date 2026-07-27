const express = require('express');

const router = express.Router();

const donvi = require('../controllers/donvi');
const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');


router.get('/donvi/fetch', middlewareController.verifyToken, checkRole('xem đơn vị'), donvi.getDonviList)
router.get('/donviquanly/fetch', middlewareController.verifyToken, checkRole('xem đội'), donvi.getDonviQuantri)

router.post('/donvi/add', middlewareController.verifyToken,checkRole('thêm đơn vị'), donvi.addDonvi)
router.delete('/donvi/delete/:id',middlewareController.verifyToken,checkRole('xóa đơn vị'),  donvi.deleteDonvi)
router.put('/donvi/edit/:id',middlewareController.verifyToken,checkRole('sửa đơn vị'),  donvi.editDonvi)


router.get('/doi/fetch', middlewareController.verifyToken, checkRole('xem đội'), donvi.getDoiList)
router.post('/doi/add', middlewareController.verifyToken,checkRole('thêm đội'), donvi.addDoi)
router.delete('/doi/delete/:id',middlewareController.verifyToken,checkRole('xóa đội'),  donvi.deleteDoi)
router.put('/doi/edit/:id',middlewareController.verifyToken,checkRole('sửa đội'),  donvi.editDoi)
module.exports = router