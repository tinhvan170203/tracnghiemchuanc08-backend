const express = require('express');

const router = express.Router();

const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');
const Monthis = require('../models/Monthi');
const Chuyendes = require('../models/Chuyende');
const { default: mongoose } = require('mongoose');
const Cauhois = require('../models/CauHoi');
const { getAppSettings } = require('../utils/appSettings');

const MSG_HOC_DONG = 'Tính năng học câu hỏi đang tạm đóng';

router.get('/settings', async (req, res) => {
  try {
    const settings = await getAppSettings();
    res.json({ cho_phep_hoc_cauhoi: !!settings.cho_phep_hoc_cauhoi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi đọc cài đặt' });
  }
});

router.put('/settings', middlewareController.verifyToken, checkRole('sửa môn thi'), async (req, res) => {
  try {
    const settings = await getAppSettings();
    settings.cho_phep_hoc_cauhoi = !!req.body.cho_phep_hoc_cauhoi;
    await settings.save();
    res.json({
      cho_phep_hoc_cauhoi: settings.cho_phep_hoc_cauhoi,
      message: 'Cập nhật thành công',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi cập nhật cài đặt' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const result = await Monthis.aggregate([
      { $match: { hien_thi_hoctap: true } },
      { $sort: { thutu: 1 } },
      {
        $lookup: {
          from: 'chuyendes',
          let: { monthiId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$monthi', '$$monthiId'] },
                    { $eq: ['$hien_thi_hoctap', true] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'cauhois',
                let: { cdId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ['$chuyende', '$$cdId'] },
                      active: { $ne: false },
                    },
                  },
                ],
                as: 'cauhois',
              },
            },
            {
              $project: {
                title: 1,
                soCauHoi: { $size: '$cauhois' },
              },
            },
          ],
          as: 'chuyendes',
        },
      },
      {
        $project: {
          tenmonthi: 1,
          mota: 1,
          thutu: 1,
          link_test: 1,
          soChuyenDe: { $size: '$chuyendes' },
          soCauHoi: { $sum: '$chuyendes.soCauHoi' },
          chuyendes: 1,
        },
      },
    ]);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi truy vấn thống kê' });
  }
});

router.get('/:monthiId/chuyendes', async (req, res) => {
  try {
    // Không khóa theo cho_phep_hoc — dùng chung cho hub kiểm tra
    const { monthiId } = req.params;
    const monthi = await Monthis.findById(monthiId).select('tenmonthi mota thutu hien_thi_hoctap');
    if (!monthi || monthi.hien_thi_hoctap !== true) {
      return res.status(404).json({ error: 'Không tìm thấy môn thi' });
    }

    const chuyendes = await Chuyendes.aggregate([
      {
        $match: {
          monthi: new mongoose.Types.ObjectId(monthiId),
          hien_thi_hoctap: true,
        },
      },
      { $sort: { createdAt: 1 } },
      {
        $lookup: {
          from: Cauhois.collection.name,
          let: { cdId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$chuyende', '$$cdId'] },
                active: { $ne: false },
              },
            },
          ],
          as: 'cauhois',
        },
      },
      {
        $project: {
          title: 1,
          link_test: 1,
          createdAt: 1,
          soCauHoi: { $size: '$cauhois' },
        },
      },
    ]);

    res.json({
      monthi,
      chuyendes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi truy vấn danh sách chuyên đề' });
  }
});

router.get('/chuyendes/:chuyendeId/cauhois', async (req, res) => {
  try {
    const settings = await getAppSettings();
    if (!settings.cho_phep_hoc_cauhoi) {
      return res.status(423).json({ message: MSG_HOC_DONG, code: 'HOC_CLOSED' });
    }

    const { chuyendeId } = req.params;
    const chuyende = await Chuyendes.findById(chuyendeId);
    if (!chuyende || chuyende.hien_thi_hoctap !== true) {
      return res.status(404).json({ error: 'Không tìm thấy chuyên đề' });
    }

    const monthi = await Monthis.findById(chuyende.monthi).select('hien_thi_hoctap');
    if (!monthi || monthi.hien_thi_hoctap !== true) {
      return res.status(404).json({ error: 'Không tìm thấy môn thi' });
    }

    const cauhois = await Cauhois.find({ chuyende: chuyendeId, active: { $ne: false } })
      .sort({ createdAt: 1 })
      .select('question option_a option_b option_c option_d option_e answer image createdAt')
      .lean();

    const result = cauhois.map((c) => ({
      _id: c._id,
      question: c.question,
      image: c.image,
      answerText: c[c.answer] || null,
    }));

    res.json({ total: result.length, cauhois: result, chuyende, monthiId: chuyende.monthi });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi lấy danh sách câu hỏi' });
  }
});

module.exports = router;
