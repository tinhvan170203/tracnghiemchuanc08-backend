const { default: mongoose } = require("mongoose");
const Cauhois = require("../models/CauHoi");
const Cuocthis = require("../models/Cuocthi");
const Danhsachthisinhs = require("../models/DanhSachThiSinh");
const Donvis = require("../models/Donvi");
const LichsuThis = require("../models/LichsuThi");
const Monthis = require("../models/Monthi");
const Users = require("../models/User");
const crypto = require('crypto');
const dayjs = require('dayjs');
// Cần một khóa bí mật (32 ký tự) và một vector khởi tạo (16 ký tự)
// Trong thực tế, hãy lưu cái này vào file .env, KHÔNG để trực tiếp trong code
// const SECRET_KEY = Buffer.from('12345678901234567890123456789012'); // 32 bytes
const IV_LENGTH = 16;

// 1. Hàm mã hóa (Dùng cho Tên, Tuổi, SĐT...)
const encryptData = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', process.env.SECRET_KEY, iv);
  let encrypted = cipher.update(text.toString());
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  // Trả về iv + dữ liệu mã hóa để sau này còn giải mã được
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

// 2. Hàm giải mã (Để lấy lại tên thật hiển thị lên web)
const decryptData = (encryptedText) => {
  const textParts = encryptedText.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedData = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', process.env.SECRET_KEY, iv);
  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

module.exports = {
  //controller monthi
  getMonthiList: async (req, res) => {
    let perPage = 5;
    let page = Number(req.query.page) || 1;
    let { tenmonthi, mota } = req.query;

    try {
      let donvisDb = await Monthis.find({
        mota: { $regex: mota, $options: "i" },
        tenmonthi: { $regex: tenmonthi, $options: "i" },
      }).sort({ thutu: 1 });

      let tongbanghi = donvisDb.length;
      let total = Math.ceil(donvisDb.length / perPage);

      let donvis = await Monthis.find({
        mota: { $regex: mota, $options: "i" },
        tenmonthi: { $regex: tenmonthi, $options: "i" },
      })
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage);
      res
        .status(200)
        .json({ status: "success", donvis, page, total, tongbanghi });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message: "Có lỗi xảy ra khi lấy dữ liệu. Vui lòng liên hệ Admin",
      });
    }
  },

  addMonthi: async (req, res) => {
    let { tenmonthi, mota, thutu, link_test } = req.body;
    let motaParam = req.body.queryParams.mota;
    let tenmonthiParam = req.body.queryParams.tenmonthi;
    let page = req.body.queryParams.page;
    let perPage = 5;

    try {
      let newItem = new Monthis({
        tenmonthi,
        mota,
        thutu: Number(thutu),
        link_test
      });
      await newItem.save();

      let donvisDb = await Monthis.find({
        mota: { $regex: motaParam, $options: "i" },
        tenmonthi: { $regex: tenmonthiParam, $options: "i" },
      }).sort({ thutu: 1 });

      //   let banghi = await Monthis.find({
      //     mota: { $regex: mota, $options: "i" },
      //     tenmonthi: { $regex: tenmonthi, $options: "i" }
      //   });

      let tongbanghi = donvisDb.length;
      let total = Math.ceil(donvisDb.length / perPage);

      let donvis = await Monthis.find({
        mota: { $regex: motaParam, $options: "i" },
        tenmonthi: { $regex: tenmonthiParam, $options: "i" },
      })
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage);

      res
        .status(200)
        .json({
          status: "success",
          donvis,
          page,
          total,
          tongbanghi,
          message: "thêm mới thành công",
        });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message: "Có lỗi xảy ra khi thêm mới bản ghi",
      });
    }
  },

  deleteMonthi: async (req, res) => {
    let id = req.params.id;
    let perPage = 5;
    let page = 1;
    let { tenmonthi, mota } = req.query;

    try {
      //check xem có câu hỏi nào của môn thi k
      let checkedCauhoi = await Cauhois.findOne({
        monthi: id
      });

      // console.log(checkedCauhoi !== null)
      if (checkedCauhoi !== null) {
        const error = new Error('Lỗi do có câu hỏi thuộc môn thi bạn muốn xóa');
        error.status = 409;
        throw error;
      };

      //check xem có cuoc thi  nào của môn thi k
      let checkedCuocthi = await Cuocthis.findOne({
        monthi: id
      });

      // console.log(checkedCauhoi !== null)
      if (checkedCuocthi !== null) {
        const error = new Error('Lỗi do có dữ liệu cuộc thi thuộc môn thi bạn muốn xóa');
        error.status = 401;
        throw error;
      };

      let user = await Users.findById(req.user._id);
      user.quantrinhomdonvi = user.quantrinhomdonvi.filter(i => i._id.toString() !== id);
      await user.save();

      await Monthis.findByIdAndDelete(id);

      let donvisDb = await Monthis.find({
        mota: { $regex: mota, $options: "i" },
        tenmonthi: { $regex: tenmonthi, $options: "i" },
      }).sort({ thutu: 1 });

      let tongbanghi = donvisDb.length;

      let total = Math.ceil(donvisDb.length / perPage);
      let donvis = await Monthis.find({
        mota: { $regex: mota, $options: "i" },
        tenmonthi: { $regex: tenmonthi, $options: "i" },
      })
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage);

      res.status(200).json({
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
        .json({
          status: "failed",
          message: error.message,
        });
    }
  },
  editMonthi: async (req, res) => {
    let id = req.params.id;
    const { tenmonthi, mota, thutu, link_test } = req.body;
    let page = req.body.queryParams.page;
    let perPage = 5;
    let motaParam = req.body.queryParams.mota;
    let tenmonthiParam = req.body.queryParams.tenmonthi;
    try {
      await Monthis.findByIdAndUpdate(id, {
        tenmonthi,
        mota,
        thutu: Number(thutu),
        link_test
      });
      let donvis = await Monthis.find({
        mota: { $regex: motaParam, $options: "i" },
        tenmonthi: { $regex: tenmonthiParam, $options: "i" },
      })
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage);

      res.status(200).json({
        status: "success",
        donvis,
        message: "Cập nhật thành công",
      });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message: "Có lỗi xảy ra khi chỉnh sửa",
      });
    }
  },
  getMonthiDetail: async (req, res) => {
    let id = req.params.id;

    let quantrinhommonthi = req.user.quantrinhomdonvi;
    try {
      let item = await Monthis.findById(id);
      res.status(200).json({ item, quantrinhommonthi });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message: "Có lỗi xảy ra khi lấy thông tin chi tiết môn thi",
      });
    }
  },
  getMonthiOfUser: async (req, res) => {
    try {
      let quantrinhommonthi = req.user.quantrinhomdonvi;
      // let donviList = await Donvis.find().sort({thutu: 1})
      let donviList = [];
      res.status(200).json({ quantrinhommonthi, donviList })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message: "Có lỗi xảy ra khi lấy thông tin chi tiết môn thi",
      });
    }
  },

  // cuộc thi
  addCuocthi: async (req, res) => {
    let monthi = req.params.id; //id môn thi
    let {
      tencuocthi,
      soluongcauhoi,
      thoigianthi,
      ngaytochucthi,
      password,
      config
    } = req.body;

    let tencuocthiParam = req.body.queryParams.tencuocthi
    try {
      let newItem = new Cuocthis({
        tencuocthi,
        soluongcauhoi,
        thoigianthi,
        ngaytochucthi,
        password,
        monthi,
        monthiString: monthi,
        config
      });
      await newItem.save();

      let items = await Cuocthis.find({
        tencuocthi: { $regex: tencuocthiParam, $options: "i" },
        monthi
      }).sort({ createdAt: -1 })

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
  getCuocthis: async (req, res) => {
    let { tencuocthi } = req.query;
    let id = req.params.id; // id môn thi
    // console.log(tencuocthi)
    try {
      let items = await Cuocthis.find({
        tencuocthi: { $regex: tencuocthi, $options: "i" },
        monthi: id
      }).sort({ createdAt: -1 })

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

  // update status cuộc thi
  updateStatusCuocthi: async (req, res) => {
    let id1 = req.params.id1; //id1 cuộc thi
    let id = req.params.id; //id môn thi

    let tencuocthiParam = req.body.tencuocthi
    try {
      // await Cuocthis.findOneAndUpdate({ status: true, _id: { $ne: id1 } }, {
      //   status: false
      // });
      let item = await Cuocthis.findById(id1);
      item.status = !item.status;
      await item.save()
      // await Cuocthis.findOneAndUpdate({_id: id1}, {
      //   status: true
      // });

      let items = await Cuocthis.find({
        tencuocthi: { $regex: tencuocthiParam, $options: "i" },
        monthi: id
      }).sort({ createdAt: -1 })

      res.status(200).json(items);

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

  updateOptionCuocthi: async (req, res) => {
    let { tencuocthi, soluongcauhoi, thoigianthi, ngaytochucthi, config } = req.body;
    let tencuocthiParam = req.body.queryParams.tencuocthi;
    let id1 = req.params.id1; //id1 cuộc thi
    let id = req.params.id; //id môn thi
    try {
      await Cuocthis.findByIdAndUpdate(id1, {
        tencuocthi,
        soluongcauhoi, thoigianthi, ngaytochucthi,
        config
      });

      let items = await Cuocthis.find({
        tencuocthi: { $regex: tencuocthiParam, $options: "i" },
        monthi: id
      }).sort({ createdAt: -1 })

      res.status(200).json({ items, message: "Update cấu hình cuộc thi thành công!" });

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

  //delete cuộc thi sẽ xóa hết thí sinh trong cuộc thi và lịch sử bài thi cửa thí sinh thi đó
  deleteCuocthi: async (req, res) => {
    let id = req.params.id; //id môn thi

    let id1 = req.params.id1; //id cuộc thi cần xóa
    let { tencuocthi } = req.query;
    try {

      await LichsuThis.deleteMany({ id_cuocthi: id1 })

      await Cuocthis.findByIdAndDelete(id1);

      let items = await Cuocthis.find({
        tencuocthi: { $regex: tencuocthi, $options: "i" },
        monthi: id
      }).sort({ createdAt: -1 })
      res.status(200).json({ message: "Xóa cuộc thi thành công", items })
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

  getKetquathi: async (req, res) => {
    let id = req.params.id; //id cuoocj thi cần lấy kết quả
    let { tungay, denngay } = req.query;

    if (!tungay) {
      tungay = "1990-01-01"
    };

    if (!denngay) {
      denngay = "3010-01-01"
    }

    try {
      let cuocthi = await Cuocthis.findById(id);

      let data = [];
      // let list_baithi = await LichsuThis.find({ id_cuocthi: id }).populate("questions.question");
      let list_baithi = await LichsuThis
        .find({ id_cuocthi: id })
        .populate({
          path: "questions.question",
          select: "answer" // 🔥 chỉ lấy answer
        })
        .select("questions createdAt socaudung thongtinthisinh thoigianbatdau thoigiannopbai")
        .lean();

      for (baithi of list_baithi) {
        if (!baithi.thoigiannopbai) continue;
        // let socaudung = 0;
        // baithi.questions.forEach(question => {
        //   if (question.question.answer === question.choice) {
        //     socaudung += 1
        //   }
        // });

        let time = (new Date(baithi.thoigiannopbai)).getTime() - (new Date(baithi.thoigianbatdau)).getTime();

        // let phoneNumber = decryptData(baithi.thongtinthisinh.donvi);
        // const lastThree = phoneNumber.slice(-3);

        // // Lặp lại dấu * dựa trên độ dài còn lại và cộng với 3 số cuối
        // const maskedPhone = "*".repeat(phoneNumber.length - 3) + lastThree;

        // const maskDate = "*".repeat(baithi.thongtinthisinh.birthday.length - 3) + baithi.thongtinthisinh.birthday.slice(-3);
        // let thongtinthisinh = {
        //   name: decryptData(baithi.thongtinthisinh.name),
        //   donvi: maskedPhone,
        //   phone: decryptData(baithi.thongtinthisinh.phone), // địa chi
        //   birthday: maskDate,
        //   hokhau: baithi.thongtinthisinh.hokhau
        // }
        let thongtinthisinh = {
          name: decryptData(baithi.thongtinthisinh.name),
          donvi: decryptData(baithi.thongtinthisinh.donvi),
          phone: decryptData(baithi.thongtinthisinh.phone), // địa chi
          birthday: baithi.thongtinthisinh.birthday,
          hokhau: baithi.thongtinthisinh.hokhau
        }
        data.push({
          _id: baithi._id,
          time,
          thongtinthisinh: thongtinthisinh,
          socaudung: baithi.socaudung,
          createdAt: baithi.createdAt
        })
      };
      // console.log(data)
      //sắp xếp các thí sinh theo thứ tự câu trả lời đúng từ cao xuống thấp
      // data  = data.sort((a, b)=> b.socaudung - a.socaudung);
      // BƯỚC 1: SẮP XẾP
      data.sort((a, b) => {
        // Ưu tiên 1: Số câu đúng giảm dần (Lớn trước)
        let diemSo = b.socaudung - a.socaudung;
        if (diemSo !== 0) return diemSo;

        // Ưu tiên 2: Thời gian tăng dần (Bé trước)
        return a.time - b.time;
      });

      // BƯỚC 2: THÊM TRƯỜNG RANK
      // Dùng map để tạo ra mảng mới có thêm field rank
      let dataWithRank = data.map((item, index) => {
        return {
          ...item,        // Giữ nguyên các trường cũ
          rank: index + 1 // Xếp hạng = vị trí trong mảng + 1 (vì index bắt đầu từ 0)
        };
        // }).slice(0,20);
      });

      dataWithRank = dataWithRank.filter(item => {
        const date = dayjs(item.createdAt).format("YYYY-MM-DD");
        return (new Date(date)).getTime() >= (new Date(tungay)).getTime() && (new Date(date)).getTime() <= (new Date(denngay)).getTime();
      });

      list_baithi = list_baithi.filter(item => {
        const date = dayjs(item.createdAt).format("YYYY-MM-DD");
        return (new Date(date)).getTime() >= (new Date(tungay)).getTime() && (new Date(date)).getTime() <= (new Date(denngay)).getTime();
      });

      res.status(200).json({ data: dataWithRank, total: list_baithi.length, cuocthi })
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

  thongKeCauHoiSai: async (req, res) => {
    let { idCuocThi } = req.query;
//   const explainResult = await LichsuThis.aggregate([
//     {
//       $match: {
//         id_cuocthi: new mongoose.Types.ObjectId(idCuocThi),
//       },
//     },
//     { $unwind: "$questions" },
//     {
//       $lookup: {
//         from: "cauhois",
//         localField: "questions.question",
//         foreignField: "_id",
//         as: "cauhoi_info",
//       },
//     },
//     { $unwind: "$cauhoi_info" },
//   ]).explain("executionStats");

//   console.log(JSON.stringify(explainResult, null, 2));
    try {
     const result = await LichsuThis.aggregate([
  {
    $match: {
      id_cuocthi: new mongoose.Types.ObjectId(idCuocThi),
    },
  },
  // Lookup TRƯỚC khi unwind — chỉ chạy 1 lần/document (3367 lần thay vì 48215 lần)
  {
    $lookup: {
      from: "cauhois",
      localField: "questions.question", // Mongo tự nhận đây là mảng, match kiểu $in
      foreignField: "_id",
      as: "cauhoi_lookup",
    },
  },
  { $unwind: "$questions" },
  // Khớp lại đúng câu hỏi tương ứng từ mảng đã lookup sẵn
  {
    $addFields: {
      cauhoi_info: {
        $first: {
          $filter: {
            input: "$cauhoi_lookup",
            cond: { $eq: ["$$this._id", "$questions.question"] },
          },
        },
      },
    },
  },
  {
    $addFields: {
      da_tra_loi: { $ifNull: ["$questions.choice", false] },
    },
  },
  {
    $addFields: {
      is_khong_tra_loi: {
        $cond: [{ $eq: ["$da_tra_loi", false] }, 1, 0],
      },
      is_sai: {
        $cond: [
          {
            $and: [
              { $ne: ["$da_tra_loi", false] },
              { $ne: ["$questions.choice", "$cauhoi_info.answer"] },
            ],
          },
          1,
          0,
        ],
      },
    },
  },
  {
    $group: {
      _id: "$questions.question",
      question: { $first: "$cauhoi_info.question" },
      image: { $first: "$cauhoi_info.image" },
      chuyendeString: { $first: "$cauhoi_info.chuyendeString" },
      option_a: { $first: "$cauhoi_info.option_a" },
      option_b: { $first: "$cauhoi_info.option_b" },
      option_c: { $first: "$cauhoi_info.option_c" },
      option_d: { $first: "$cauhoi_info.option_d" },
      option_e: { $first: "$cauhoi_info.option_e" },
      answer: { $first: "$cauhoi_info.answer" },
      tong_luot_lam: { $sum: 1 },
      so_luot_sai: { $sum: "$is_sai" },
      so_luot_khong_tra_loi: { $sum: "$is_khong_tra_loi" },
    },
  },
  {
    $addFields: {
      so_luot_da_tra_loi: {
        $subtract: ["$tong_luot_lam", "$so_luot_khong_tra_loi"],
      },
    },
  },
  {
    $addFields: {
      ti_le_sai: {
        $cond: [
          { $eq: ["$so_luot_da_tra_loi", 0] },
          0,
          {
            $round: [
              { $multiply: [{ $divide: ["$so_luot_sai", "$so_luot_da_tra_loi"] }, 100] },
              2,
            ],
          },
        ],
      },
    },
  },
  { $sort: { ti_le_sai: -1 } },
  { $limit: 10 },
]);
      return res.status(200).json(result)

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
  thongke: async (req, res) => {
    try {
      let { fromDate, toDate, monthi } = req.query;
      if (!fromDate) {
        {
          fromDate = "1990-01-01"
        }
      };
      if (!toDate) {
        {
          toDate = "3000-01-01"
        }
      };
      // console.log(monthi)
      // 2. Chuyển thành đối tượng Date
      const date = new Date(toDate);
      // 3. Cộng thêm 1 ngày (1 ngày = 24 * 60 * 60 * 1000 mili-giây)
      date.setDate(date.getDate() + 1);

      // 4. Định dạng lại thành yyyy-mm-dd
      toDate = date.toISOString().split('T')[0];
      // let list_baithi = await LichsuThis.find({ id_cuocthi: id }).populate("questions.question");
      let options = monthi === "" ? {
        createdAt: {
          $lte: toDate,
          $gte: fromDate
        }
      } : {
        createdAt: {
          $lte: toDate,
          $gte: fromDate
        }, monthi: monthi
      }
      let cuocthis = await Cuocthis.find(options).lean();
      let cuocthis_ids = cuocthis.map(i => i._id.toString())
      let list_baithi = await LichsuThis
        .find({ id_cuocthi: { $in: cuocthis_ids } })
        .select('socaudung createdAt soluongcauhoi thoigianketthuc thoigiannopbai')
        .lean();
      // console.log(list_baithi.length)

      let list_nopbai = list_baithi.filter(i => i.thoigiannopbai !== 0);
      let total_nopbai = list_nopbai.length;
      // 3. Phân loại chỉ với 1 vòng lặp duy nhất (Tối ưu hiệu suất)
      const stats = list_baithi.reduce((acc, current) => {
        const ratio = current.socaudung / current.soluongcauhoi;

        if (current.thoigianketthuc !== null) acc.total_nopbai++;

        if (ratio < 0.5) acc.total_khongdat++;
        else if (ratio < 0.7) acc.total_trungbinh++;
        else if (ratio < 0.8) acc.total_kha++;
        else if (ratio < 0.9) acc.total_gioi++;
        else acc.total_xuatsac++;

        return acc;
      }, {
        total_khongdat: 0,
        total_trungbinh: 0,
        total_kha: 0,
        total_gioi: 0,
        total_xuatsac: 0,
        total_nopbai: 0
      });
      res.status(200).json({
        ...stats,
        total: list_baithi.length,
        total_nopbai
      });

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
  updateAnswers: async (req, res) => {
    try {
      const batchSize = 500;
      let bulkOps = [];

      console.time("updateAnswers");

      // ✅ 1. Load toàn bộ đáp án (nhẹ)
      const questions = await Cauhois.find()
        .select("_id answer")
        .lean();

      const questionMap = {};
      questions.forEach(q => {
        questionMap[q._id.toString()] = q.answer;
      });

      // ✅ 2. Load cấu hình cuộc thi
      const cuocthis = await Cuocthis.find()
        .select("_id soluongcauhoi")
        .lean();

      const cuocthiMap = {};
      cuocthis.forEach(c => {
        cuocthiMap[c._id.toString()] = c.soluongcauhoi;
      });

      // ✅ 3. Cursor để tránh load RAM
      const cursor = LichsuThis.find()
        .select("questions id_cuocthi")
        .lean()
        .cursor();

      let count = 0;

      for (
        let baithi = await cursor.next();
        baithi != null;
        baithi = await cursor.next()
      ) {
        let socaudung = 0;

        for (const question of baithi.questions) {
          const correctAnswer = questionMap[question.question?.toString()];
          if (correctAnswer === question.choice) {
            socaudung++;
          }
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: baithi._id },
            update: {
              $set: {
                socaudung,
                soluongcauhoi:
                  cuocthiMap[baithi.id_cuocthi?.toString()] || 0
              }
            }
          }
        });

        count++;

        // 👉 log tiến trình
        if (count % 1000 === 0) {
          console.log("Processed:", count);
        }

        // 👉 batch write
        if (bulkOps.length === batchSize) {
          await LichsuThis.bulkWrite(bulkOps);
          bulkOps = [];
        }
      }

      // 👉 phần còn lại
      if (bulkOps.length > 0) {
        await LichsuThis.bulkWrite(bulkOps);
      }

      console.timeEnd("updateAnswers");
      console.log("DONE");

      res.send("okok");
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(500).json({
        status: "failed",
        message: "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
      });
    }
  },

  // sửa tiếp V03 
  

};
