/**
 * MODULE BÁO CÁO — Bản đồ backend (theo dõi / kiểm soát)
 *
 * Thư mục này + routes/baoCao.js + controllers/baoCao/ tách khỏi mon-thi.
 *
 * Models:
 *   ReportTemplate.js      Biểu mẫu chung (sections/fields)
 *   ReportPeriod.js        Kỳ báo cáo + schemaSnapshot + assignees
 *   ReportSubmission.js    Phiếu 1 đơn vị × 1 kỳ
 *   Notification.js        Chuông in-app (BaoCaoNotifications)
 *   seedBmTemplate.js      Seed từ Excel BM chiến dịch lái xe
 *
 * API base: /api/bao-cao  (đăng ký trong backend/index.js)
 *
 * G1: CRUD template/kỳ, nhập, trạng thái, SUM số, thông báo khi mở kỳ
 * G2: xuất Excel / zip nhiều kỳ, public /sumary/bao-cao
 * G3: sync kỳ mới nhất từ C08, fan-out tổng hợp toàn quốc
 *
 * Phân quyền sở hữu: utils/baoCaoAccess.js — role "quản trị tất cả báo cáo"
 * xem toàn bộ; tài khoản cấu hình/tạo chỉ thấy createdBy = mình.
 */
module.exports = {};
