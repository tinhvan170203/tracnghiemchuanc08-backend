const Cauhois = require("../models/CauHoi");
const Danhsachthisinhs = require("../models/DanhSachThiSinh");
const Donvis = require("../models/Donvi");

module.exports = {
  getDonviList: async (req, res) => {
    let perPage = 5;
    let page = Number(req.query.page) || 1;

    let { tendonvi, kyhieu } = req.query;

    try {
      let donvisDb = await Donvis.find({
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendonvi: { $regex: tendonvi, $options: "i" },
      }).sort({ thutu: 1 });

      let total = Math.ceil(donvisDb.length / perPage);
      let donvis = await Donvis.find({
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendonvi: { $regex: tendonvi, $options: "i" },
      })
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage);
      res.status(200).json({ status: "success", donvis, page, total });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(401)
        .json({
          status: "failed",
          message: error.message,
        });
    }
  },
  addDonvi: async (req, res) => {
    let { tendonvi, kyhieu, thutu } = req.body;
    let tendonviParam = req.body.queryParams.tendonvi;
    let kyhieuParam = req.body.queryParams.kyhieu;
    let page = req.body.queryParams.page;
    let perPage = 5;

    try {
      let newItem = new Donvis({
        tendonvi,
        kyhieu,
        thutu: Number(thutu),
      });
      await newItem.save();
      let donvisDb = await Donvis.find(
        {
          kyhieu: { $regex: kyhieuParam, $options: "i" },
          tendonvi: { $regex: tendonviParam, $options: "i" },
        }
      ).sort({ thutu: 1 });

      let total = Math.ceil(donvisDb.length / perPage);
      let donvis = await Donvis.find(
        {
          kyhieu: { $regex: kyhieuParam, $options: "i" },
          tendonvi: { $regex: tendonviParam, $options: "i" },
        }
      )
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage);
      res
        .status(200)
        .json({
          status: "success",
          donvis,
          total,
          message: "Thêm mới đơn vị thành công",
        });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(401)
        .json({
          status: "failed",
          message: "Có lỗi xảy ra khi thêm mới đơn vị",
        });
    }
  },
  editDonvi: async (req, res) => {
    let id = req.params.id;
    const { tendonvi, kyhieu, thutu} = req.body;
    let tendonviParam = req.body.queryParams.tendonvi;
    let kyhieuParam = req.body.queryParams.kyhieu;
    let page = req.body.queryParams.page;
    let perPage = 5;
    try {
      await Donvis.findByIdAndUpdate(id, {
        tendonvi,
        kyhieu,
        thutu: Number(thutu),
      });
      let donvis = await Donvis.find(
        {
          kyhieu: { $regex: kyhieuParam, $options: "i" },
          tendonvi: { $regex: tendonviParam, $options: "i" },
        }
      )
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage);

      res
        .status(200)
        .json({
          status: "success",
          donvis,
          message: "Cập nhật đơn vị thành công",
        });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(401)
        .json({
          status: "failed",
          message: "Có lỗi xảy ra khi chỉnh sửa đơn vị",
        });
    }
  },
  deleteDonvi: async (req, res) => {
    let id = req.params.id;
    let perPage = 5;
    let page = 1;
    let { tendonvi, kyhieu } = req.query;
    try {
      
      let checkedDelete = await Danhsachthisinhs.find({donviString: id});

      if(checkedDelete.length > 0){
        const error = new Error('Không thể xóa đơn vị do có thí sinh đang thuộc đơn vị này trong hệ thống');
        error.status = 401;
        throw error;
      };
      let checkedDelete1 = await Cauhois.find({donvi: id});

      if(checkedDelete1.length > 0){
        const error = new Error('Không thể xóa đơn vị do có câu hỏi đang thuộc đơn vị này trong hệ thống');
        error.status = 401;
        throw error;
      };
      await Donvis.findByIdAndDelete(id);
      let donvisDb = await Donvis.find({
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendonvi: { $regex: tendonvi, $options: "i" },
      }).sort({ thutu: 1 });

      let total = Math.ceil(donvisDb.length / perPage);
      let donvis = await Donvis.find({
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendonvi: { $regex: tendonvi, $options: "i" },
      })
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage);

      res
        .status(200)
        .json({
          status: "success",
          donvis,
          total,
          message: "Xóa đơn vị thành công",
        });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(401)
        .json({ status: "failed", message: error.message});
    }
  },

  //controller đội, CAX
  getDoiList: async (req, res) => {
    let perPage = 5;
    let page = Number(req.query.page) || 1;
    let quantrinhomdonvi = req.user.quantrinhomdonvi.map(i=> i._id.toString());
    let { tendoi, kyhieu, donvi } = req.query;

    try {
      let donvisDb = await Dois.find({
        donvi: {$in: quantrinhomdonvi},
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendoi: { $regex: tendoi, $options: "i" },
        donviString: { $regex: donvi, $options: "i" },
      }).sort({ thutu: 1 });

      let banghi = await Dois.find({
        donvi: {$in: quantrinhomdonvi},
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendoi: { $regex: tendoi, $options: "i" },
        donviString: { $regex: donvi, $options: "i" },
      });
      let tongbanghi = banghi.length;

      let total = Math.ceil(donvisDb.length / perPage);
      let donvis = await Dois.find({
        donvi: {$in: quantrinhomdonvi},
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendoi: { $regex: tendoi, $options: "i" },
        donviString: { $regex: donvi, $options: "i" },
      })
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate('donvi');
      res.status(200).json({ status: "success", donvis, page, total, tongbanghi });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(401)
        .json({
          status: "failed",
          message: "Có lỗi xảy ra khi lấy dữ liệu. Vui lòng liên hệ Admin",
        });
    }
  },
  addDoi: async (req, res) => {
    let { tendoi, kyhieu, thutu, donvi } = req.body;
   
    let tendoiParam = req.body.queryParams.tendoi;
    let kyhieuParam = req.body.queryParams.kyhieu;
    let donviParam = req.body.queryParams.donvi;
    let page = req.body.queryParams.page;
    let perPage = 5;
    let quantrinhomdonvi = req.user.quantrinhomdonvi.map(i=> i._id.toString());
    try {
      let newItem = new Dois({
        tendoi,
        kyhieu,
        donvi,
        donviString: donvi,
        thutu: Number(thutu),
      });
      await newItem.save();

      let donvisDb = await Dois.find({
        donvi: {$in: quantrinhomdonvi},
        kyhieu: { $regex: kyhieuParam, $options: "i" },
        tendoi: { $regex: tendoiParam, $options: "i" },
        donviString: { $regex: donviParam, $options: "i" },
      }).sort({ thutu: 1 });

      let banghi = await Dois.find({
        donvi: {$in: quantrinhomdonvi},
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendoi: { $regex: tendoi, $options: "i" },
        donviString: { $regex: donvi, $options: "i" },
      });
      let tongbanghi = banghi.length;

      let total = Math.ceil(donvisDb.length / perPage);
      let donvis = await Dois.find({
        donvi: {$in: quantrinhomdonvi},
        kyhieu: { $regex: kyhieuParam, $options: "i" },
        tendoi: { $regex: tendoiParam, $options: "i" },
        donviString: { $regex: donviParam, $options: "i" },
      })
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate('donvi');
      res
        .status(200)
        .json({
          status: "success",
          donvis,
          tongbanghi,
          total,
          message: "Thêm mới đội, CAX thành công",
        });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(401)
        .json({
          status: "failed",
          message: "Có lỗi xảy ra khi thêm mới bản ghi",
        });
    }
  },

  deleteDoi: async (req, res) => {
    let id = req.params.id;
    let perPage = 5;
    let page = 1;
    let { tendoi, kyhieu, donvi } = req.query;
    let quantrinhomdonvi = req.user.quantrinhomdonvi.map(i=> i._id.toString());
    try {
      await Dois.findByIdAndDelete(id);
      let donvisDb = await Dois.find({
        donvi: {$in: quantrinhomdonvi},
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendoi: { $regex: tendoi, $options: "i" },
        donviString: { $regex: donvi, $options: "i" },
      }).sort({ thutu: 1 });

      let banghi = await Dois.find({
        donvi: {$in: quantrinhomdonvi},
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendoi: { $regex: tendoi, $options: "i" },
        donviString: { $regex: donvi, $options: "i" },
      });
      let tongbanghi = banghi.length;

      let total = Math.ceil(donvisDb.length / perPage);
      let donvis = await Dois.find({
        donvi: {$in: quantrinhomdonvi},
        kyhieu: { $regex: kyhieu, $options: "i" },
        tendoi: { $regex: tendoi, $options: "i" },
        donviString: { $regex: donvi, $options: "i" },
      })
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate('donvi');

      res
        .status(200)
        .json({
          status: "success",
          donvis,
          total,
          tongbanghi,
          message: "Xóa thành công",
        });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(401)
        .json({ status: "failed", message: "Có lỗi xảy ra với thao tác xóa. Vui lòng liên hệ Admin" });
    }
  },
  editDoi: async (req, res) => {
    let id = req.params.id;
    const { tendoi, donvi, kyhieu, thutu} = req.body;
    let donviParam = req.body.queryParams.donvi;
    let kyhieuParam = req.body.queryParams.kyhieu;
    let tendoiParam = req.body.queryParams.tendoi;
    let page = req.body.queryParams.page;
    let perPage = 5;
    let quantrinhomdonvi = req.user.quantrinhomdonvi.map(i=> i._id.toString());
    try {
      await Dois.findByIdAndUpdate(id, {
        tendoi,
        donvi,
        donviString: donvi,
        kyhieu,
        thutu: Number(thutu),
      });
      let donvis = await Dois.find(
        {
          donvi: {$in: quantrinhomdonvi},
          kyhieu: { $regex: kyhieuParam, $options: "i" },
          tendoi: { $regex: tendoiParam, $options: "i" },
          donviString: { $regex: donviParam, $options: "i" },
        }
      )
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .populate('donvi');

      res
        .status(200)
        .json({
          status: "success",
          donvis,
          message: "Cập nhật thành công",
        });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(401)
        .json({
          status: "failed",
          message: "Có lỗi xảy ra khi chỉnh sửa",
        });
    }
  },

  //lấy ra danh sách đơn vị theo phần quyền quản trị đơn vị
  getDonviQuantri: async (req, res) => {

    let donvis = req.user.quantrinhomdonvi
    res.status(200).json({ status: "success", donvis });
    try {
     
    } catch (error) {
      
    }
  },
};
