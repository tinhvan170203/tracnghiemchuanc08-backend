const Cauhois = require("../models/CauHoi");
const Danhsachthisinhs = require("../models/DanhSachThiSinh");
const LichsuThis = require("../models/LichsuThi");



module.exports = {
  getThisinhs: async (req, res) => {
    let { hoten, donvi } = req.query;
    let id = req.params.id; // id cuộc thi
    try {
      let items = await Danhsachthisinhs.find({
        hoten: { $regex: hoten, $options: "i" }, 
        donviString: { $regex: donvi, $options: "i" }, 
        cuocthi: id
      }).sort({sbd: 1}).populate('donvi')

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

  addThisinh: async (req, res) => {
    let id = req.params.id; //id cuộc thi
    let {
        hoten, sbd, namsinh, donvi, capbac, chucvu
    } = req.body;

    let hotenParam = req.body.queryParams.hoten;
    let donviParam = req.body.queryParams.donvi;
 
    try {
      let newItem = new Danhsachthisinhs({
        hoten, sbd, namsinh, donvi,donviString: donvi, cuocthi: id, cuocthiString: id,capbac, chucvu
      });
      await newItem.save();

      let items = await Danhsachthisinhs.find({
        hoten: { $regex: hotenParam, $options: "i" }, 
        donviString: { $regex: donviParam, $options: "i" }, 
        cuocthi: id
      }).sort({sbd: 1}).populate('donvi')

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
  updatedThisinh: async (req, res) => {
    let id = req.params.id; //id cuocthi
    let id1 = req.params.id1; //id thí sinh
    let {
        hoten, sbd, namsinh, donvi,capbac, chucvu
    } = req.body;
    let hotenParam = req.body.queryParams.hoten;
    let donviParam = req.body.queryParams.donvi;
  
    try {
      await Danhsachthisinhs.findByIdAndUpdate(id1, {
        capbac, chucvu,hoten, sbd, namsinh, donvi,donviString: donvi,
      });

      let items = await Danhsachthisinhs.find({
        hoten: { $regex: hotenParam, $options: "i" }, 
        donviString: { $regex: donviParam, $options: "i" }, 
        cuocthi: id
      }).sort({sbd: 1}).populate('donvi')

      res.status(200).json({ message: "update thành công" , items});
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message:
          "Có lỗi xảy ra khi điều chỉnh. Vui lòng liên hệ quản trị hệ thống.",
      });
    }
  },

  deleteThisinh: async (req, res) => {
    let id = req.params.id;
    let id1 = req.params.id1; //id thí sinh

    let { hoten, donvi } = req.query;

    try {
        //checked xem có lịch sử thi nào của thí sinh k nếu có thì xóa cả lịch sử thi đó
      await LichsuThis.deleteMany({thisinh: id1 });

      await Danhsachthisinhs.findByIdAndDelete(id1);
      
      let items = await Danhsachthisinhs.find({
        hoten: { $regex: hoten, $options: "i" }, 
        donviString: { $regex: donvi, $options: "i" }, 
        cuocthi: id
      }).sort({sbd: 1}).populate('donvi')
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
