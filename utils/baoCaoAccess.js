/**
 * Phân quyền sở hữu biểu mẫu / kỳ báo cáo.
 * Giống cuocthiAccess: super admin xem hết; còn lại chỉ createdBy = mình.
 */
const mongoose = require("mongoose");

const BAOCAO_SUPER_ADMIN_ROLE = "quản trị tất cả báo cáo";

function isBaoCaoSuperAdmin(user) {
  return (
    Array.isArray(user?.roles) && user.roles.includes(BAOCAO_SUPER_ADMIN_ROLE)
  );
}

function toObjectIdOrNull(value) {
  if (value == null || value === "") return null;
  const raw = value && value._id ? value._id : value;
  if (!mongoose.isValidObjectId(raw)) return null;
  return new mongoose.Types.ObjectId(String(raw));
}

/** Filter list template/period theo quyền. */
function buildBaoCaoOwnerFilter(user) {
  if (isBaoCaoSuperAdmin(user)) return {};
  const uid = toObjectIdOrNull(user?._id);
  if (!uid) return { _id: { $in: [] } };
  return { createdBy: uid };
}

function ownerIdOf(doc) {
  if (!doc) return null;
  const raw = doc.createdBy && (doc.createdBy._id || doc.createdBy);
  return raw ? String(raw) : null;
}

function canAccessBaoCaoOwned(user, doc) {
  if (!doc) return false;
  if (isBaoCaoSuperAdmin(user)) return true;
  const ownerId = ownerIdOf(doc);
  if (!ownerId) return false;
  return String(ownerId) === String(user._id);
}

function assertCanAccessBaoCaoOwned(user, doc, label = "tài nguyên báo cáo") {
  if (!doc) {
    const err = new Error(`Không tìm thấy ${label}`);
    err.status = 404;
    throw err;
  }
  if (!canAccessBaoCaoOwned(user, doc)) {
    const err = new Error(`Không có quyền truy cập ${label} này`);
    err.status = 403;
    throw err;
  }
}

function isPeriodAssignee(user, period) {
  const uid = String(user?._id || "");
  if (!uid) return false;
  return (period?.assignees || []).some(
    (a) => a.userId && String(a.userId._id || a.userId) === uid
  );
}

/** Đọc kỳ: owner/super hoặc được giao assignee (không dùng cho list admin). */
function canReadPeriod(user, period) {
  if (canAccessBaoCaoOwned(user, period)) return true;
  return isPeriodAssignee(user, period);
}

function assertCanReadPeriod(user, period) {
  if (!period) {
    const err = new Error("Không tìm thấy kỳ báo cáo");
    err.status = 404;
    throw err;
  }
  if (!canReadPeriod(user, period)) {
    const err = new Error("Không có quyền truy cập kỳ báo cáo này");
    err.status = 403;
    throw err;
  }
}

function assertCanManagePeriod(user, period) {
  assertCanAccessBaoCaoOwned(user, period, "kỳ báo cáo");
}

function assertCanManageTemplate(user, template) {
  assertCanAccessBaoCaoOwned(user, template, "biểu mẫu");
}

module.exports = {
  BAOCAO_SUPER_ADMIN_ROLE,
  isBaoCaoSuperAdmin,
  toObjectIdOrNull,
  buildBaoCaoOwnerFilter,
  canAccessBaoCaoOwned,
  assertCanAccessBaoCaoOwned,
  isPeriodAssignee,
  canReadPeriod,
  assertCanReadPeriod,
  assertCanManagePeriod,
  assertCanManageTemplate,
};
