/**
 * So sánh 2 kỳ cùng biểu mẫu — pure helpers (testable).
 */

function tid(period) {
  if (!period) return "";
  const t = period.templateId;
  return String((t && (t._id || t)) || "");
}

function assertSameTemplate(periodA, periodB) {
  const a = tid(periodA);
  const b = tid(periodB);
  if (!a || !b || a !== b) {
    const err = new Error(
      "Chỉ so sánh được 2 kỳ cùng biểu mẫu (cùng templateId)"
    );
    err.status = 400;
    throw err;
  }
  return a;
}

function uidOf(raw) {
  if (!raw) return null;
  return String(raw._id || raw);
}

/**
 * Map userId → { tenDonVi, values, status, metaValues }
 */
function buildValuesByUser(period, submissions) {
  const byUser = new Map();
  for (const s of submissions || []) {
    const uid = uidOf(s.userId);
    if (!uid) continue;
    byUser.set(uid, {
      values: s.values || {},
      metaValues: s.metaValues || {},
      status: s.status || "draft",
      tenDonVi: s.tenDonVi || "",
    });
  }

  const map = new Map();
  for (const a of period?.assignees || []) {
    const uid = uidOf(a.userId);
    if (!uid) continue;
    const sub = byUser.get(uid);
    map.set(uid, {
      tenDonVi:
        (sub && sub.tenDonVi) ||
        a.tenDonVi ||
        a.tenHienThi ||
        "",
      values: sub?.values || {},
      metaValues: sub?.metaValues || {},
      status: sub?.status || "chua_lam",
      inPeriod: true,
    });
  }

  // Phiếu còn nhưng đã gỡ assignee — vẫn đưa vào so sánh nếu có values
  for (const [uid, sub] of byUser) {
    if (map.has(uid)) continue;
    if (
      !(sub.values && Object.keys(sub.values).length) &&
      !(sub.metaValues && Object.keys(sub.metaValues).length)
    ) {
      continue;
    }
    map.set(uid, {
      tenDonVi: sub.tenDonVi || "",
      values: sub.values || {},
      metaValues: sub.metaValues || {},
      status: sub.status || "draft",
      inPeriod: true,
    });
  }

  return map;
}

function numOrNull(val) {
  if (val == null || val === "") return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

/**
 * @returns {{ userId, tenDonVi, inA, inB, statusA, statusB, valuesA, valuesB, deltas }}
 * deltas chỉ cho field number: key → B - A (null nếu thiếu 1 bên)
 */
function buildCompareRows(mapA, mapB, numberFieldKeys = []) {
  const ids = new Set([...mapA.keys(), ...mapB.keys()]);
  const rows = [];
  for (const userId of ids) {
    const a = mapA.get(userId);
    const b = mapB.get(userId);
    const valuesA = a?.values || {};
    const valuesB = b?.values || {};
    const deltas = {};
    for (const key of numberFieldKeys) {
      const na = numOrNull(valuesA[key]);
      const nb = numOrNull(valuesB[key]);
      if (na == null || nb == null) deltas[key] = null;
      else deltas[key] = nb - na;
    }
    rows.push({
      userId,
      tenDonVi: (b?.tenDonVi || a?.tenDonVi || "").trim() || `Đơn vị ${userId.slice(-4)}`,
      inA: !!a,
      inB: !!b,
      statusA: a?.status || null,
      statusB: b?.status || null,
      valuesA,
      valuesB,
      deltas,
    });
  }
  rows.sort((x, y) =>
    String(x.tenDonVi).localeCompare(String(y.tenDonVi), "vi", {
      sensitivity: "base",
    })
  );
  return rows;
}

function numberFieldKeysFromSnapshot(snapshot) {
  const keys = [];
  for (const s of snapshot?.sections || []) {
    for (const f of s.fields || []) {
      if (f.dataType === "number" && f.key) keys.push(f.key);
    }
  }
  return keys;
}

module.exports = {
  tid,
  assertSameTemplate,
  buildValuesByUser,
  buildCompareRows,
  numberFieldKeysFromSnapshot,
  numOrNull,
};
