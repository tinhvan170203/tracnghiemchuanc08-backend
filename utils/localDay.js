/**
 * Parse yyyy-mm-dd as local calendar day (tránh lệch UTC từ Date.parse).
 * @param {string} dateStr
 * @param {boolean} endOfDay
 * @returns {Date|null}
 */
function parseLocalDay(dateStr, endOfDay = false) {
  if (dateStr === undefined || dateStr === null || String(dateStr).trim() === "") {
    return null;
  }
  const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const date = endOfDay
    ? new Date(y, mo, day, 23, 59, 59, 999)
    : new Date(y, mo, day, 0, 0, 0, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatLocalYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Chuẩn hóa khoảng ngày thống kê public/hub.
 * - Thiếu ngày: default rộng (giống monthi.thongke)
 * - Sai định dạng: ném Error status 400
 * - toDateExclusive: ngày kế tiếp (để $lte string yyyy-mm-dd bao hết ngày toDate)
 */
function normalizeThongkeDateRange(fromDate, toDate) {
  let from = String(fromDate || "").trim();
  let to = String(toDate || "").trim();

  if (!from) from = "1990-01-01";
  if (!to) to = "3000-01-01";

  const fromDay = parseLocalDay(from, false);
  const toDay = parseLocalDay(to, false);
  if (!fromDay || !toDay) {
    const error = new Error(
      "fromDate/toDate phải có dạng yyyy-mm-dd (ví dụ: 2026-01-01)"
    );
    error.status = 400;
    throw error;
  }
  if (fromDay.getTime() > toDay.getTime()) {
    const error = new Error("fromDate không được lớn hơn toDate");
    error.status = 400;
    throw error;
  }

  const exclusive = new Date(toDay);
  exclusive.setDate(exclusive.getDate() + 1);

  return {
    fromDate: formatLocalYmd(fromDay),
    toDate: formatLocalYmd(toDay),
    toDateExclusive: formatLocalYmd(exclusive),
  };
}

module.exports = {
  parseLocalDay,
  formatLocalYmd,
  normalizeThongkeDateRange,
};
