
const Diaphuongs = require("../models/Diaphuongs");
const { assertSafeFetchUrl } = require("../utils/safeFetchUrl");

module.exports = {
  getDiaphuongs: async (req, res) => {
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
      if (req.body.domain) {
        req.body.domain = await assertSafeFetchUrl(req.body.domain);
      }
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
        message: error.message || "Có lỗi xảy ra khi thêm mới",
      });
    }
  },
  updatedDiaphuong: async (req, res) => {
    let id = req.params.id;

    try {
      if (req.body.domain) {
        req.body.domain = await assertSafeFetchUrl(req.body.domain);
      }
      await Diaphuongs.findByIdAndUpdate(id, req.body);

      let items = await Diaphuongs.find().sort({ thutu: 1 });

      res.status(200).json({ message: "update thành công", items });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message: error.message ||
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

      const params = new URLSearchParams({
        fromDate,
        toDate
      });
      let ids = Array.isArray(list) ? list : (list ? [list] : []);
      let dsDiaPhuong = await Diaphuongs.find({ _id: { $in: ids } }).lean();
      const results = await Promise.all(
        dsDiaPhuong.map(async (item) => {
          try {
            const safeBase = await assertSafeFetchUrl(item.domain);
            const url = new URL(safeBase);
            // merge query params
            for (const [k, v] of params.entries()) {
              url.searchParams.set(k, v);
            }

            const response = await fetch(url.toString(), {
              redirect: "error",
              signal: AbortSignal.timeout(15000),
            });

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

      const listSuccess = results.filter(x => x.success);
      const listError = results.filter(x => !x.success);
      res.status(200).json({ listSuccess, listError })
    } catch (error) {
      console.log(error.message);
      res.status(401).json({ message: error.message })
    }
  }


};
