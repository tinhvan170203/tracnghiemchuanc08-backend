const express = require('express');

const router = express.Router();

const donvi = require('../controllers/donvi');
const checkRole = require('../middlewares/checkRole');
const middlewareController = require('../middlewares/verifyToken');
const Monthis = require('../models/Monthi');
const Chuyendes = require('../models/Chuyende');
const { default: mongoose } = require('mongoose');
const Cauhois = require('../models/CauHoi');

// hàm lấy ra môn thi, chuyên đề và số lượng câu hỏi của môn thi
router.get('/dashboard', async (req, res) => {
  try {
    const result = await Monthis.aggregate([
      { $sort: { thutu: 1 } },
      {
        $lookup: {
          from: 'chuyendes', // tên collection thực tế trong Mongo, kiểm tra lại nếu khác
          let: { monthiId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$monthi', '$$monthiId'] } } },
            {
              $lookup: {
                from: 'cauhois',
                localField: '_id',
                foreignField: 'chuyende',
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
          chuyendes: 1, // giữ lại nếu muốn hiển thị chi tiết từng chuyên đề + số câu hỏi
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
    const { monthiId } = req.params;

    const [monthi, chuyendes] = await Promise.all([
      Monthis.findById(monthiId).select('tenmonthi mota thutu'),
      Chuyendes.aggregate([
        { $match: { monthi: new mongoose.Types.ObjectId(monthiId) } },
        { $sort: { createdAt: 1 } },
        {
          $lookup: {
            from: Cauhois.collection.name,
            localField: '_id',
            foreignField: 'chuyende',
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
      ]),
    ]);

    if (!monthi) {
      return res.status(404).json({ error: 'Không tìm thấy môn thi' });
    }

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
    const { chuyendeId } = req.params;

      const [chuyende, cauhois] = await Promise.all([
      Chuyendes.findById(chuyendeId),
      Cauhois.find({ chuyende: chuyendeId })
      .sort({ createdAt: 1 }) // thứ tự cố định — bắt buộc để khớp với index lưu trong localStorage
      .select('question option_a option_b option_c option_d option_e answer image createdAt')
      .lean()
      ]);

    const result = cauhois.map(c => ({
      _id: c._id,
      question: c.question,
      image: c.image,
      answerText: c[c.answer] || null, // c.answer = "option_b" -> lấy c["option_b"]
    }));

    res.json({ total: result.length, cauhois: result, chuyende, monthiId: chuyende.monthi});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi lấy danh sách câu hỏi' });
  }
});
module.exports = router