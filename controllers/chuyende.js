const mongoose = require("mongoose");
const Cauhois = require("../models/CauHoi");
const Chuyendes = require("../models/Chuyende");
const Cuocthis = require("../models/Cuocthi");

function isMonthiAllowed(user, monthiId) {
  if (!monthiId) return false;
  const idStr = String(monthiId);
  return (user?.quantrinhomdonvi || [])
    .map((i) => (i && (i._id || i)))
    .filter(Boolean)
    .some((id) => String(id) === idStr);
}

module.exports = {
  getChuyendes: async (req, res) => {
    let id = req.params.id; // id môn thi
    try {
      if (!isMonthiAllowed(req.user, id)) {
        return res.status(403).json({
          status: "failed",
          message: "Tài khoản không được phân quyền kiến thức đánh giá này",
        });
      }
      let items = await Chuyendes.find({
        monthi: id,
      });
      res.status(200).json(items);
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message: "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
      });
    }
  },

  addChuyende: async (req, res) => {
    let id = req.params.id; //id môn thi
    let { title, link_test, hien_thi_hoctap } = req.body;
    try {
      if (!isMonthiAllowed(req.user, id)) {
        return res.status(403).json({
          status: "failed",
          message: "Tài khoản không được phân quyền kiến thức đánh giá này",
        });
      }
      let newItem = new Chuyendes({
        title,
        monthi: id,
        link_test,
        hien_thi_hoctap: !!hien_thi_hoctap,
      });
      await newItem.save();
      let items = await Chuyendes.find({
        monthi: id,
      });

      res.status(200).json({
        status: "success",
        message: "Thêm mới thành công",
        items,
      });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message: "Có lỗi xảy ra khi thêm mới",
      });
    }
  },
  updatedChuyende: async (req, res) => {
    let id = req.params.id; //id môn thi
    let id1 = req.params.id1; //id chuyên đề
    let { title, link_test, hien_thi_hoctap } = req.body;

    try {
      if (!isMonthiAllowed(req.user, id)) {
        return res.status(403).json({
          status: "failed",
          message: "Tài khoản không được phân quyền kiến thức đánh giá này",
        });
      }
      await Chuyendes.findByIdAndUpdate(id1, {
        title,
        link_test,
        hien_thi_hoctap: !!hien_thi_hoctap,
      });

      let items = await Chuyendes.find({
        monthi: id,
      });

      res.status(200).json({ message: "update thành công", items });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message:
          "Có lỗi xảy ra khi điều chỉnh. Vui lòng liên hệ quản trị hệ thống.",
      });
    }
  },

  deleteChuyende: async (req, res) => {
    const id = req.params.id;
    const id1 = req.params.id1;
    try {
      if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(id1)) {
        return res.status(400).json({
          status: "failed",
          message: "Mã kiến thức đánh giá hoặc chuyên đề không hợp lệ",
        });
      }

      if (!isMonthiAllowed(req.user, id)) {
        return res.status(403).json({
          status: "failed",
          message: "Tài khoản không được phân quyền kiến thức đánh giá này",
        });
      }

      const target = await Chuyendes.findOne({
        _id: id1,
        monthi: id,
      })
        .select("_id")
        .lean();

      if (!target) {
        return res.status(404).json({
          status: "failed",
          message:
            "Không tìm thấy chuyên đề trong kiến thức đánh giá đã chọn",
        });
      }

      const [hasQuestions, hasCuocthi] = await Promise.all([
        Cauhois.exists({ chuyende: id1 }),
        Cuocthis.exists({ "config.chuyende": id1 }),
      ]);

      if (hasQuestions) {
        return res.status(409).json({
          status: "failed",
          code: "RESOURCE_IN_USE",
          message:
            "Không thể xóa chuyên đề vì vẫn còn câu hỏi thuộc chuyên đề này",
        });
      }

      if (hasCuocthi) {
        return res.status(409).json({
          status: "failed",
          code: "RESOURCE_IN_USE",
          message:
            "Không thể xóa chuyên đề vì vẫn còn cuộc thi được cấu hình sử dụng chuyên đề này",
        });
      }

      await Chuyendes.deleteOne({ _id: id1, monthi: id });

      const items = await Chuyendes.find({
        monthi: id,
      });
      res.status(200).json({
        status: "success",
        message: "Xóa thành công",
        items,
      });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(500).json({
        status: "failed",
        message: "Có lỗi xảy ra khi xóa. Vui lòng liên hệ quản trị hệ thống.",
      });
    }
  },
};
