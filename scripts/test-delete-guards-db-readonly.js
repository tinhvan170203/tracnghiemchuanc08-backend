/**
 * Read-only integration check against configured MongoDB.
 * It invokes only blocked delete branches and verifies records remain intact.
 */
require("dotenv").config();
const assert = require("assert");
const mongoose = require("mongoose");
const connectDB = require("../connectDB");
const Monthis = require("../models/Monthi");
const Chuyendes = require("../models/Chuyende");
const Cauhois = require("../models/CauHoi");
const LichsuThis = require("../models/LichsuThi");
const monthiController = require("../controllers/monthi");
const chuyendeController = require("../controllers/chuyende");
const cauhoiController = require("../controllers/cauhoi");

function responseRecorder() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
}

async function invoke(handler, req) {
  const res = responseRecorder();
  await handler(req, res);
  return res.result;
}

async function main() {
  await connectDB();
  assert.strictEqual(mongoose.connection.readyState, 1, "MongoDB must be connected");

  const history = await LichsuThis.findOne({
    "questions.0": { $exists: true },
  })
    .select("_id questions.question")
    .lean();

  if (!history) {
    console.log("delete-guards-db-readonly: SKIP (không có lịch sử chứa câu hỏi)");
    return;
  }

  const questionIds = history.questions
    .map((item) => item.question)
    .filter(Boolean);
  const question = await Cauhois.findOne({ _id: { $in: questionIds } })
    .select("_id chuyende")
    .lean();
  const topic = question
    ? await Chuyendes.findById(question.chuyende).select("_id monthi").lean()
    : null;
  const knowledge = topic
    ? await Monthis.findById(topic.monthi).select("_id").lean()
    : null;

  if (!question || !topic || !knowledge) {
    console.log("delete-guards-db-readonly: SKIP (dữ liệu tham chiếu cũ không đầy đủ)");
    return;
  }

  const user = {
    _id: new mongoose.Types.ObjectId(),
    quantrinhomdonvi: [{ _id: knowledge._id }],
  };

  const questionResult = await invoke(cauhoiController.deleteCauhoi, {
    params: { id: String(question._id) },
    query: { monthi: String(knowledge._id) },
    user,
  });
  assert.strictEqual(questionResult.statusCode, 409);

  const topicResult = await invoke(chuyendeController.deleteChuyende, {
    params: {
      id: String(knowledge._id),
      id1: String(topic._id),
    },
    user,
  });
  assert.strictEqual(topicResult.statusCode, 409);

  const knowledgeResult = await invoke(monthiController.deleteMonthi, {
    params: { id: String(knowledge._id) },
    query: {},
    user,
  });
  assert.strictEqual(knowledgeResult.statusCode, 409);

  const [historyStillExists, questionStillExists, topicStillExists, knowledgeStillExists] =
    await Promise.all([
      LichsuThis.exists({ _id: history._id }),
      Cauhois.exists({ _id: question._id }),
      Chuyendes.exists({ _id: topic._id }),
      Monthis.exists({ _id: knowledge._id }),
    ]);

  assert.ok(historyStillExists);
  assert.ok(questionStillExists);
  assert.ok(topicStillExists);
  assert.ok(knowledgeStillExists);
  console.log("delete-guards-db-readonly: OK", {
    knowledge: String(knowledge._id),
    topic: String(topic._id),
    question: String(question._id),
  });
}

main()
  .catch((error) => {
    console.error("delete-guards-db-readonly: FAIL", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
