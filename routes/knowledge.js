const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const middlewareController = require("../middlewares/verifyToken");
const checkRole = require("../middlewares/checkRole");
const knowledgeController = require("../controllers/knowledge");
const { createUploader, handleMulterError } = require("../utils/upload");
const { KNOWLEDGE_DIR, ensureKnowledgeDir } = require("../controllers/knowledge");

ensureKnowledgeDir();

const knowledgeUpload = createUploader({
  destDir: KNOWLEDGE_DIR,
  allowedExts: [".pdf", ".docx", ".txt", ".xlsx"],
  allowedMimes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "application/octet-stream",
  ],
  maxFileSize: 20 * 1024 * 1024,
});

const uploadMw = (req, res, next) => {
  knowledgeUpload.single("file")(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    return next();
  });
};

router.get(
  "/",
  middlewareController.verifyToken,
  checkRole("xem tài liệu AI"),
  knowledgeController.list
);

router.post(
  "/upload",
  middlewareController.verifyToken,
  checkRole("thêm tài liệu AI"),
  uploadMw,
  knowledgeController.upload
);

router.post(
  "/:id/reprocess",
  middlewareController.verifyToken,
  checkRole("thêm tài liệu AI"),
  knowledgeController.reprocess
);

router.delete(
  "/:id",
  middlewareController.verifyToken,
  checkRole("xóa tài liệu AI"),
  knowledgeController.remove
);

module.exports = router;
