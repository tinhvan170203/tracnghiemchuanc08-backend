const mongoose = require("mongoose");
const Cauhois = require("../models/CauHoi");
const LichsuThis = require("../models/LichsuThi");
const Chuyendes = require("../models/Chuyende");

function isMonthiAllowed(user, monthiId) {
  if (!monthiId) return false;
  const idStr = String(monthiId);
  return (user?.quantrinhomdonvi || [])
    .map((item) => item && (item._id || item))
    .filter(Boolean)
    .some((id) => String(id) === idStr);
}

module.exports = {
  getCauhois: async (req, res) => {
    let { question, chuyende } = req.query;
    let id = req.params.id; // id môn thi
    // console.log(id)
    try {
      let chuyendeList = await Chuyendes.find({ monthi: id });
      let chuyendeList_id = chuyendeList.map(i => i._id.toString());

      let items = await Cauhois.find({
        question: { $regex: question, $options: "i" },
        chuyendeString: { $regex: chuyende, $options: "i" },
        chuyende: { $in: chuyendeList_id }
        // monthi: id
      }).sort({ createdAt: -1 }).populate('chuyende')

      res.status(200).json(items)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(401)
        .json({
          status: "failed",
          message: "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
        });
    }
  },

  addCauhoi: async (req, res) => {

    let {
      question,
      option_a,
      option_b,
      option_c,
      option_d,
      option_e,
      image,
      answer,
      chuyende, monthi, active
    } = req.body;
    let questionParam = JSON.parse(req.body.queryParams).question;
    let chuyendeParam = JSON.parse(req.body.queryParams).chuyende;

    let file = null;
    if (req.file) {
      file = {
        link: req.file.filename,
        name: req.file.originalname
      };
    };

    try {
      let newItem = new Cauhois({
        question,
        option_a,
        option_b,
        option_c,
        option_d,
        option_e,
        image: file ? file.link : "",
        answer,
        chuyende,
        chuyendeString: chuyende,
        active: active !== 'false' && active !== false
      });

      await newItem.save();

      let chuyendeList = await Chuyendes.find({ monthi });
      let chuyendeList_id = chuyendeList.map(i => i._id.toString());
      let items = await Cauhois.find({
        question: { $regex: questionParam, $options: "i" },
        chuyendeString: { $regex: chuyendeParam, $options: "i" },
        chuyende: { $in: chuyendeList_id }
      }).sort({ createdAt: -1 }).populate('chuyende')

      res.status(200).json({
        status: "success",
        message: "Thêm mới thành công",
        items
      });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message: "Có lỗi xảy ra khi thêm mới",
      });
    }
  },

  updatedCauhoi: async (req, res) => {
    let id = req.params.id;


    let {
      question,
      option_a,
      option_b,
      option_c,
      option_d,
      option_e,
      image,
      answer,
      chuyende, monthi, active
    } = req.body;
    let questionParam = JSON.parse(req.body.queryParams).question;
    let chuyendeParam = JSON.parse(req.body.queryParams).chuyende;

    let file = null;
    if (req.file) {
      file = {
        link: req.file.filename,
        name: req.file.originalname
      };
    };
    try {
      let dataUpdate = {
        question,
        option_a,
        option_b,
        option_c,
        option_d,
        option_e,
        answer,
        chuyende,
        chuyendeString: chuyende,
        active: active !== 'false' && active !== false
      };

      if (req.file) {
        dataUpdate = {...dataUpdate, image : file.link}
      };

      await Cauhois.findByIdAndUpdate(req.body.id_edit, dataUpdate);

      let chuyendeList = await Chuyendes.find({ monthi });
      let chuyendeList_id = chuyendeList.map(i => i._id.toString());
      let items = await Cauhois.find({
        question: { $regex: questionParam, $options: "i" },
        chuyendeString: { $regex: chuyendeParam, $options: "i" },
        chuyende: { $in: chuyendeList_id }
      }).sort({ createdAt: -1 }).populate('chuyende');

      res.status(200).json({ message: "update thành công", items });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message:
          "Có lỗi xảy ra khi điều chỉnh. Vui lòng liên hệ quản trị hệ thống.",
      });
    }
  },
  toggleActive: async (req, res) => {
    let id = req.params.id;
    let { active, monthi, question, chuyende } = req.body;
    try {
      await Cauhois.findByIdAndUpdate(id, {
        active: active !== 'false' && active !== false
      });

      let questionParam = question || '';
      let chuyendeParam = chuyende || '';
      if (req.body.queryParams) {
        const qp = typeof req.body.queryParams === 'string'
          ? JSON.parse(req.body.queryParams)
          : req.body.queryParams;
        questionParam = qp.question || '';
        chuyendeParam = qp.chuyende || '';
      }

      let chuyendeList = await Chuyendes.find({ monthi });
      let chuyendeList_id = chuyendeList.map(i => i._id.toString());
      let items = await Cauhois.find({
        question: { $regex: questionParam, $options: "i" },
        chuyendeString: { $regex: chuyendeParam, $options: "i" },
        chuyende: { $in: chuyendeList_id }
      }).sort({ createdAt: -1 }).populate('chuyende');

      res.status(200).json({ message: "Cập nhật trạng thái thành công", items });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message: "Có lỗi xảy ra khi điều chỉnh trạng thái câu hỏi.",
      });
    }
  },
  deleteCauhoi: async (req, res) => {
    const id = req.params.id;
    const {
      question = "",
      chuyende = "",
      monthi,
    } = req.query;

    try {
      if (
        !mongoose.isValidObjectId(id) ||
        !mongoose.isValidObjectId(monthi)
      ) {
        return res.status(400).json({
          status: "failed",
          message: "Mã câu hỏi hoặc kiến thức đánh giá không hợp lệ",
        });
      }

      if (!isMonthiAllowed(req.user, monthi)) {
        return res.status(403).json({
          status: "failed",
          message: "Tài khoản không được phân quyền kiến thức đánh giá này",
        });
      }

      const target = await Cauhois.findById(id).select("_id chuyende").lean();
      if (!target) {
        return res.status(404).json({
          status: "failed",
          message: "Không tìm thấy câu hỏi cần xóa",
        });
      }

      const parent = await Chuyendes.exists({
        _id: target.chuyende,
        monthi,
      });
      if (!parent) {
        return res.status(404).json({
          status: "failed",
          message:
            "Câu hỏi không thuộc kiến thức đánh giá đã chọn",
        });
      }

      const hasExamUsage = await LichsuThis.exists({
        "questions.question": id,
      });
      if (hasExamUsage) {
        return res.status(409).json({
          status: "failed",
          code: "RESOURCE_IN_USE",
          message:
            "Không thể xóa câu hỏi vì đã có bài thi sử dụng câu hỏi này",
        });
      }

      await Cauhois.findByIdAndDelete(id);

      const chuyendeList = await Chuyendes.find({ monthi }).select("_id");
      const chuyendeList_id = chuyendeList.map((item) => item._id);
      const items = await Cauhois.find({
        question: { $regex: question, $options: "i" },
        chuyendeString: { $regex: chuyende, $options: "i" },
        chuyende: { $in: chuyendeList_id }
      }).sort({ createdAt: -1 }).populate("chuyende");
      res.status(200).json({
        status: "success",
        message: "Xóa thành công",
        items,
      });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(500).json({
        status: "failed",
        message: "Có lỗi xảy ra khi xóa câu hỏi",
      });
    }
  }
};
