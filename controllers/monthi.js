const { default: mongoose } = require("mongoose");
const Cauhois = require("../models/CauHoi");
const Cuocthis = require("../models/Cuocthi");
const Chuyendes = require("../models/Chuyende");
const Danhsachthisinhs = require("../models/DanhSachThiSinh");
const Donvis = require("../models/Donvi");
const LichsuThis = require("../models/LichsuThi");
const Monthis = require("../models/Monthi");
const Users = require("../models/User");
const crypto = require('crypto');
const dayjs = require('dayjs');
const ExcelJS = require('exceljs');
const {
  buildDemographicMongoFilter,
} = require("../utils/demographicFilters");
const {
  SYNC_EXPORT_ROW_LIMIT,
  buildCreatedAtFilter,
} = require("../utils/ketquaExport");
const {
  createKetquaExportJob,
  getUserId,
} = require("../services/exportJobWorker");
const { jobPublicView } = require("./exportJob");
const {
  getAllowedMonthiIds,
  isMonthiAllowed,
  isContestSuperAdmin,
  buildCuocthiAccessFilter,
  assertCanAccessCuocthi,
  filterAccessibleCuocthiIds,
} = require("../utils/cuocthiAccess");
const { normalizeThongkeDateRange } = require("../utils/localDay");
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

const decryptData = (encryptedText) => {
  if (encryptedText == null || encryptedText === "") return "";
  const raw = String(encryptedText);
  if (!raw.includes(":")) return raw;
  try {
    const textParts = raw.split(":");
    const iv = Buffer.from(textParts.shift(), "hex");
    const encryptedData = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      process.env.SECRET_KEY,
      iv
    );
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.warn("decryptData:", err.message);
    return raw;
  }
};

function calcXeploai(socaudung, soluongcauhoi) {
  const totalQ = Number(soluongcauhoi) || 1;
  const ratio = Number(socaudung || 0) / totalQ;
  if (ratio < 0.5) return "Không đạt";
  if (ratio < 0.7) return "Trung bình";
  if (ratio < 0.8) return "Khá";
  if (ratio < 0.9) return "Giỏi";
  return "Xuất sắc";
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCautraloisai(questions = []) {
  const wrong = [];
  questions.forEach((q) => {
    const qDoc = q.question;
    if (!qDoc) return;
    const choice = q.choice || "";
    if (choice === qDoc.answer) return;
    wrong.push(stripHtml(qDoc.question || ""));
  });
  return wrong;
}

function formatCautraloisaiText(cautraloisai = []) {
  if (!cautraloisai.length) return "";
  return cautraloisai.map((text, i) => `${i + 1}. ${text}`).join("\r\n");
}

function formatMsDuration(ms) {
  if (!ms || ms < 0) return "";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} phút ${String(s).padStart(2, "0")} giây`;
}

function formatTimestamp(ts) {
  if (!ts) return "";
  return dayjs(Number(ts)).format("DD/MM/YYYY HH:mm:ss");
}

function toExcelRow(item) {
  const tt = item.thongtinthisinh || {};
  return {
    xephang: item.rank,
    tencuocthi: item.tencuocthi || "",
    hoten: tt.name,
    ngaysinh: tt.birthday,
    gioitinh: tt.gioitinh,
    loaixe: tt.loaixe,
    hang_gplx: tt.hang_gplx,
    nghenghiep: tt.nghenghiep,
    diachi: tt.phone + " - " + tt.hokhau,
    phone: tt.donvi,
    socaudung: item.socaudung,
    xeploai: item.xeploai,
    thoigianbatdau: formatTimestamp(item.thoigianbatdau),
    thoigianketthuc: formatTimestamp(item.thoigiannopbai),
    thoigianlambai: formatMsDuration(item.time),
    cautraloisai: formatCautraloisaiText(item.cautraloisai),
  };
}

const EXCEL_HEADERS = [
  "xephang",
  "tencuocthi",
  "hoten",
  "ngaysinh",
  "gioitinh",
  "loaixe",
  "hang_gplx",
  "nghenghiep",
  "diachi",
  "phone",
  "socaudung",
  "xeploai",
  "thoigianbatdau",
  "thoigianketthuc",
  "thoigianlambai",
  "cautraloisai",
];

const EXCEL_ROW_HEIGHT_LIMIT = 2000;

function getExcelColumnDefs() {
  return EXCEL_HEADERS.map((key) => ({
    header: key,
    key,
    width:
      key === "cautraloisai" ? 80 : key === "tencuocthi" || key === "hoten" ? 28 : 16,
  }));
}

function setExcelDownloadHeaders(res, filename) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
}

function applyExcelRowStyle(excelRow, rowNumber, { computeHeight }) {
  excelRow.alignment = { vertical: "top", wrapText: true };
  if (rowNumber === 1 || !computeHeight) return;
  const text = String(excelRow.getCell("cautraloisai").value || "");
  const lineCount = text ? text.split(/\r\n|\n/).length : 1;
  excelRow.height = Math.min(180, Math.max(18, lineCount * 16));
}

/**
 * Stream workbook ra response — không giữ toàn bộ file trong RAM qua writeBuffer.
 */
async function streamKetquaWorkbook(res, rows, { filename }) {
  setExcelDownloadHeaders(res, filename);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("KetQua");
  worksheet.columns = getExcelColumnDefs();

  const computeHeight = rows.length <= EXCEL_ROW_HEIGHT_LIMIT;
  worksheet.getRow(1).font = { bold: true };
  applyExcelRowStyle(worksheet.getRow(1), 1, { computeHeight: false });

  rows.forEach((item) => {
    const excelRow = worksheet.addRow(toExcelRow(item));
    applyExcelRowStyle(excelRow, excelRow.number, { computeHeight });
  });

  await workbook.xlsx.write(res);
  res.end();
}

async function loadKetquaRows(id, query, { includeWrongAnswers = false } = {}) {
  const { tungay, denngay, xeploai, hoten } = query;
  const { filter: demographicFilter } = buildDemographicMongoFilter(query);
  const from = tungay || "1990-01-01";
  const to = denngay || "3010-01-01";
  const xeploaiFilter = xeploai || "";
  const hotenFilter = String(hoten || "").toUpperCase();

  const cuocthi = await Cuocthis.findById(id);
  if (!cuocthi) {
    return { cuocthi: null, rows: [], summary: null, totalLuotthi: 0 };
  }

  let q = LichsuThis.find({
    id_cuocthi: id,
    ...demographicFilter,
  });
  if (includeWrongAnswers) {
    q = q.populate({
      path: "questions.question",
      select: "answer question option_a option_b option_c option_d option_e",
    }).select(
      "questions createdAt socaudung thongtinthisinh thoigianbatdau thoigiannopbai"
    );
  } else {
    q = q.select(
      "createdAt socaudung thongtinthisinh thoigianbatdau thoigiannopbai"
    );
  }

  const list_baithi = await q.lean();

  const totalLuotthi = list_baithi.filter((item) => {
    if (!tungay && !denngay) return true;
    const date = dayjs(item.createdAt).format("YYYY-MM-DD");
    return (
      new Date(date).getTime() >= new Date(from).getTime() &&
      new Date(date).getTime() <= new Date(to).getTime()
    );
  }).length;

  const data = [];
  for (const baithi of list_baithi) {
    try {
      if (!baithi.thoigiannopbai) continue;
      const tt = baithi.thongtinthisinh || {};
      data.push({
        _id: baithi._id,
        time:
          new Date(baithi.thoigiannopbai).getTime() -
          new Date(baithi.thoigianbatdau).getTime(),
        thoigianbatdau: baithi.thoigianbatdau,
        thoigiannopbai: baithi.thoigiannopbai,
        thongtinthisinh: {
          name: decryptData(tt.name),
          donvi: decryptData(tt.donvi),
          phone: decryptData(tt.phone),
          birthday: tt.birthday || "",
          hokhau: tt.hokhau || "",
          gioitinh: tt.gioitinh || "",
          loaixe: tt.loaixe || "",
          hang_gplx: tt.hang_gplx || "",
          nghenghiep: tt.nghenghiep || "",
        },
        socaudung: baithi.socaudung,
        createdAt: baithi.createdAt,
        cautraloisai: includeWrongAnswers
          ? buildCautraloisai(baithi.questions || [])
          : undefined,
      });
    } catch (err) {
      console.warn("bỏ qua bài thi", baithi && baithi._id, err.message);
    }
  }

  data.sort((a, b) => {
    const diemSo = b.socaudung - a.socaudung;
    if (diemSo !== 0) return diemSo;
    return a.time - b.time;
  });

  let rows = data.map((item, index) => ({
    ...item,
    rank: index + 1,
    xeploai: calcXeploai(item.socaudung, cuocthi.soluongcauhoi),
  }));

  rows = rows.filter((item) => {
    const date = dayjs(item.createdAt).format("YYYY-MM-DD");
    return (
      new Date(date).getTime() >= new Date(from).getTime() &&
      new Date(date).getTime() <= new Date(to).getTime() &&
      String(item.xeploai).includes(xeploaiFilter) &&
      String(item.thongtinthisinh.name || "")
        .toUpperCase()
        .includes(hotenFilter)
    );
  });

  const summary = {
    totalLuotthi,
    totalNopbai: rows.length,
    khongdat: 0,
    trungbinh: 0,
    kha: 0,
    gioi: 0,
    xuatsac: 0,
  };
  rows.forEach((item) => {
    if (item.xeploai === "Không đạt") summary.khongdat++;
    else if (item.xeploai === "Trung bình") summary.trungbinh++;
    else if (item.xeploai === "Khá") summary.kha++;
    else if (item.xeploai === "Giỏi") summary.gioi++;
    else if (item.xeploai === "Xuất sắc") summary.xuatsac++;
  });

  return { cuocthi, rows, summary, totalLuotthi };
}

function buildScopedMonthiQuery(user, { tenmonthi = "", mota = "" } = {}) {
  return {
    _id: { $in: getAllowedMonthiIds(user) },
    mota: { $regex: mota || "", $options: "i" },
    tenmonthi: { $regex: tenmonthi || "", $options: "i" },
  };
}

async function findCuocthisScoped(user, extras = {}) {
  const filter = buildCuocthiAccessFilter(user, extras);
  return Cuocthis.find(filter)
    .populate("createdBy", "tentaikhoan")
    .sort({ createdAt: -1 });
}

module.exports = {
  //controller monthi
  getMonthiList: async (req, res) => {
    let perPage = 5;
    let page = Number(req.query.page) || 1;
    let { tenmonthi, mota } = req.query;

    try {
      const filter = buildScopedMonthiQuery(req.user, { tenmonthi, mota });
      let donvisDb = await Monthis.find(filter).sort({ thutu: 1 });

      let tongbanghi = donvisDb.length;
      let total = Math.ceil(donvisDb.length / perPage) || 1;

      let donvis = await Monthis.find(filter)
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
    let { tenmonthi, mota, thutu, link_test, hien_thi_hoctap } = req.body;
    let motaParam = req.body.queryParams.mota;
    let tenmonthiParam = req.body.queryParams.tenmonthi;
    let page = req.body.queryParams.page;
    let perPage = 5;

    try {
      let newItem = new Monthis({
        tenmonthi,
        mota,
        thutu: Number(thutu),
        link_test,
        hien_thi_hoctap: !!hien_thi_hoctap,
      });
      await newItem.save();

      await Users.findByIdAndUpdate(req.user._id, {
        $addToSet: { quantrinhomdonvi: newItem._id },
      });
      const refreshedUser = await Users.findById(req.user._id).populate(
        "quantrinhomdonvi"
      );
      req.user = refreshedUser;

      const filter = buildScopedMonthiQuery(req.user, {
        tenmonthi: tenmonthiParam,
        mota: motaParam,
      });
      let donvisDb = await Monthis.find(filter).sort({ thutu: 1 });

      let tongbanghi = donvisDb.length;
      let total = Math.ceil(donvisDb.length / perPage) || 1;

      let donvis = await Monthis.find(filter)
        .sort({ thutu: 1 })
        .skip((page - 1) * perPage)
        .limit(perPage);

      res.status(200).json({
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
    const id = req.params.id;
    const perPage = 5;
    const page = 1;
    const { tenmonthi, mota } = req.query;

    try {
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          status: "failed",
          message: "Mã kiến thức đánh giá không hợp lệ",
        });
      }

      if (!isMonthiAllowed(req.user, id)) {
        return res.status(403).json({
          status: "failed",
          message: "Tài khoản không được phân quyền kiến thức đánh giá này",
        });
      }

      const monthi = await Monthis.findById(id).select("_id").lean();
      if (!monthi) {
        return res.status(404).json({
          status: "failed",
          message: "Không tìm thấy kiến thức đánh giá cần xóa",
        });
      }

      const [hasChuyende, hasCuocthi] = await Promise.all([
        Chuyendes.exists({ monthi: id }),
        Cuocthis.exists({ monthi: id }),
      ]);

      if (hasChuyende) {
        return res.status(409).json({
          status: "failed",
          code: "RESOURCE_IN_USE",
          message:
            "Không thể xóa kiến thức đánh giá vì vẫn còn chuyên đề thuộc kiến thức này",
        });
      }

      if (hasCuocthi) {
        return res.status(409).json({
          status: "failed",
          code: "RESOURCE_IN_USE",
          message:
            "Không thể xóa kiến thức đánh giá vì vẫn còn cuộc thi sử dụng kiến thức này",
        });
      }

      await Monthis.findByIdAndDelete(id);
      await Users.updateMany(
        { quantrinhomdonvi: id },
        { $pull: { quantrinhomdonvi: id } }
      );

      const refreshedUser = await Users.findById(req.user._id).populate(
        "quantrinhomdonvi"
      );
      req.user = refreshedUser;

      const filter = buildScopedMonthiQuery(req.user, { tenmonthi, mota });
      let donvisDb = await Monthis.find(filter).sort({ thutu: 1 });

      let tongbanghi = donvisDb.length;

      let total = Math.ceil(donvisDb.length / perPage) || 1;
      let donvis = await Monthis.find(filter)
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
      res.status(500).json({
        status: "failed",
        message: "Có lỗi xảy ra khi xóa kiến thức đánh giá",
      });
    }
  },
  editMonthi: async (req, res) => {
    let id = req.params.id;
    const { tenmonthi, mota, thutu, link_test, hien_thi_hoctap } = req.body;
    let page = req.body.queryParams.page;
    let perPage = 5;
    let motaParam = req.body.queryParams.mota;
    let tenmonthiParam = req.body.queryParams.tenmonthi;
    try {
      if (!isMonthiAllowed(req.user, id)) {
        return res.status(403).json({
          status: "failed",
          message: "Tài khoản không được phân quyền kiến thức đánh giá này",
        });
      }

      await Monthis.findByIdAndUpdate(id, {
        tenmonthi,
        mota,
        thutu: Number(thutu),
        link_test,
        hien_thi_hoctap: !!hien_thi_hoctap,
      });
      const filter = buildScopedMonthiQuery(req.user, {
        tenmonthi: tenmonthiParam,
        mota: motaParam,
      });
      let donvis = await Monthis.find(filter)
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
      if (!isMonthiAllowed(req.user, id)) {
        return res.status(403).json({
          status: "failed",
          message: "Tài khoản không được phân quyền kiến thức đánh giá này",
        });
      }
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
      const isAdmin = isContestSuperAdmin(req.user);
      let quantrinhommonthi = req.user.quantrinhomdonvi || [];
      if (isAdmin) {
        quantrinhommonthi = await Monthis.find()
          .select("tenmonthi mota thutu")
          .sort({ thutu: 1 })
          .lean();
      }
      let donviList = [];
      res.status(200).json({
        quantrinhommonthi,
        donviList,
        isContestSuperAdmin: isAdmin,
      });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(501).json({
        status: "failed",
        message: "Có lỗi xảy ra khi lấy thông tin chi tiết môn thi",
      });
    }
  },

  contestScopeOptions: async (req, res) => {
    try {
      const isAdmin = isContestSuperAdmin(req.user);
      let monthiList = req.user.quantrinhomdonvi || [];
      if (isAdmin) {
        monthiList = await Monthis.find()
          .select("tenmonthi thutu")
          .sort({ thutu: 1 })
          .lean();
      }
      let creators = [];
      if (isAdmin) {
        creators = await Users.find()
          .select("tentaikhoan thutu")
          .sort({ thutu: 1, tentaikhoan: 1 })
          .lean();
      }
      return res.status(200).json({
        isContestSuperAdmin: isAdmin,
        monthiList,
        creators,
      });
    } catch (error) {
      console.log("contestScopeOptions:", error.message);
      return res.status(500).json({
        status: "failed",
        message: "Không tải được tùy chọn lọc cuộc đánh giá",
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
      config,
      tongsonguoithamgia,
      canbothamgiatuyentruyen,
    } = req.body;

    let tencuocthiParam = req.body.queryParams.tencuocthi;
    const creatorIds = req.body.queryParams?.creatorIds || req.query.creatorIds;
    try {
      if (!isContestSuperAdmin(req.user) && !isMonthiAllowed(req.user, monthi)) {
        return res.status(403).json({
          status: "failed",
          message: "Tài khoản không được phân quyền kiến thức đánh giá này",
        });
      }

      let newItem = new Cuocthis({
        tencuocthi,
        soluongcauhoi,
        thoigianthi,
        ngaytochucthi,
        password,
        monthi,
        monthiString: monthi,
        config,
        tongsonguoithamgia: Math.max(0, Number(tongsonguoithamgia) || 0),
        canbothamgiatuyentruyen: canbothamgiatuyentruyen,
        createdBy: req.user._id,
      });
      await newItem.save();

      let items = await findCuocthisScoped(req.user, {
        monthiId: monthi,
        tencuocthi: tencuocthiParam || "",
        creatorIds,
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
  getCuocthis: async (req, res) => {
    let { tencuocthi, creatorIds, chuyende } = req.query;
    let id = req.params.id; // id môn thi
    try {
      let items = await findCuocthisScoped(req.user, {
        monthiId: id,
        tencuocthi: tencuocthi || "",
        creatorIds,
        chuyendeId: chuyende,
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

  // update status cuộc thi
  updateStatusCuocthi: async (req, res) => {
    let id1 = req.params.id1; //id1 cuộc thi
    let id = req.params.id; //id môn thi

    let tencuocthiParam = req.body.tencuocthi;
    const creatorIds = req.body.creatorIds || req.query.creatorIds;
    try {
      let item = await Cuocthis.findById(id1);
      assertCanAccessCuocthi(req.user, item);
      item.status = !item.status;
      await item.save()

      let items = await findCuocthisScoped(req.user, {
        monthiId: id,
        tencuocthi: tencuocthiParam || "",
        creatorIds,
      });

      res.status(200).json(items);

    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(error.status || 401)
        .json({
          status: "failed",
          message: error.status === 403 || error.status === 404
            ? error.message
            : "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
        });
    }
  },

  updateOptionCuocthi: async (req, res) => {
    let { tencuocthi, soluongcauhoi, thoigianthi, ngaytochucthi, config, tongsonguoithamgia, canbothamgiatuyentruyen } = req.body;
    let tencuocthiParam = req.body.queryParams.tencuocthi;
    const creatorIds = req.body.queryParams?.creatorIds || req.query.creatorIds;
    let id1 = req.params.id1; //id1 cuộc thi
    let id = req.params.id; //id môn thi
    try {
      const existing = await Cuocthis.findById(id1);
      assertCanAccessCuocthi(req.user, existing);

      await Cuocthis.findByIdAndUpdate(id1, {
        tencuocthi,
        soluongcauhoi, thoigianthi, ngaytochucthi,
        config,
        tongsonguoithamgia: Math.max(0, Number(tongsonguoithamgia) || 0),
        canbothamgiatuyentruyen: canbothamgiatuyentruyen
      });

      let items = await findCuocthisScoped(req.user, {
        monthiId: id,
        tencuocthi: tencuocthiParam || "",
        creatorIds,
      });

      res.status(200).json({ items, message: "Update cấu hình cuộc thi thành công!" });

    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(error.status || 401)
        .json({
          status: "failed",
          message: error.status === 403 || error.status === 404
            ? error.message
            : "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
        });
    }
  },

  //delete cuộc thi sẽ xóa hết thí sinh trong cuộc thi và lịch sử bài thi cửa thí sinh thi đó
  deleteCuocthi: async (req, res) => {
    let id = req.params.id; //id môn thi

    let id1 = req.params.id1; //id cuộc thi cần xóa
    let { tencuocthi, creatorIds } = req.query;
    try {
      const existing = await Cuocthis.findById(id1);
      assertCanAccessCuocthi(req.user, existing);

      await LichsuThis.deleteMany({ id_cuocthi: id1 })

      await Cuocthis.findByIdAndDelete(id1);

      let items = await findCuocthisScoped(req.user, {
        monthiId: id,
        tencuocthi: tencuocthi || "",
        creatorIds,
      });
      res.status(200).json({ message: "Xóa cuộc thi thành công", items })
    } catch (error) {
      console.log("lỗi: ", error.message);
      res
        .status(error.status || 401)
        .json({
          status: "failed",
          message: error.status === 403 || error.status === 404
            ? error.message
            : "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
        });
    }
  },

  assignCuocthiOwner: async (req, res) => {
    const id = req.params.id;
    const id1 = req.params.id1;
    const { userId, tencuocthi, creatorIds } = req.body || {};
    try {
      if (!isContestSuperAdmin(req.user)) {
        return res.status(403).json({
          status: "failed",
          message: "Chỉ tài khoản quản trị tất cả cuộc đánh giá mới được gán chủ sở hữu",
        });
      }
      if (!userId || !mongoose.isValidObjectId(userId)) {
        return res.status(400).json({
          status: "failed",
          message: "Thiếu hoặc sai userId chủ sở hữu",
        });
      }
      const owner = await Users.findById(userId).select("_id tentaikhoan");
      if (!owner) {
        return res.status(404).json({
          status: "failed",
          message: "Không tìm thấy tài khoản được gán",
        });
      }
      const item = await Cuocthis.findById(id1);
      if (!item) {
        return res.status(404).json({
          status: "failed",
          message: "Không tìm thấy cuộc đánh giá",
        });
      }
      item.createdBy = owner._id;
      await item.save();

      const items = await findCuocthisScoped(req.user, {
        monthiId: id,
        tencuocthi: tencuocthi || "",
        creatorIds,
      });
      return res.status(200).json({
        message: `Đã gán chủ sở hữu cho ${owner.tentaikhoan}`,
        items,
      });
    } catch (error) {
      console.log("assignCuocthiOwner:", error.message);
      return res.status(500).json({
        status: "failed",
        message: "Không gán được chủ sở hữu cuộc đánh giá",
      });
    }
  },

  getKetquathi: async (req, res) => {
    const id = req.params.id;
    const {
      tungay,
      denngay,
      xeploai,
      hoten,
      ageFrom,
      ageTo,
      gioitinh,
      loaixe,
      page,
      limit,
    } = req.query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

    try {
      const cuocthiCheck = await Cuocthis.findById(id).select("createdBy monthi").lean();
      assertCanAccessCuocthi(req.user, cuocthiCheck);

      const { cuocthi, rows, summary } = await loadKetquaRows(id, {
        tungay,
        denngay,
        xeploai,
        hoten,
        ageFrom,
        ageTo,
        gioitinh,
        loaixe,
      });

      if (!cuocthi) {
        return res.status(404).json({ message: "Không tìm thấy cuộc thi" });
      }

      const total = rows.length;
      const start = (pageNum - 1) * limitNum;
      const pageData = rows.slice(start, start + limitNum);

      res.status(200).json({
        data: pageData,
        total,
        page: pageNum,
        limit: limitNum,
        cuocthi,
        summary,
      });
    } catch (error) {
      console.log("lỗi getKetquathi: ", error.message);
      res.status(error.status || 500).json({
        status: "failed",
        message:
          error.status === 400 || error.status === 403 || error.status === 404
            ? error.message
            : "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
      });
    }
  },

  exportKetquaExcel: async (req, res) => {
    const id = req.params.id;
    const {
      tungay,
      denngay,
      xeploai,
      hoten,
      ageFrom,
      ageTo,
      gioitinh,
      loaixe,
    } = req.query;

    try {
      const filters = {
        tungay,
        denngay,
        xeploai,
        hoten,
        ageFrom,
        ageTo,
        gioitinh,
        loaixe,
      };

      const cuocthiExists = await Cuocthis.findById(id)
        .select("_id createdBy monthi tencuocthi")
        .lean();
      if (!cuocthiExists) {
        return res.status(404).json({ message: "Không tìm thấy cuộc thi" });
      }
      assertCanAccessCuocthi(req.user, cuocthiExists);

      const { filter: demographicFilter } = buildDemographicMongoFilter(filters);
      const createdAt = buildCreatedAtFilter(tungay, denngay);
      const countFilter = {
        id_cuocthi: id,
        thoigiannopbai: { $gt: 0 },
        ...demographicFilter,
      };
      if (createdAt) countFilter.createdAt = createdAt;
      const submittedCount = await LichsuThis.countDocuments(countFilter);

      if (submittedCount >= SYNC_EXPORT_ROW_LIMIT) {
        const userId = getUserId(req);
        if (!userId) {
          return res.status(401).json({ message: "You are not authenticated" });
        }
        const job = await createKetquaExportJob(userId, "ketqua-one", {
          ...filters,
          ids: [id],
          type: "ketqua-one",
          includeWrongAnswers: true,
        });
        return res.json(jobPublicView(job));
      }

      const { cuocthi, rows } = await loadKetquaRows(id, filters, {
        includeWrongAnswers: true,
      });

      if (!cuocthi) {
        return res.status(404).json({ message: "Không tìm thấy cuộc thi" });
      }

      const namedRows = rows.map((row) => ({
        ...row,
        tencuocthi: cuocthi.tencuocthi || "",
      }));
      const safeName = String(cuocthi.tencuocthi || "cuoc-thi")
        .replace(/[^\w\-]+/g, "_")
        .slice(0, 60);
      const filename = `KetQuaThi_${safeName || "cuoc-thi"}.xlsx`;

      return streamKetquaWorkbook(res, namedRows, { filename });
    } catch (error) {
      console.log("export excel lỗi: ", error.message);
      if (res.headersSent) {
        try {
          res.end();
        } catch (_) {
          /* ignore */
        }
        return;
      }
      return res.status(error.status || 500).json({
        status: "failed",
        message: error.status === 400 || error.status === 403 || error.status === 404
          ? error.message
          : "Không xuất được file Excel",
        jobId: error.jobId,
      });
    }
  },

  exportKetquaExcelNhieu: async (req, res) => {
    const {
      ids,
      tungay,
      denngay,
      xeploai,
      hoten,
      ageFrom,
      ageTo,
      gioitinh,
      loaixe,
      creatorIds,
      chuyende,
      monthi,
    } = req.query;
    let idList = String(ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "You are not authenticated" });
      }

      if (!idList.length) {
        const scoped = await Cuocthis.find(
          buildCuocthiAccessFilter(req.user, {
            monthiId: monthi,
            creatorIds,
            chuyendeId: chuyende,
          })
        )
          .select("_id")
          .lean();
        idList = scoped.map((r) => String(r._id));
      } else {
        idList = await filterAccessibleCuocthiIds(req.user, idList, Cuocthis);
      }

      if (!idList.length) {
        return res.status(400).json({
          status: "failed",
          message: "Không có cuộc đánh giá nào trong phạm vi được phép xuất",
        });
      }

      const job = await createKetquaExportJob(userId, "ketqua-many", {
        ids: idList,
        tungay,
        denngay,
        xeploai,
        hoten,
        ageFrom,
        ageTo,
        gioitinh,
        loaixe,
        type: "ketqua-many",
        includeWrongAnswers: false,
      });
      return res.json(jobPublicView(job));
    } catch (error) {
      console.log("export excel nhiều lỗi: ", error.message);
      return res.status(error.status || 500).json({
        status: "failed",
        message: error.message || "Không xuất được file Excel",
        jobId: error.jobId,
      });
    }
  },

  thongKeCauHoiSai: async (req, res) => {
    let { idCuocThi, ageFrom, ageTo, gioitinh, loaixe } = req.query;
    try {
     const cuocthiCheck = await Cuocthis.findById(idCuocThi)
       .select("createdBy monthi")
       .lean();
     assertCanAccessCuocthi(req.user, cuocthiCheck);

     const { filter: demographicFilter } = buildDemographicMongoFilter({
       ageFrom,
       ageTo,
       gioitinh,
       loaixe,
     });
     const result = await LichsuThis.aggregate([
  {
    $match: {
      id_cuocthi: new mongoose.Types.ObjectId(idCuocThi),
      thoigiannopbai: { $gt: 0 },
      ...demographicFilter,
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
        .status(error.status || 401)
        .json({
          status: "failed",
          message:
            error.status === 400
              ? error.message
              : "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
        });
    }
  },

  /**
   * Top 15 câu hay sai, gom nhiều cuộc thi.
   * Scope theo quyền cuộc (createdBy / Admin filters).
   */
  thongKeCauHoiSaiTongHop: async (req, res) => {
    let { monthi, chuyende, fromDate, toDate, creatorIds } = req.query;
    try {
      const cuocthiQuery = buildCuocthiAccessFilter(req.user, {
        monthiId: monthi,
        creatorIds,
        // chuyende lọc ở pipeline cauhoi; optional cũng lọc cuộc có config chuyende
        chuyendeId: undefined,
      });

      const cuocthiIds = await Cuocthis.find(cuocthiQuery).distinct("_id");
      if (cuocthiIds.length === 0) {
        return res.status(200).json({ items: [], totalAttempts: 0 });
      }

      if (!fromDate) fromDate = "1990-01-01";
      if (!toDate) toDate = "3000-01-01";
      const end = new Date(toDate);
      end.setDate(end.getDate() + 1);
      const toDateExclusive = end.toISOString().split("T")[0];

      const matchLichsu = {
        id_cuocthi: { $in: cuocthiIds },
        thoigiannopbai: { $gt: 0 },
        createdAt: {
          $gte: new Date(fromDate),
          $lt: new Date(toDateExclusive),
        },
      };

      const pipeline = [
        { $match: matchLichsu },
        { $project: { _id: 0, questions: { question: 1, choice: 1 } } },
        { $unwind: "$questions" },
        {
          $group: {
            _id: {
              q: "$questions.question",
              choice: { $ifNull: ["$questions.choice", false] },
            },
            n: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: "$_id.q",
            tong_luot_lam: { $sum: "$n" },
            buckets: { $push: { choice: "$_id.choice", n: "$n" } },
          },
        },
        {
          $lookup: {
            from: "cauhois",
            let: { qid: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$qid"] } } },
              { $project: { answer: 1, chuyende: 1 } },
            ],
            as: "meta",
          },
        },
        { $set: { meta: { $first: "$meta" } } },
        { $match: { meta: { $ne: null } } },
      ];

      if (chuyende) {
        pipeline.push({
          $match: {
            "meta.chuyende": new mongoose.Types.ObjectId(chuyende),
          },
        });
      }

      pipeline.push(
        {
          $set: {
            so_luot_khong_tra_loi: {
              $reduce: {
                input: "$buckets",
                initialValue: 0,
                in: {
                  $add: [
                    "$$value",
                    {
                      $cond: [
                        { $in: ["$$this.choice", [false, null, ""]] },
                        "$$this.n",
                        0,
                      ],
                    },
                  ],
                },
              },
            },
            so_luot_sai: {
              $reduce: {
                input: "$buckets",
                initialValue: 0,
                in: {
                  $add: [
                    "$$value",
                    {
                      $cond: [
                        {
                          $and: [
                            { $not: { $in: ["$$this.choice", [false, null, ""]] } },
                            { $ne: ["$$this.choice", "$meta.answer"] },
                          ],
                        },
                        "$$this.n",
                        0,
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
        {
          $set: {
            so_luot_da_tra_loi: {
              $subtract: ["$tong_luot_lam", "$so_luot_khong_tra_loi"],
            },
          },
        },
        {
          $set: {
            ti_le_sai: {
              $cond: [
                { $eq: ["$so_luot_da_tra_loi", 0] },
                0,
                {
                  $round: [
                    {
                      $multiply: [
                        { $divide: ["$so_luot_sai", "$so_luot_da_tra_loi"] },
                        100,
                      ],
                    },
                    2,
                  ],
                },
              ],
            },
          },
        },
        { $sort: { so_luot_sai: -1, ti_le_sai: -1 } },
        { $limit: 15 },
        {
          $lookup: {
            from: "cauhois",
            let: { qid: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$qid"] } } },
              {
                $project: {
                  question: 1,
                  image: 1,
                  chuyendeString: 1,
                  option_a: 1,
                  option_b: 1,
                  option_c: 1,
                  option_d: 1,
                  option_e: 1,
                  answer: 1,
                },
              },
            ],
            as: "cauhoi",
          },
        },
        {
          $replaceRoot: {
            newRoot: {
              $mergeObjects: [
                { $ifNull: [{ $first: "$cauhoi" }, {}] },
                {
                  _id: "$_id",
                  tong_luot_lam: "$tong_luot_lam",
                  so_luot_sai: "$so_luot_sai",
                  so_luot_khong_tra_loi: "$so_luot_khong_tra_loi",
                  so_luot_da_tra_loi: "$so_luot_da_tra_loi",
                  ti_le_sai: "$ti_le_sai",
                },
              ],
            },
          },
        }
      );

      const [totalAttempts, items] = await Promise.all([
        LichsuThis.countDocuments(matchLichsu),
        LichsuThis.aggregate(pipeline).allowDiskUse(true),
      ]);
      return res.status(200).json({ items, totalAttempts });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(401).json({
        status: "failed",
        message: "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
      });
    }
  },

  thongke: async (req, res) => {
    try {
      let {
        fromDate,
        toDate,
        monthi,
        ageFrom,
        ageTo,
        gioitinh,
        loaixe,
        creatorIds,
        chuyende,
      } = req.query;
      const { filter: demographicFilter } = buildDemographicMongoFilter({
        ageFrom,
        ageTo,
        gioitinh,
        loaixe,
      });
      const emptyStats = {
        total_khongdat: 0,
        total_trungbinh: 0,
        total_kha: 0,
        total_gioi: 0,
        total_xuatsac: 0,
        total_nopbai: 0,
        total: 0,
        total_cuocthi: 0,
      };

      if (!isContestSuperAdmin(req.user) && getAllowedMonthiIds(req.user).length === 0) {
        return res.status(200).json(emptyStats);
      }

      const range = normalizeThongkeDateRange(fromDate, toDate);
      fromDate = range.fromDate;
      const toDateExclusive = range.toDateExclusive;

      const accessFilter = buildCuocthiAccessFilter(req.user, {
        monthiId: monthi,
        creatorIds,
        chuyendeId: chuyende,
      });

      // Tổng số cuộc: theo ngày tạo cuộc
      const total_cuocthi = await Cuocthis.countDocuments({
        ...accessFilter,
        createdAt: {
          $gte: fromDate,
          $lte: toDateExclusive,
        },
      });

      // Lượt thi / nộp bài: theo ngày tạo bài thi (LichsuThi.createdAt)
      const accessibleIds = await Cuocthis.find(accessFilter).distinct("_id");
      if (!accessibleIds.length) {
        return res.status(200).json(emptyStats);
      }

      const list_baithi = await LichsuThis.find({
        id_cuocthi: { $in: accessibleIds },
        createdAt: {
          $gte: fromDate,
          $lte: toDateExclusive,
        },
        ...demographicFilter,
      })
        .select(
          "socaudung createdAt soluongcauhoi thoigianketthuc thoigiannopbai thongtinthisinh.birthday thongtinthisinh.gioitinh thongtinthisinh.loaixe"
        )
        .lean();

      const list_nopbai = list_baithi.filter((i) => Boolean(i.thoigiannopbai));
      const total_nopbai = list_nopbai.length;
      const stats = list_nopbai.reduce(
        (acc, current) => {
          const ratio = current.socaudung / current.soluongcauhoi;

          if (ratio < 0.5) acc.total_khongdat++;
          else if (ratio < 0.7) acc.total_trungbinh++;
          else if (ratio < 0.8) acc.total_kha++;
          else if (ratio < 0.9) acc.total_gioi++;
          else acc.total_xuatsac++;

          return acc;
        },
        {
          total_khongdat: 0,
          total_trungbinh: 0,
          total_kha: 0,
          total_gioi: 0,
          total_xuatsac: 0,
        }
      );
      res.status(200).json({
        ...stats,
        total: list_baithi.length,
        total_nopbai,
        total_cuocthi,
      });
    } catch (error) {
      console.log("lỗi: ", error.message);
      res.status(error.status || 401).json({
        status: "failed",
        message:
          error.status === 400
            ? error.message
            : "Có lỗi xảy ra khi phía máy chủ. Liên hệ Admin",
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
