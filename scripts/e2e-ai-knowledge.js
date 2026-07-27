/**
 * E2E: upload KB file → wait ready → ask from file → ask web fallback
 * Usage: node scripts/e2e-ai-knowledge.js
 * Needs: server running, API_GPT_4, Mongo, admin cookie via LOGIN env
 *
 * Env:
 *   BASE_URL=http://localhost:5000
 *   LOGIN_USER=...
 *   LOGIN_PASS=...
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const LOGIN_USER = process.env.LOGIN_USER || process.env.TENTAIKHOAN || "admin";
const LOGIN_PASS = process.env.LOGIN_PASS || process.env.MATKHAU || "";

const UNIQUE =
  "MA_BI_MAT_KIEN_THUC_C08_" + Date.now() + "_PHAT_XE_DAP_DIEN_999_TRIEU";

function request(method, urlPath, { body, headers, formBoundary, formBody } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE_URL);
    const lib = u.protocol === "https:" ? https : http;
    const payload = formBody || (body ? JSON.stringify(body) : null);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: {
          ...(payload && !formBoundary
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
          ...(formBoundary
            ? {
                "Content-Type": `multipart/form-data; boundary=${formBoundary}`,
                "Content-Length": Buffer.byteLength(formBody),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {}
          const setCookie = res.headers["set-cookie"] || [];
          resolve({ status: res.statusCode, json, raw, setCookie });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function cookieHeaderFrom(setCookie, existing = "") {
  const map = {};
  String(existing || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const i = pair.indexOf("=");
      if (i > 0) map[pair.slice(0, i)] = pair.slice(i + 1);
    });
  for (const line of setCookie) {
    const part = String(line).split(";")[0];
    const i = part.indexOf("=");
    if (i > 0) map[part.slice(0, i)] = part.slice(i + 1);
  }
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function buildMultipart(fileName, content) {
  const boundary = "----C08Boundary" + Date.now();
  const chunks = [];
  chunks.push(`--${boundary}\r\n`);
  chunks.push(
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`
  );
  chunks.push("Content-Type: text/plain\r\n\r\n");
  chunks.push(content);
  chunks.push(`\r\n--${boundary}--\r\n`);
  return { boundary, body: Buffer.from(chunks.join(""), "utf8") };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("BASE_URL =", BASE_URL);

  // health: chat without auth should respond somehow
  let cookie = "";

  if (LOGIN_PASS) {
    const login = await request("POST", "/c08/auth/login", {
      body: { tentaikhoan: LOGIN_USER, matkhau: LOGIN_PASS },
    });
    console.log("Login status:", login.status);
    if (login.status !== 200) {
      console.error("Login failed:", login.raw.slice(0, 300));
      process.exit(1);
    }
    cookie = cookieHeaderFrom(login.setCookie);
  } else {
    console.warn(
      "No LOGIN_PASS — skip upload/auth tests; only public chat smoke."
    );
  }

  if (cookie) {
    const sample = [
      "TAI LIEU NOI BO TRO LY AO C08",
      "",
      `Quy dinh noi bo thu nghiem: ma ${UNIQUE}.`,
      "Khi nguoi dung hoi ve ma nay, tra loi: muc phat xe dap dien trong tai lieu noi bo la 999 trieu dong (chi de test).",
      "Day la noi dung gia dinh chi dung cho kiem thu RAG.",
    ].join("\n");

    const tmp = path.join(__dirname, "tmp-kb-test.txt");
    fs.writeFileSync(tmp, sample, "utf8");
    const { boundary, body } = buildMultipart("tmp-kb-test.txt", sample);

    const upload = await request("POST", "/c08/ai-knowledge/upload", {
      headers: { Cookie: cookie },
      formBoundary: boundary,
      formBody: body,
    });
    console.log("Upload status:", upload.status, upload.json?.message || "");
    if (upload.status !== 201 && upload.status !== 200) {
      console.error(upload.raw.slice(0, 500));
      process.exit(1);
    }
    const fileId = upload.json?.item?._id;
    if (!fileId) {
      console.error("No file id");
      process.exit(1);
    }
    console.log("fileId:", fileId);

    let ready = false;
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      const list = await request("GET", "/c08/ai-knowledge", {
        headers: { Cookie: cookie },
      });
      const item = (list.json?.items || []).find(
        (x) => String(x._id) === String(fileId)
      );
      console.log("status poll:", item?.status, "chunks:", item?.chunkCount);
      if (item?.status === "ready") {
        ready = true;
        break;
      }
      if (item?.status === "failed") {
        console.error("Processing failed:", item.errorMessage);
        process.exit(1);
      }
    }
    if (!ready) {
      console.error("Timeout waiting for ready");
      process.exit(1);
    }

    const askFile = await request("POST", "/api/chat-gpt", {
      body: {
        history: [
          {
            role: "user",
            content: `Ma bi mat ${UNIQUE} quy dinh muc phat xe dap dien bao nhieu?`,
          },
        ],
      },
    });
    console.log(
      "Ask-from-file:",
      askFile.status,
      "sourceType=",
      askFile.json?.sourceType
    );
    console.log("reply snippet:", String(askFile.json?.reply || "").slice(0, 200));
    if (askFile.status !== 200) {
      console.error(askFile.raw.slice(0, 400));
      process.exit(1);
    }
    if (askFile.json?.sourceType !== "file" && askFile.json?.sourceType !== "mixed") {
      console.error("EXPECTED sourceType file/mixed, got", askFile.json?.sourceType);
      process.exit(1);
    }
    if (!String(askFile.json?.reply || "").includes("999")) {
      console.warn("WARN: reply may not contain 999 — check manually");
    } else {
      console.log("OK: reply mentions 999 from file content");
    }

    // cleanup
    const del = await request("DELETE", `/c08/ai-knowledge/${fileId}`, {
      headers: { Cookie: cookie },
    });
    console.log("Delete status:", del.status);
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
  }

  const askWeb = await request("POST", "/api/chat-gpt", {
    body: {
      history: [
        {
          role: "user",
          content:
            "Cong thuc nau pho bo Ha Noi co may buoc? (cau hoi ngoai ATGT de test fallback)",
        },
      ],
    },
  });
  console.log(
    "Ask-web-ish:",
    askWeb.status,
    "sourceType=",
    askWeb.json?.sourceType
  );
  console.log("reply snippet:", String(askWeb.json?.reply || "").slice(0, 200));

  console.log("\nE2E finished.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
