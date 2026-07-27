
const Diaphuongs = require("../models/Diaphuongs");

module.exports = {
  getDiaphuongs: async (req, res) => {
    let id = req.params.id; // id mono thi
    try {
      let items = await Diaphuongs.find().sort({ thutu: 1 });
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

  addDiaphuong: async (req, res) => {
    try {
      let newItem = new Diaphuongs(req.body);
      await newItem.save();
      let items = await Diaphuongs.find().sort({ thutu: 1 });

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
  updatedDiaphuong: async (req, res) => {
    let id = req.params.id; //id cuocthi

    try {
      await Diaphuongs.findByIdAndUpdate(id, req.body);

      let items = await Diaphuongs.find().sort({ thutu: 1 });

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

  deleteDiaphuong: async (req, res) => {
    let id = req.params.id;
    try {
      await Diaphuongs.findByIdAndDelete(id);
      let items = await Diaphuongs.find().sort({ thutu: 1 });
      res.status(200).json({ message: "Xóa thành công", items });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message:
          "Có lỗi xảy ra khi xóa. Vui lòng liên hệ quản trị hệ thống.",
      });
    }
  },

  sumaryKetquas: async (req, res) => {
    try {
      let { fromDate, toDate, list } = req.query;
      console.log(req.query)

      const params = new URLSearchParams({
        fromDate,
        toDate
      });
      let dsDiaPhuong = await Diaphuongs.find({ _id: { $in: list } }).lean();
      const results = await Promise.all(
        dsDiaPhuong.map(async (item) => {
          try {

            const response = await fetch(
              `${item.domain}?${params.toString()}`
            );

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            return {
              success: true,
              text: item.text,
              domain: item.domain,
              data
            };
          } catch (error) {
            return {
              success: false,
              text: item.text,
              domain: item.domain,
              error: error.message
            };
          }
        })
      );

      // console.log(results)
      const listSuccess = results.filter(x => x.success);
      const listError = results.filter(x => !x.success);
      // console.log(listSuccess)
      // console.log(listError)
      res.status(200).json({ listSuccess, listError })
    } catch (error) {
      console.log(error.message);
      res.status(401).json({ message: error.message })
    }
  }


};
