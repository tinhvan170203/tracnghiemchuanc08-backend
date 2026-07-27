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
  allowedExts: [".pdf", ".docx", ".txt, .xlsx"],
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
  checkRole("xem cuộc thi"),
  knowledgeController.list
);

router.post(
  "/upload",
  middlewareController.verifyToken,
  checkRole("xem cuộc thi"),
  uploadMw,
  knowledgeController.upload
);

router.delete(
  "/:id",
  middlewareController.verifyToken,
  checkRole("xem cuộc thi"),
  knowledgeController.remove
);

module.exports = router;
