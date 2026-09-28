/**
 * MODULE BÁO CÁO — Routes riêng mount tại /api/bao-cao (xem backend/index.js).
 * Quyền: cấu hình biểu mẫu / CRUD báo cáo / nhập / trạng thái / tổng hợp.
 * Giai đoạn sau (G2/G3): Excel zip, public sumary, sync C08 — thêm route tại đây, không lẫn mon-thi.
 */
const express = require("express");
const router = express.Router();
const baoCao = require("../controllers/baoCao");
const checkRole = require("../middlewares/checkRole");
const middlewareController = require("../middlewares/verifyToken");

const auth = middlewareController.verifyToken;

// ----- Biểu mẫu (ReportTemplate) -----
router.get(
  "/templates",
  auth,
  checkRole(["xem báo cáo", "cấu hình biểu mẫu báo cáo"]),
  baoCao.listTemplates
);
router.get(
  "/templates/:id",
  auth,
  checkRole(["xem báo cáo", "cấu hình biểu mẫu báo cáo"]),
  baoCao.getTemplate
);
router.post(
  "/templates",
  auth,
  checkRole("cấu hình biểu mẫu báo cáo"),
  baoCao.createTemplate
);
router.post(
  "/templates/seed-bm",
  auth,
  checkRole("cấu hình biểu mẫu báo cáo"),
  baoCao.seedBmTemplate
);
router.post(
  "/templates/:id/clone",
  auth,
  checkRole("cấu hình biểu mẫu báo cáo"),
  baoCao.cloneTemplate
);
router.put(
  "/templates/:id",
  auth,
  checkRole("cấu hình biểu mẫu báo cáo"),
  baoCao.updateTemplate
);
router.delete(
  "/templates/:id",
  auth,
  checkRole("cấu hình biểu mẫu báo cáo"),
  baoCao.deleteTemplate
);

// ----- Kỳ báo cáo (ReportPeriod) -----
router.get(
  "/periods",
  auth,
  checkRole([
    "xem báo cáo",
    "cấu hình biểu mẫu báo cáo",
    "xem trạng thái nộp báo cáo",
    "nhập báo cáo",
  ]),
  baoCao.listPeriods
);
router.get(
  "/periods/:id",
  auth,
  checkRole([
    "xem báo cáo",
    "cấu hình biểu mẫu báo cáo",
    "xem trạng thái nộp báo cáo",
    "nhập báo cáo",
  ]),
  baoCao.getPeriod
);
router.post(
  "/periods",
  auth,
  checkRole(["thêm báo cáo", "cấu hình biểu mẫu báo cáo"]),
  baoCao.createPeriod
);
router.put(
  "/periods/:id",
  auth,
  checkRole(["sửa báo cáo", "cấu hình biểu mẫu báo cáo"]),
  baoCao.updatePeriod
);
router.post(
  "/periods/:id/open",
  auth,
  checkRole(["sửa báo cáo", "cấu hình biểu mẫu báo cáo"]),
  baoCao.openPeriod
);
router.post(
  "/periods/:id/close",
  auth,
  checkRole(["sửa báo cáo", "cấu hình biểu mẫu báo cáo"]),
  baoCao.closePeriod
);
router.delete(
  "/periods/:id",
  auth,
  checkRole(["xóa báo cáo", "cấu hình biểu mẫu báo cáo"]),
  baoCao.deletePeriod
);
router.get(
  "/periods/:periodId/submissions",
  auth,
  checkRole(["xem trạng thái nộp báo cáo", "xem báo cáo", "tổng hợp báo cáo"]),
  baoCao.listSubmissionsByPeriod
);
router.get(
  "/periods/:periodId/submissions/:userId",
  auth,
  checkRole(["xem trạng thái nộp báo cáo", "xem báo cáo", "tổng hợp báo cáo"]),
  baoCao.getSubmissionByUser
);
router.get(
  "/periods/:periodId/aggregate",
  auth,
  checkRole(["tổng hợp báo cáo", "xem báo cáo"]),
  baoCao.aggregatePeriod
);
router.get(
  "/compare",
  auth,
  checkRole(["tổng hợp báo cáo", "xem báo cáo"]),
  baoCao.comparePeriods
);

// ----- Báo cáo của tôi (tài khoản xã — quyền nhập báo cáo) -----
router.get("/my/assignments", auth, checkRole("nhập báo cáo"), baoCao.listMyAssignments);
router.get(
  "/my/periods/:periodId",
  auth,
  checkRole("nhập báo cáo"),
  baoCao.getMySubmission
);
router.put(
  "/my/periods/:periodId",
  auth,
  checkRole("nhập báo cáo"),
  baoCao.saveMySubmission
);
router.post(
  "/my/periods/:periodId/submit",
  auth,
  checkRole("nhập báo cáo"),
  baoCao.submitMySubmission
);

// ----- Thông báo in-app (user đã login) -----
router.get("/notifications", auth, baoCao.listMyNotifications);
router.post("/notifications/:id/read", auth, baoCao.markNotificationRead);
router.post("/notifications/read-all", auth, baoCao.markAllNotificationsRead);

// ----- Chọn user để gán assignee khi tạo kỳ -----
router.get(
  "/assignee-users",
  auth,
  checkRole(["cấu hình biểu mẫu báo cáo", "sửa báo cáo", "thêm báo cáo"]),
  baoCao.listUsersForAssignee
);

module.exports = router;
