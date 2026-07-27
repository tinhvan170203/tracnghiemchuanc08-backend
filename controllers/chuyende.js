const Cauhois = require("../models/CauHoi");
const Chuyendes = require("../models/Chuyende");
const Cuocthis = require("../models/Cuocthi");
const LichsuThis = require("../models/LichsuThi");



module.exports = {
  getChuyendes: async (req, res) => {
   
    let id = req.params.id; // id mono thi
    try {
      let items = await Chuyendes.find({
        monthi: id
      });
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

  addChuyende: async (req, res) => {
    let id = req.params.id; //id mono thi
    let {
      title,
      link_test
    } = req.body;
// console.log(req.body)
    try {
      let newItem = new Chuyendes({
        title, monthi: id, link_test
      });
      await newItem.save();
      let items = await Chuyendes.find({
        monthi: id
      });

      res.status(200).json({
        status: "success",
        message: "Thêm mới thành công",
        items
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
    let id = req.params.id; //id cuocthi
    let id1 = req.params.id1; //id thí sinh
    let {
      title,
      link_test
    } = req.body;

    try {
      await Chuyendes.findByIdAndUpdate(id1, {
        title,link_test
      });

      let items = await Chuyendes.find({
        monthi: id
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
    let id = req.params.id;
    let id1 = req.params.id1;
    try {
      //checked xem có lịch sử thi nào của thí sinh k nếu có thì xóa cả lịch sử thi đó
      
      let checked = await Cuocthis.findOne({
        "config.chuyende": id1
      });

      if (checked) {
        return res.status(409).json({ message: "Lỗi không thể xóa chuyên đề do có cuộc thi đã cấu hình sử dụng câu hỏi chuyên đề này" })
      };


      let questions = await Cauhois.find({chuyende: id1});
      let questions_id = questions.map(i=>i._id.toString())
      await LichsuThis.deleteMany({ 'questions.question': {$in: questions_id} });

      await Chuyendes.findByIdAndDelete(id1);

      let items = await Chuyendes.find({
        monthi: id
      });
      console.log('xoas chuyeen ddeef')
      res.status(200).json({ message: "Xóa thành công", items });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message:
          "Có lỗi xảy ra khi xóa. Vui lòng liên hệ quản trị hệ thống.",
      });
    }
  }
};
