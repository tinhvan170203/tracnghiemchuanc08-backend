const mongoose = require("mongoose");

const CONTEST_SUPER_ADMIN_ROLE = "quản trị tất cả cuộc đánh giá";

function getAllowedMonthiIds(user) {
  return (user?.quantrinhomdonvi || [])
    .map((i) => (i && (i._id || i)))
    .filter(Boolean);
}

function isMonthiAllowed(user, monthiId) {
  if (!monthiId) return false;
  const idStr = String(monthiId);
  return getAllowedMonthiIds(user).some((id) => String(id) === idStr);
}

function isContestSuperAdmin(user) {
  return (
    Array.isArray(user?.roles) && user.roles.includes(CONTEST_SUPER_ADMIN_ROLE)
  );
}

function toObjectIdOrNull(value) {
  if (value == null || value === "") return null;
  const raw = value && value._id ? value._id : value;
  if (!mongoose.isValidObjectId(raw)) return null;
  return new mongoose.Types.ObjectId(String(raw));
}

function parseCreatorIds(raw) {
  if (raw == null || raw === "") return [];
  const list = Array.isArray(raw)
    ? raw
    : String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  return list.map(toObjectIdOrNull).filter(Boolean);
}

/**
 * Mongo filter for Cuocthis theo quyền người dùng.
 * Non-admin: chỉ cuộc mình tạo + trong kiến thức được phân quyền.
 * Admin: toàn hệ thống; có thể lọc creatorIds / monthi / chuyende.
 */
function buildCuocthiAccessFilter(
  user,
  { monthiId, creatorIds, chuyendeId, tencuocthi } = {}
) {
  const filter = {};
  // Loại document bài thi import nhầm vào collection cuộc
  filter.thongtinthisinh = { $exists: false };

  if (tencuocthi != null && String(tencuocthi).trim() !== "") {
    filter.tencuocthi = {
      $regex: String(tencuocthi).trim(),
      $options: "i",
    };
  }

  const chuyendeOid = toObjectIdOrNull(chuyendeId);
  if (chuyendeOid) {
    filter["config.chuyende"] = chuyendeOid;
  }

  if (isContestSuperAdmin(user)) {
    const monthiOid = toObjectIdOrNull(monthiId);
    if (monthiOid) filter.monthi = monthiOid;

    const creators = parseCreatorIds(creatorIds);
    if (creators.length) {
      filter.createdBy = { $in: creators };
    }
    return filter;
  }

  const allowed = getAllowedMonthiIds(user);
  if (!allowed.length) {
    filter._id = { $in: [] };
    return filter;
  }

  const monthiOid = toObjectIdOrNull(monthiId);
  if (monthiOid) {
    if (!isMonthiAllowed(user, monthiOid)) {
      filter._id = { $in: [] };
      return filter;
    }
    filter.monthi = monthiOid;
  } else {
    filter.monthi = { $in: allowed };
  }

  filter.createdBy = user._id;
  return filter;
}

function canAccessCuocthi(user, cuocthi) {
  if (!cuocthi) return false;
  if (isContestSuperAdmin(user)) return true;

  const ownerId = cuocthi.createdBy && (cuocthi.createdBy._id || cuocthi.createdBy);
  if (!ownerId) return false;
  if (String(ownerId) !== String(user._id)) return false;
  return isMonthiAllowed(user, cuocthi.monthi && (cuocthi.monthi._id || cuocthi.monthi));
}

function assertCanAccessCuocthi(user, cuocthi) {
  if (!cuocthi) {
    const err = new Error("Không tìm thấy cuộc đánh giá");
    err.status = 404;
    throw err;
  }
  if (!canAccessCuocthi(user, cuocthi)) {
    const err = new Error("Không có quyền truy cập cuộc đánh giá này");
    err.status = 403;
    throw err;
  }
}

/** Lọc danh sách id cuộc theo quyền; bỏ id ngoài scope. */
async function filterAccessibleCuocthiIds(user, ids, Cuocthis) {
  const idList = (Array.isArray(ids) ? ids : [])
    .map((id) => String(id).trim())
    .filter((id) => mongoose.isValidObjectId(id));
  if (!idList.length) return [];

  const access = buildCuocthiAccessFilter(user);
  const rows = await Cuocthis.find({
    ...access,
    _id: { $in: idList },
  })
    .select("_id")
    .lean();
  return rows.map((r) => String(r._id));
}

module.exports = {
  CONTEST_SUPER_ADMIN_ROLE,
  getAllowedMonthiIds,
  isMonthiAllowed,
  isContestSuperAdmin,
  parseCreatorIds,
  toObjectIdOrNull,
  buildCuocthiAccessFilter,
  canAccessCuocthi,
  assertCanAccessCuocthi,
  filterAccessibleCuocthiIds,
};
