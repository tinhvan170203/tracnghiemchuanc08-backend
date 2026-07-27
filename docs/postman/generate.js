/**
 * Generate Postman Collection v2.1 from endpoints.js
 * Usage: node docs/postman/generate.js
 */

const fs = require('fs');
const path = require('path');
const endpoints = require('./endpoints');

const OUT_DIR = __dirname;
const COLLECTION_FILE = path.join(OUT_DIR, 'C08-TracNghiem.postman_collection.json');

const LOGIN_TEST_SCRIPT = [
  "if (pm.response.code === 200) {",
  "    const cookies = pm.cookies.toObject();",
  "    if (cookies.accessToken_thitracnghiem) {",
  "        pm.environment.set('accessToken', cookies.accessToken_thitracnghiem);",
  "    }",
  "    if (cookies.refreshToken_thitracnghiem) {",
  "        pm.environment.set('refreshToken', cookies.refreshToken_thitracnghiem);",
  "    }",
  "    const json = pm.response.json();",
  "    if (json._id) pm.environment.set('userId', json._id);",
  "}",
].join('\n');

const COLLECTION_PRE_REQUEST = [
  "const accessToken = pm.environment.get('accessToken');",
  "const refreshToken = pm.environment.get('refreshToken');",
  "const cookies = [];",
  "if (accessToken) cookies.push('accessToken_thitracnghiem=' + accessToken);",
  "if (refreshToken) cookies.push('refreshToken_thitracnghiem=' + refreshToken);",
  "if (cookies.length) {",
  "    pm.request.headers.upsert({ key: 'Cookie', value: cookies.join('; ') });",
  "}",
].join('\n');

function buildUrl(ep) {
  const raw = `{{baseUrl}}${ep.path}`;
  const url = {
    raw,
    host: ['{{baseUrl}}'],
    path: ep.path.replace(/^\//, '').split('/'),
  };
  if (ep.query && ep.query.length) {
    url.query = ep.query.map((q) => ({ key: q.key, value: q.value, disabled: q.disabled || false }));
  }
  return url;
}

function buildBody(ep) {
  if (ep.bodyType === 'formdata' && ep.formdata) {
    return { mode: 'formdata', formdata: ep.formdata };
  }
  if (ep.body !== undefined) {
    return {
      mode: 'raw',
      raw: JSON.stringify(ep.body, null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  return undefined;
}

function buildDescription(ep) {
  const parts = [];
  if (ep.description) parts.push(ep.description);
  if (ep.auth === true) parts.push('**Auth:** Cookie JWT (accessToken_thitracnghiem)');
  else if (ep.auth === 'refresh') parts.push('**Auth:** Cookie refreshToken_thitracnghiem');
  else if (ep.auth === false) parts.push('**Auth:** Public (không cần đăng nhập)');
  if (ep.role) parts.push(`**Role:** \`${ep.role}\``);
  return parts.join('\n\n') || undefined;
}

function buildRequest(ep) {
  const request = {
    method: ep.method,
    header: [{ key: 'Content-Type', value: 'application/json', disabled: ep.bodyType === 'formdata' }],
    url: buildUrl(ep),
    description: buildDescription(ep),
  };

  const body = buildBody(ep);
  if (body) request.body = body;

  const item = { name: ep.name, request, response: [] };

  if (ep.testScript) {
    item.event = [{
      listen: 'test',
      script: { type: 'text/javascript', exec: LOGIN_TEST_SCRIPT.split('\n') },
    }];
  }

  return item;
}

function groupByFolder(endpoints) {
  const folders = {};
  for (const ep of endpoints) {
    if (!folders[ep.folder]) folders[ep.folder] = [];
    folders[ep.folder].push(buildRequest(ep));
  }
  return Object.entries(folders).map(([name, items]) => ({ name, item: items }));
}

function generateCollection() {
  const collection = {
    info: {
      _postman_id: 'c08-tracnghiem-api',
      name: 'C08 Trắc Nghiệm API',
      description:
        'API collection cho hệ thống trắc nghiệm C08.\n\n' +
        '**Cách dùng:**\n' +
        '1. Import environment (Local hoặc Production)\n' +
        '2. Chạy request **Auth > Login** trước\n' +
        '3. Cookie JWT sẽ được lưu vào environment tự động\n\n' +
        'Regenerate: `node docs/postman/generate.js`',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    event: [
      {
        listen: 'prerequest',
        script: {
          type: 'text/javascript',
          exec: COLLECTION_PRE_REQUEST.split('\n'),
        },
      },
    ],
    variable: [{ key: 'baseUrl', value: 'http://localhost:4000' }],
    item: groupByFolder(endpoints),
  };

  fs.writeFileSync(COLLECTION_FILE, JSON.stringify(collection, null, 2), 'utf8');
  console.log(`✅ Generated: ${COLLECTION_FILE}`);
  console.log(`   Total endpoints: ${endpoints.length}`);
  console.log(`   Folders: ${new Set(endpoints.map((e) => e.folder)).size}`);
}

generateCollection();
