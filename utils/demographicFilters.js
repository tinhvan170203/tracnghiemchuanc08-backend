const GENDERS = ["Nam", "Nữ"];
const VEHICLE_TYPES = [
  "Ô tô khách",
  "Xe tải",
  "Xe đầu kéo",
  "Xe mô tô",
  "Xe con",
  "Xe gắn máy",
];

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function parseAge(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const age = Number(value);
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    throw badRequest(`${label} phải là số nguyên từ 0 đến 120`);
  }
  return age;
}

function parseChoice(value, choices, label) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (!choices.includes(normalized)) {
    throw badRequest(`${label} không hợp lệ`);
  }
  return normalized;
}

function normalizeDemographicFilters(query = {}, currentYear = new Date().getFullYear()) {
  const ageFrom = parseAge(query.ageFrom, "Tuổi từ");
  const ageTo = parseAge(query.ageTo, "Tuổi đến");
  if (ageFrom !== null && ageTo !== null && ageFrom > ageTo) {
    throw badRequest("Tuổi từ không được lớn hơn tuổi đến");
  }

  const gioitinh = parseChoice(query.gioitinh, GENDERS, "Giới tính");
  const loaixe = parseChoice(query.loaixe, VEHICLE_TYPES, "Loại phương tiện");
  const hasAgeFilter = ageFrom !== null || ageTo !== null;

  return {
    ageFrom,
    ageTo,
    gioitinh,
    loaixe,
    hasAgeFilter,
    birthYearFrom: hasAgeFilter
      ? currentYear - (ageTo === null ? 120 : ageTo)
      : null,
    birthYearTo: hasAgeFilter
      ? currentYear - (ageFrom === null ? 0 : ageFrom)
      : null,
  };
}

function buildDemographicMongoFilter(query = {}, currentYear) {
  const parsed = normalizeDemographicFilters(query, currentYear);
  const filter = {};

  if (parsed.gioitinh) {
    filter["thongtinthisinh.gioitinh"] = parsed.gioitinh;
  }
  if (parsed.loaixe) {
    filter["thongtinthisinh.loaixe"] = parsed.loaixe;
  }
  if (parsed.hasAgeFilter) {
    filter["thongtinthisinh.birthday"] = {
      $regex: /^\d{4}$/,
      $gte: String(parsed.birthYearFrom),
      $lte: String(parsed.birthYearTo),
    };
  }

  return { filter, parsed };
}

function hasDemographicFilters(query = {}) {
  return ["ageFrom", "ageTo", "gioitinh", "loaixe"].some(
    (key) => query[key] !== undefined && query[key] !== null && String(query[key]).trim() !== ""
  );
}

module.exports = {
  GENDERS,
  VEHICLE_TYPES,
  normalizeDemographicFilters,
  buildDemographicMongoFilter,
  hasDemographicFilters,
};
