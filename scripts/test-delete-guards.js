const assert = require("assert");

const Monthis = require("../models/Monthi");
const Chuyendes = require("../models/Chuyende");
const Cauhois = require("../models/CauHoi");
const Cuocthis = require("../models/Cuocthi");
const LichsuThis = require("../models/LichsuThi");
const Users = require("../models/User");
const monthiController = require("../controllers/monthi");
const chuyendeController = require("../controllers/chuyende");
const cauhoiController = require("../controllers/cauhoi");

const IDS = {
  monthi: "68b1a8c76087e71c51253c28",
  chuyende: "68b1a8c76087e71c51253c29",
  question: "68b1a8c76087e71c51253c30",
  user: "68b1a8c76087e71c51253c31",
};

const originals = new Map();

function stub(target, name, implementation) {
  if (!originals.has(target)) originals.set(target, {});
  const methods = originals.get(target);
  if (!(name in methods)) methods[name] = target[name];
  target[name] = implementation;
}

function restore() {
  for (const [target, methods] of originals) {
    Object.assign(target, methods);
  }
}

function queryResult(value) {
  const query = {
    select() {
      return query;
    },
    sort() {
      return query;
    },
    skip() {
      return query;
    },
    limit() {
      return query;
    },
    populate() {
      return query;
    },
    lean() {
      return Promise.resolve(value);
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return query;
}

function mockResponse() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(statusCode) {
      result.statusCode = statusCode;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
}

async function invoke(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res.result;
}

function userFor(monthi = IDS.monthi) {
  return {
    _id: IDS.user,
    quantrinhomdonvi: [{ _id: monthi }],
  };
}

async function testMonthiGuards() {
  let deleted = 0;
  stub(Monthis, "findById", () => queryResult({ _id: IDS.monthi }));
  stub(Chuyendes, "exists", async () => ({ _id: IDS.chuyende }));
  stub(Cuocthis, "exists", async () => null);
  stub(Monthis, "findByIdAndDelete", async () => {
    deleted += 1;
  });

  const blocked = await invoke(monthiController.deleteMonthi, {
    params: { id: IDS.monthi },
    query: {},
    user: userFor(),
  });
  assert.strictEqual(blocked.statusCode, 409);
  assert.strictEqual(blocked.body.code, "RESOURCE_IN_USE");
  assert.strictEqual(deleted, 0);

  stub(Chuyendes, "exists", async () => null);
  stub(Monthis, "find", () => queryResult([]));
  stub(Users, "updateMany", async () => ({ modifiedCount: 1 }));
  stub(Users, "findById", () => queryResult(userFor()));

  const success = await invoke(monthiController.deleteMonthi, {
    params: { id: IDS.monthi },
    query: {},
    user: userFor(),
  });
  assert.strictEqual(success.statusCode, 200);
  assert.strictEqual(deleted, 1);

  stub(Monthis, "findById", () => queryResult(null));
  const secondDelete = await invoke(monthiController.deleteMonthi, {
    params: { id: IDS.monthi },
    query: {},
    user: userFor(),
  });
  assert.strictEqual(secondDelete.statusCode, 404);

  const invalid = await invoke(monthiController.deleteMonthi, {
    params: { id: "invalid" },
    query: {},
    user: userFor(),
  });
  assert.strictEqual(invalid.statusCode, 400);
}

async function testChuyendeGuards() {
  let deleted = 0;
  stub(Chuyendes, "findOne", () => queryResult({ _id: IDS.chuyende }));
  stub(Cauhois, "exists", async () => ({ _id: IDS.question }));
  stub(Cuocthis, "exists", async () => null);
  stub(Chuyendes, "deleteOne", async () => {
    deleted += 1;
  });

  const blocked = await invoke(chuyendeController.deleteChuyende, {
    params: { id: IDS.monthi, id1: IDS.chuyende },
    user: userFor(),
  });
  assert.strictEqual(blocked.statusCode, 409);
  assert.match(blocked.body.message, /vẫn còn câu hỏi/);
  assert.strictEqual(deleted, 0);

  stub(Cauhois, "exists", async () => null);
  stub(Chuyendes, "find", async () => []);

  const success = await invoke(chuyendeController.deleteChuyende, {
    params: { id: IDS.monthi, id1: IDS.chuyende },
    user: userFor(),
  });
  assert.strictEqual(success.statusCode, 200);
  assert.strictEqual(deleted, 1);

  stub(Chuyendes, "findOne", () => queryResult(null));
  const wrongParent = await invoke(chuyendeController.deleteChuyende, {
    params: { id: IDS.monthi, id1: IDS.chuyende },
    user: userFor(),
  });
  assert.strictEqual(wrongParent.statusCode, 404);
}

async function testQuestionGuards() {
  let deleted = 0;
  stub(Cauhois, "findById", () =>
    queryResult({ _id: IDS.question, chuyende: IDS.chuyende })
  );
  stub(Chuyendes, "exists", async () => ({ _id: IDS.chuyende }));
  stub(LichsuThis, "exists", async () => ({ _id: IDS.question }));
  stub(Cauhois, "findByIdAndDelete", async () => {
    deleted += 1;
  });

  const blocked = await invoke(cauhoiController.deleteCauhoi, {
    params: { id: IDS.question },
    query: { monthi: IDS.monthi },
    user: userFor(),
  });
  assert.strictEqual(blocked.statusCode, 409);
  assert.match(blocked.body.message, /đã có bài thi sử dụng/);
  assert.strictEqual(deleted, 0);

  stub(LichsuThis, "exists", async () => null);
  stub(Chuyendes, "find", () => queryResult([{ _id: IDS.chuyende }]));
  stub(Cauhois, "find", () => queryResult([]));

  const success = await invoke(cauhoiController.deleteCauhoi, {
    params: { id: IDS.question },
    query: { monthi: IDS.monthi },
    user: userFor(),
  });
  assert.strictEqual(success.statusCode, 200);
  assert.strictEqual(deleted, 1);

  stub(Cauhois, "findById", () => queryResult(null));
  const secondDelete = await invoke(cauhoiController.deleteCauhoi, {
    params: { id: IDS.question },
    query: { monthi: IDS.monthi },
    user: userFor(),
  });
  assert.strictEqual(secondDelete.statusCode, 404);

  const forbidden = await invoke(cauhoiController.deleteCauhoi, {
    params: { id: IDS.question },
    query: { monthi: IDS.monthi },
    user: userFor("68b1a8c76087e71c51253c99"),
  });
  assert.strictEqual(forbidden.statusCode, 403);
}

async function main() {
  try {
    await testMonthiGuards();
    await testChuyendeGuards();
    await testQuestionGuards();
    console.log("delete-guards: OK");
  } finally {
    restore();
  }
}

main().catch((error) => {
  console.error("delete-guards: FAIL", error);
  process.exitCode = 1;
});
