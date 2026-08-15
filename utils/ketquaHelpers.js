const dayjs = require("dayjs");

function optionText(questionDoc, key) {
  if (!key) return "(không chọn)";
  if (!questionDoc) return String(key);
  return questionDoc[key] || String(key);
}

function calcXeploai(socaudung, soluongcauhoi) {
  const total = Number(soluongcauhoi) || 1;
  const ratio = Number(socaudung || 0) / total;
  if (ratio < 0.5) return "Không đạt";
  if (ratio < 0.7) return "Trung bình";
  if (ratio < 0.8) return "Khá";
  if (ratio < 0.9) return "Giỏi";
  return "Xuất sắc";
}

function buildCautraloisai(questions = []) {
  const wrong = [];
  questions.forEach((q) => {
    const qDoc = q.question;
    if (!qDoc) return;
    const choice = q.choice || "";
    if (choice === qDoc.answer) return;
    wrong.push({
      noidung: qDoc.question || "",
      dapanchon: optionText(qDoc, choice),
      dapandung: optionText(qDoc, qDoc.answer),
    });
  });
  return wrong;
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCautraloisaiText(cautraloisai = []) {
  if (!cautraloisai.length) return "";
  return cautraloisai
    .map((c, i) => `${i + 1}. ${stripHtml(c.noidung)}`)
    .join("\r\n");
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

/**
 * Build ranked/filtered ketqua rows from lean baithi docs + cuocthi.
 * decryptData(fn) must decrypt encrypted PII fields.
 */
function buildKetquaRows(list_baithi, cuocthi, decryptData, filters = {}) {
  const {
    tungay = "1990-01-01",
    denngay = "3010-01-01",
    xeploai = "",
    hoten = "",
  } = filters;

  const safeDecrypt = (value) => {
    try {
      if (value == null || value === "") return "";
      if (typeof decryptData !== "function") return String(value);
      return decryptData(value);
    } catch (err) {
      console.warn("bỏ qua decrypt PII:", err.message);
      return String(value);
    }
  };

  let data = [];

  for (const baithi of list_baithi) {
    try {
      if (!baithi.thoigiannopbai) continue;

      const time =
        new Date(baithi.thoigiannopbai).getTime() -
        new Date(baithi.thoigianbatdau).getTime();

      const tt = baithi.thongtinthisinh || {};
      const thongtinthisinh = {
        name: safeDecrypt(tt.name),
        phone: safeDecrypt(tt.phone),
        donvi: safeDecrypt(tt.donvi),
        birthday: tt.birthday || "",
        hokhau: tt.hokhau || "",
        gioitinh: tt.gioitinh || "",
        loaixe: tt.loaixe || "",
        hang_gplx: tt.hang_gplx || "",
        nghenghiep: tt.nghenghiep || "",
      };

      const cautraloisai = buildCautraloisai(baithi.questions || []);

      data.push({
        _id: baithi._id,
        time,
        thoigianbatdau: baithi.thoigianbatdau,
        thoigiannopbai: baithi.thoigiannopbai,
        thongtinthisinh,
        socaudung: baithi.socaudung,
        createdAt: baithi.createdAt,
        cautraloisai,
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

  let dataWithRank = data.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));

  dataWithRank = dataWithRank
    .filter((item) => {
      const date = dayjs(item.createdAt).format("YYYY-MM-DD");
      return (
        new Date(date).getTime() >= new Date(tungay).getTime() &&
        new Date(date).getTime() <= new Date(denngay).getTime()
      );
    })
    .map((i) => ({
      ...i,
      xeploai: calcXeploai(i.socaudung, cuocthi?.soluongcauhoi),
    }))
    .filter(
      (i) =>
        i.xeploai.includes(xeploai || "") &&
        String(i.thongtinthisinh.name || "")
          .toUpperCase()
          .includes(String(hoten || "").toUpperCase())
    );

  const summary = {
    totalNopbai: dataWithRank.length,
    khongdat: 0,
    trungbinh: 0,
    kha: 0,
    gioi: 0,
    xuatsac: 0,
  };
  dataWithRank.forEach((item) => {
    if (item.xeploai === "Không đạt") summary.khongdat++;
    else if (item.xeploai === "Trung bình") summary.trungbinh++;
    else if (item.xeploai === "Khá") summary.kha++;
    else if (item.xeploai === "Giỏi") summary.gioi++;
    else if (item.xeploai === "Xuất sắc") summary.xuatsac++;
  });

  return { rows: dataWithRank, summary };
}

function toExcelRow(item) {
  const tt = item.thongtinthisinh || {};
  return {
    xephang: item.rank,
    hoten: tt.name,
    ngaysinh: tt.birthday,
    gioitinh: tt.gioitinh,
    loaixe: tt.loaixe,
    hang_gplx: tt.hang_gplx,
    nghenghiep: tt.nghenghiep,
    donvi: tt.phone,
    phone: tt.donvi,
    socaudung: item.socaudung,
    xeploai: item.xeploai,
    thoigianbatdau: formatTimestamp(item.thoigianbatdau),
    thoigianketthuc: formatTimestamp(item.thoigiannopbai),
    thoigianlambai: formatMsDuration(item.time),
    cautraloisai: formatCautraloisaiText(item.cautraloisai),
  };
}

module.exports = {
  buildKetquaRows,
  toExcelRow,
  calcXeploai,
  formatCautraloisaiText,
  formatMsDuration,
  formatTimestamp,
};
