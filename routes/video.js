const express = require('express');
const router = express.Router();

const video = require('../controllers/video');
const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');
const { videoUpload, handleMulterError } = require('../utils/upload');

const uploadVideo = (req, res, next) => {
  videoUpload.single('file')(req, res, (err) => handleMulterError(err, req, res, next));
};

router.get('/fetch',  video.getVideos)
router.get('/tang-view',  video.incView)
router.post('/add', middlewareController.verifyToken, checkRole('xem cuộc thi'), uploadVideo,  video.addVideo)
router.put('/edit/:id', middlewareController.verifyToken, checkRole('xem cuộc thi'), video.updatedVideo)
router.delete('/delete/:id', middlewareController.verifyToken, checkRole('xem cuộc thi'), video.deleteVideo)

module.exports = router
