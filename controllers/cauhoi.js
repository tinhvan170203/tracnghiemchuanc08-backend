const Cauhois = require("../models/CauHoi");
const LichsuThis = require("../models/LichsuThi");
const Chuyendes = require("../models/Chuyende");


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
      chuyende, monthi
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
        chuyendeString: chuyende
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
      chuyende, monthi
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
        chuyendeString: chuyende
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
  deleteCauhoi: async (req, res) => {
    let id = req.params.id; //id delete
    let { question, chuyende, monthi } = req.query;

    try {
      //check xem có thí sinh nào thi vào câu hỏi đó k trong lịch sử thi
      let checkedLichsuthi = await LichsuThis.findOne({
        "questions.question": id
      });

      if (checkedLichsuthi !== null) {
        const error = new Error('Thao tác xóa thất bại do bài thi của thí sinh có chứa câu hỏi này');
        error.status = 409;
        throw error;
      };

      await Cauhois.findByIdAndDelete(id);

      let chuyendeList = await Chuyendes.find({ monthi });
      let chuyendeList_id = chuyendeList.map(i => i._id.toString());
      let items = await Cauhois.find({
        question: { $regex: question, $options: "i" },
        chuyendeString: { $regex: chuyende, $options: "i" },
        chuyende: { $in: chuyendeList_id }
      }).sort({ createdAt: -1 }).populate('chuyende')
      res.status(200).json({ message: "Xóa thành công", items });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message: error.message
      });
    }
  }
};
