
const Donvis = require("../models/Donvi");
const Monthis = require("../models/Monthi");
const Cuocthis = require("../models/Cuocthi");
const Danhsachthisinhs = require("../models/DanhSachThiSinh");
const Cauhois = require("../models/CauHoi");
const LichsuThis = require("../models/LichsuThi");
const { default: mongoose } = require("mongoose");
const _ = require('lodash');
const Tailieus = require("../models/Tailieu");
const path = require("path");
const {
  buildDemographicMongoFilter,
} = require("../utils/demographicFilters");
const { normalizeThongkeDateRange } = require("../utils/localDay");

const crypto = require('crypto');
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

const getExamSecretKey = (req) => {
  return (
    req.headers["x-exam-key"] ||
    req.query?.secretKey ||
    req.body?.secretKey ||
    null
  );
};

const assertExamSecret = (item, secretKey) => {
  if (!secretKey || !item?.secretKey || String(secretKey) !== String(item.secretKey)) {
    const error = new Error("Phiên bài thi không hợp lệ. Vui lòng vào thi lại.");
    error.status = 403;
    throw error;
  }
};

// const { question, ...rest } = shuffledObj;
// const result = Object.keys(rest);
// result là mảng các [option] sau khi sắp random 
module.exports = {
  getDonviList: async (req, res) => {
    try {
      let donvis = await Donvis.find().sort({ thutu: 1 });
      res.status(200).json({ status: "success", donvis });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message: "Có lỗi xảy ra khi lấy danh sách đơn vị. Vui lòng liên hệ quản trị viên",
      });
    }
  },

  //thitracnghiem
  getAllMonthi: async (req, res) => {
    try {
      let data = await Monthis.find().sort({ thutu: 1 })
      res.status(200).json(data)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message: error.message,
      });
    }
  },
  getInfoCuocthi: async (req, res) => {
    let id = req.params.id;
    try {
      let item = await Cuocthis.findById(id).populate('monthi');
      res.status(200).json(item)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message: error.message,
      });
    }
  },
  //check xem có cuộc thi nào đang active k
  checkActiveTest: async (req, res) => {
    try {
      let id = req.query.id;
      let checkId = await Cuocthis.findOne({ _id: id },{tencuocthi: 1, soluongcauhoi: 1, thoigianthi: 1, ngaytochucthi: 1});
      if (checkId === null) {
        return res.status(500).json({ message: "Không có cuộc đánh giá" })
      };
      let checkedTest = await Cuocthis.findOne({ _id: id, status: true });
      if (checkedTest === null) {
        return res.status(501).json({ test: checkId, message: "Cuộc đánh giá chưa được diễn ra" })
      };
      res.status(200).json(checkedTest)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(500).json({
        status: "failed",
        message: error.message,
      });
    }
  },

  loginTest: async (req, res) => {
    let { name, phone, birthday, id_cuocthi, donvi, hokhau, gioitinh, loaixe, hang_gplx, nghenghiep } = req.body;
    // console.log(req.body)
    try {
      let item = await Cuocthis.findById(id_cuocthi);

      if(!item){
        return res.status(501).json({message: "Không tìm thấy cuộc thi"})
      }
      let secretKey = crypto.randomBytes(32);
      // console.log(secretKey)
      let config = item.config; // cấu hình số câu hỏi
      // 1. Lọc lấy các chuyên đề có số lượng > 0
      const activeConfigs = config.filter(c => c.soluongcauhoi > 0);

      if (activeConfigs.length === 0) {
        console.log("Không có chuyên đề nào; yêu cầu số lượng câu hỏi > 0");
        return res.status(501).json({message: "Chưa có câu hỏi nào để kiểm tra. Vui lòng liên hệ quản trị hệ thống"});
      }

      // 2. Tạo đối tượng facet động
      const facetStage = {};
      activeConfigs.forEach((c, index) => {
        // Lấy string ID từ config
        const idString = c.chuyende.$oid || c.chuyende;

        facetStage[`topic_${index}`] = [
          {
            $match: {
              // Quan trọng: Phải ép kiểu về ObjectId để DB hiểu
              chuyende: new mongoose.Types.ObjectId(idString),
              active: { $ne: false }
            }
          },
          { $sample: { size: c.soluongcauhoi } }
        ];
      });

      // 3. Thực thi query
      let randomQuestions = [];
      try {
        const result = await Cauhois.aggregate([
          { $facet: facetStage },
          {
            $project: {
              finalQuestions: {
                $concatArrays: Object.keys(facetStage).map(key => `$${key}`)
              }
            }
          }
        ]);

        // Kết quả trả về từ aggregate luôn là một mảng, lấy phần tử đầu tiên
        randomQuestions = result.length > 0 ? result[0].finalQuestions : [];
        // console.log("Số câu hỏi lấy được:", randomQuestions.length);
      } catch (error) {
        console.error("Lỗi khi lấy câu hỏi:", error);
      }

      let questionsSave = [];
      // biến đổi loại bỏ answer -> send to client and save localStorage
      let questionsSendClient = randomQuestions.map(i => {
        let { answer, monthi, ...tempQuestion } = i;
        // câu hỏi và  sau khi random các đáp án
        // let shuffledObj = shuffleObject({...tempQuestion});
        // const { question,__v, image, _id,chuyende, chuyendeString,createdAt, updatedAt, ...rest } = shuffledObj;
        // đảo vị trí các câu trả lời
        // const options_sort = Object.keys(rest);


        const { question, __v, image, _id, chuyende, chuyendeString, createdAt, updatedAt, active, ...rest } = tempQuestion;
        const options_sort = Object.keys(rest);

        questionsSave.push({
          question: i._id,
          options_sort,
        })

        // return {questionlist : shuffledObj, options_sort}
        return { questionlist: tempQuestion, options_sort }
      });


      let time = new Date();
      let timeStart = time.getTime(); // đổi ra milisecond giây
      let timeEnd = timeStart + item.thoigianthi * 60 * 1000;

      let newLichsuthi = new LichsuThis({
        thoigianbatdau: timeStart,
        thoigianketthuc: timeEnd,
        secretKey: secretKey.toString('hex'),
        thongtinthisinh: {
          name: encryptData(name),
          phone: encryptData(phone),
          birthday,
          donvi: encryptData(donvi),
          hokhau,
          gioitinh: gioitinh || "",
          loaixe: loaixe || "",
          hang_gplx: hang_gplx || "",
          nghenghiep: nghenghiep || "",
        },
        id_cuocthi,
        thoigiannopbai: 0,
        questions: questionsSave
      });

      await newLichsuthi.save();

      let cuocthi = {
        _id: newLichsuthi._id, //id lịch sử thi
        thoigianbatdau: newLichsuthi.thoigianbatdau,
        thoigianketthuc: newLichsuthi.thoigianketthuc,
        thoigiannopbai: newLichsuthi.thoigiannopbai,
        // thongtinthisinh: newLichsuthi.thongtinthisinh
      }
      res.status(200).json({ item, questionsSendClient, cuocthi, secretKey: secretKey.toString('hex') })

    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(500).json({
        status: "failed",
        message: error.message,
      });
    }
  },

  checkedTest: async (req, res) => {
    let id = req.params.id; //id bài thi cần test
    const secretKey = getExamSecretKey(req);

    try {
      let checked = await LichsuThis.findById(id);
      if (checked === null) {
        const error = new Error('Bài thi trên thiết bị đã bị xóa bởi quản trị viên. Vui lòng nhập thông tin để vào thi lần tiếp theo.');
        error.status = 401;
        throw error;
      };

      assertExamSecret(checked, secretKey);

      let checkedNopbai = checked.thoigiannopbai !== 0;
      if (checkedNopbai) {
        const error = new Error('Bài thi trên thiết bị đã hoàn thành. Vui lòng nhập lại các thông tin để vào thi lần tiếp theo.');
        error.status = 401;
        throw error;
      };

      let timeNow = new Date();
      timeNow = timeNow.getTime()
      // Không trả lại secretKey — client phải giữ key nhận từ loginTest
      res.status(200).json({ timeNow })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(error.status || 500).json({
        status: "failed",
        message: error.message,
      });
    }
  },

  submitTest: async (req, res) => {
    // Body: { secretKey, answers: [{ _id, choice }, ...] } (cũng chấp nhận header x-exam-key)
    const secretKey = getExamSecretKey(req);
    const questions = Array.isArray(req.body) ? req.body : (req.body?.answers || []);

    let id = req.params.id; // id bai thi
    let time = new Date();
    let timeEndTest = time.getTime(); // đổi ra milisecond giây
    try {
      let item = await LichsuThis.findById(id).populate("questions.question")
      if (!item) {
        return res.status(404).json({ status: "failed", message: "Không tìm thấy bài thi" });
      }

      assertExamSecret(item, secretKey);

      if (item.thoigiannopbai !== 0) {
        return res.status(400).json({
          status: "failed",
          message: "Bài thi đã được nộp trước đó, không thể nộp lại.",
        });
      }

      // Cho phép trễ tối đa 60s so với giờ kết thúc (auto-submit / mạng chậm)
      const graceMs = 60 * 1000;
      if (timeEndTest > Number(item.thoigianketthuc) + graceMs) {
        return res.status(400).json({
          status: "failed",
          message: "Đã quá thời gian làm bài, không thể nộp.",
        });
      }

      let name = decryptData(item.thongtinthisinh.name)
      let choicedTrue = 0;

      let updatedQuestions = item.questions.map(question => {
        let compareQuestion = questions.find(i => i._id?.toString() === question.question._id.toString());
        const choice = compareQuestion?.choice !== undefined ? compareQuestion.choice : "";

        if (compareQuestion && question.question.answer === choice) {
          choicedTrue += 1
        }
        const daTraLoi = choice !== "" && choice !== false && choice != null;
        return {
          question: question.question._id,
          options_sort: question.options_sort,
          choice,
          is_khong_tra_loi: daTraLoi ? 0 : 1,
          is_sai: daTraLoi && question.question.answer !== choice ? 1 : 0,
        }
      });

      await LichsuThis.findOneAndUpdate({ _id: id }, {
        thoigiannopbai: timeEndTest,
        questions: updatedQuestions,
        socaudung: choicedTrue,
        soluongcauhoi: item.questions.length
      });

      let allQuestion = item.questions.length;
      let timeStartTest = (new Date(item.thoigianbatdau)).getTime()
      let timeTest = timeEndTest - timeStartTest;

      res.status(200).json({
        message: "Chúc mừng bạn đã hoàn thành bài thi", choicedTrue,
        allQuestion, timeTest, mabaithi: item._id, thoigianbatdau: timeStartTest, name
      })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(error.status || 500).json({
        status: "failed",
        message: error.message,
      });
    }
  },
  previewTest: async (req, res) => {
    let id = req.params.id; // id bai thi
    const secretKey = getExamSecretKey(req);
    try {
      let item = await LichsuThis.findById(id).populate("questions.question").populate('id_cuocthi').lean()
      if (!item) {
        return res.status(404).json({ status: "failed", message: "Không tìm thấy bài thi" });
      }

      assertExamSecret(item, secretKey);

      if (item.thoigiannopbai === 0) {
        return res.status(400).json({
          status: "failed",
          message: "Chỉ xem lại bài thi sau khi đã nộp bài.",
        });
      }

      let choicedTrue = 0;

      let questionList = item.questions.map(i => {
        if (i.question.answer === i.choice) {
          choicedTrue += 1
        };

        return { questionlist: i.question, options_sort: i.options_sort, choice: i.choice }
      });

      let thongtinthisinh = item.thongtinthisinh;
      let thoigianbatdau = item.thoigianbatdau;
      let thoigiannopbai = item.thoigiannopbai;
      let tencuocthi = item.id_cuocthi.tencuocthi;
      let mabaithi = item._id;


      let allQuestion = item.questions.length;
      res.status(200).json({ message: "", choicedTrue, allQuestion, questionList, thongtinthisinh, thoigianbatdau, thoigiannopbai, tencuocthi, mabaithi })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(error.status || 500).json({
        status: "failed",
        message: error.message,
      });
    }
  },

  /** Preview bài thi cho admin (JWT) — không cần secretKey thí sinh */
  previewTestAdmin: async (req, res) => {
    let id = req.params.id;
    try {
      let item = await LichsuThis.findById(id).populate("questions.question").populate('id_cuocthi').lean()
      if (!item) {
        return res.status(404).json({ status: "failed", message: "Không tìm thấy bài thi" });
      }

      let choicedTrue = 0;
      let questionList = item.questions.map(i => {
        if (i.question?.answer === i.choice) {
          choicedTrue += 1
        };
        return { questionlist: i.question, options_sort: i.options_sort, choice: i.choice }
      });

      res.status(200).json({
        message: "",
        choicedTrue,
        allQuestion: item.questions.length,
        questionList,
        thongtinthisinh: item.thongtinthisinh,
        thoigianbatdau: item.thoigianbatdau,
        thoigiannopbai: item.thoigiannopbai,
        tencuocthi: item.id_cuocthi?.tencuocthi,
        mabaithi: item._id,
      })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(500).json({
        status: "failed",
        message: error.message,
      });
    }
  },

  //sửa AI , thư viện
  saveFile: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ status: "failed", message: "Chưa chọn file" });
      }
      // Chỉ lưu basename an toàn (multer đã sanitize)
      const link = path.basename(req.file.filename);
      const tieuDe = (req.body.tieu_de || req.body.text || "").trim();
      if (!tieuDe) {
        return res.status(400).json({ status: "failed", message: "Vui lòng nhập tiêu đề tài liệu" });
      }
      const chuThich = (req.body.chu_thich || "").trim();
      const ghiChu = (req.body.ghi_chu || "").trim();
      let item = new Tailieus({
        tieu_de: tieuDe,
        chu_thich: chuThich,
        ghi_chu: ghiChu,
        text: tieuDe,
        file: link,
        thutu: Number(req.body.thutu)
      })

      await item.save();

      let items = await Tailieus.find().sort({ thutu: 1 })
      res.status(200).json(items)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({ status: "failed", message: "Có lỗi xảy ra" });
    }
  },

  fetchFile: async (req, res) => {
    try {
      let items = await Tailieus.find().sort({ thutu: 1 });
      res.status(200).json(items)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({ status: "failed", message: "Có lỗi xảy ra" });
    }
  },

  deleteFile: async (req, res) => {
    console.log(res)
    try {
      await Tailieus.findByIdAndDelete(req.query.id)
      let items = await Tailieus.find().sort({ thutu: 1 });
      res.status(200).json(items)
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({ status: "failed", message: "Có lỗi xảy ra" });
    }
  },

  // hàm public dữ liệu cho c08:
 publicThongke: async (req, res) => {
   try {
      let {
        fromDate,
        toDate,
        ageFrom,
        ageTo,
        gioitinh,
        loaixe,
      } = req.query;
      const { filter: demographicFilter, parsed } =
        buildDemographicMongoFilter({
          ageFrom,
          ageTo,
          gioitinh,
          loaixe,
        });

      const range = normalizeThongkeDateRange(fromDate, toDate);
      fromDate = range.fromDate;
      toDate = range.toDateExclusive;

      let options = {
        createdAt: {
          $lte: toDate,
          $gte: fromDate
        }
      } 
      let cuocthis = await Cuocthis.find(options).lean();
      let list_baithi = await LichsuThis
        .find({
          ...options,
          ...demographicFilter,
        })
        .select('socaudung soluongcauhoi thoigianketthuc thoigiannopbai thongtinthisinh.birthday thongtinthisinh.gioitinh thongtinthisinh.loaixe')
        .lean();

      let list_nopbai = list_baithi.filter(i => Boolean(i.thoigiannopbai));
      let total_nopbai = list_nopbai.length;
      const stats = list_nopbai.reduce((acc, current) => {
        const ratio = current.socaudung / current.soluongcauhoi;

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
      });
      res.status(200).json({
        ...stats,
        total_cuocthi: cuocthis.length,
        total: list_baithi.length,
        total_nopbai,
        filterVersion: 1,
        appliedFilters: {
          ageFrom: parsed.ageFrom,
          ageTo: parsed.ageTo,
          gioitinh: parsed.gioitinh,
          loaixe: parsed.loaixe,
        },
      });
  } catch (error) {
    console.log("lỗi publicThongke:", error.message);
    const status = error.status || 500;
    res.status(status).json({
      status: false,
      message:
        status === 400
          ? error.message
          : error.message || "Có lỗi xảy ra khi thống kê công khai",
    });
  }
 },


};
