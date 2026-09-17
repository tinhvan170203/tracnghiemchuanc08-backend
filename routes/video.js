const express = require('express');
const router = express.Router();

const video = require('../controllers/video');
const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');
const { videoUpload, handleMulterError } = require('../utils/upload');

const uploadVideo = (req, res, next) => {
  videoUpload.single('file')(req, res, (err) => handleMulterError(err, req, res, next));
};

router.get('/fetch', middlewareController.verifyTokenOptional, video.getVideos)
router.get('/tang-view',  video.incView)
router.post('/add', middlewareController.verifyToken, checkRole('thêm video tuyên truyền'), uploadVideo,  video.addVideo)
router.put('/edit/:id', middlewareController.verifyToken, checkRole('sửa video tuyên truyền'), video.updatedVideo)
router.put('/:id/active', middlewareController.verifyToken, checkRole('sửa video tuyên truyền'), video.toggleActive)
router.delete('/delete/:id', middlewareController.verifyToken, checkRole('xóa video tuyên truyền'), video.deleteVideo)

module.exports = router
