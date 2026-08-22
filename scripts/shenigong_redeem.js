/**
 * 深i工（深圳工会小程序）0 元专区抢兑。登录凭据自动抓取，配置见 boxjs.json。
 * 抢单用多个互不 await 对方的重试循环模拟并发（Surge 脚本引擎单线程，没有真线程池）。
 */

const BASE = "https://miniapp-gig.szzgh.org/benefits/web-plat";
const DEPT_ID = "46";
const EARLY_MS = -30;
const WORKERS = 3;
const INTERVAL_MS = 120;
const QUEUE_DEADLINE_MS = 300 * 1000;
const SIGN_SALT = "oKVfu5xB0efFIq8uxOCk5c3XRvKdecHK";
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.70 NetType/WIFI Language/zh_CN";

// ---------- SHA-256（标准实现，无第三方依赖，用于 make_sign）----------

function sha256Hex(message) {
  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const bytes = utf8Bytes(message);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

  const w = new Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

function utf8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

// ---------- 签名（对齐 shenigong_redeem.py 的 make_sign / signed_headers）----------

function flatten(key, value) {
  if (Array.isArray(value)) {
    let out = [];
    value.forEach((v, i) => { out = out.concat(flatten(`${key}[${i}]`, v)); });
    return out;
  }
  if (value && typeof value === "object") {
    let out = [];
    Object.keys(value).forEach((k) => { out = out.concat(flatten(`${key}[${k}]`, value[k])); });
    return out;
  }
  // 对齐 Python str(bool) 的大写形式（signed_headers 的签名明文以 Python 版为准）
  if (typeof value === "boolean") return [`${key}=${value ? "True" : "False"}`];
  return [`${key}=${value}`];
}

function makeSign(params, body, timestamp) {
  const merged = Object.assign({}, params || {}, body || {});
  merged.timestamp = timestamp;
  let pairs = [];
  for (const key of Object.keys(merged)) {
    const value = merged[key];
    if (value === "" || value === null || value === undefined) continue;
    pairs = pairs.concat(flatten(key, value));
  }
  pairs.sort();
  return sha256Hex(pairs.join("&") + SIGN_SALT);
}

function parseQueryParams(path) {
  const params = {};
  const qIdx = path.indexOf("?");
  if (qIdx === -1) return params;
  for (const pair of path.slice(qIdx + 1).split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    const v = eq === -1 ? "" : pair.slice(eq + 1);
    try {
      params[decodeURIComponent(k)] = decodeURIComponent(v);
    } catch (e) {
      params[k] = v;
    }
  }
  return params;
}

function signedHeaders(account, method, path, body) {
  const params = parseQueryParams(path);
  const timestamp = Date.now();
  const headers = {
    Cookie: `JSESSIONID=${account.session};csrf_token=qypt`,
    "User-Agent": UA,
    "Content-Type": "application/json",
    "x-requested-with": "XMLHttpRequest",
    Timestamp: String(timestamp),
    Sign: makeSign(params, body, timestamp),
    Referer: "https://servicewechat.com/wx184c95bb87569866/42/page-frame.html",
  };
  if (method === "POST") headers["csrf-token"] = account.csrf;
  return headers;
}

// ---------- HTTP ----------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpRequest(options) {
  return new Promise((resolve) => {
    const method = (options.method || "GET").toLowerCase();
    const fn = $httpClient[method] || $httpClient.get;
    fn.call($httpClient, options, (error, response, data) => resolve({ error, response, data }));
  });
}

async function httpJson(account, method, path, body, timeout) {
  const headers = signedHeaders(account, method, path, body);
  const options = { url: BASE + path, method, headers, timeout: timeout || 12 };
  if (body !== undefined && body !== null) options.body = JSON.stringify(body);
  const { error, response, data } = await httpRequest(options);
  if (error) return { code: -1, msg: String(error) };
  try {
    return JSON.parse(data);
  } catch (e) {
    return { code: response ? response.status : -1, msg: "HTTP " + (response ? response.status : "?") };
  }
}

function getJson(account, path) {
  return httpJson(account, "GET", path);
}

// ---------- 商品 ----------

async function fetchAllGoods(account) {
  const tagsResp = await getJson(account, "/snapped/tag/list?deptId=" + DEPT_ID);
  const tags = tagsResp.list || [];
  const zeroTags = tags.filter((t) => {
    const name = String(t.tagName || "");
    return name.indexOf("0元专区") !== -1 || name.indexOf("零元专区") !== -1;
  });
  if (!zeroTags.length) return [];
  const goodsById = new Map();
  for (const tag of zeroTags) {
    const tagId = String(tag.id || "");
    if (!tagId) continue;
    const path = `/snapped/getByTagId?deptId=${DEPT_ID}&tagId=${tagId}&goodsClassify=`;
    const resp = await getJson(account, path);
    for (const goods of resp.snappedList || []) {
      const gid = String(goods.id || "");
      if (gid) goodsById.set(gid, goods);
    }
  }
  return Array.from(goodsById.values()).sort((a, b) => {
    const sa = Number(a.startTime || 0), sb = Number(b.startTime || 0);
    if (sa !== sb) return sa - sb;
    return String(a.goodsName || "").localeCompare(String(b.goodsName || ""));
  });
}

function printGoods(goodsList) {
  console.log(`\n--- 0 元专区（${goodsList.length} 个）---`);
  const nowMs = Date.now();
  goodsList.forEach((goods, index) => {
    const startMs = Number(goods.startTime || 0);
    const endMs = Number(goods.endTime || 0);
    const sold = Number(goods.soldPercentage || 0);
    let status;
    if (sold >= 100) status = "已售罄";
    else if (endMs && endMs < nowMs) status = "已结束";
    else if (startMs > nowMs) status = "待开始";
    else status = "可抢兑";
    const skuId = goods.caseId || goods.skuId || "?";
    console.log(
      `${String(index + 1).padStart(2, "0")}. [${status}] ${goods.goodsName || "未命名商品"} | ${goods.point || "?"}积分 | 已售${sold}% | SKU=${skuId}`
    );
  });
  console.log("--- 商品列表结束 ---\n");
}

function selectGoods(goodsList, target) {
  target = (target || "").trim();
  if (!/^\d+$/.test(target)) return null;
  const candidates = goodsList.filter((g) => String(g.caseId || g.skuId || "") === target);
  if (!candidates.length) return null;
  return candidates.reduce((best, cur) => {
    const bs = Number(best.startTime || 0), cs = Number(cur.startTime || 0);
    if (cs > bs) return cur;
    if (cs === bs && String(cur.id || "") > String(best.id || "")) return cur;
    return best;
  });
}

async function getDefaultAddressId(account) {
  const resp = await getJson(account, "/member/addressList");
  if (resp.code !== 200) return "";
  let addresses = [];
  try {
    addresses = JSON.parse(resp.msg || "[]");
  } catch (e) {
    return "";
  }
  if (!addresses.length) return "";
  const def = addresses.find((a) => Number(a.isDefault || 0) === 1) || addresses[0];
  return String(def.id || "");
}

function fmtMs(ms) {
  const d = new Date(ms);
  const pad = (n, w) => String(n).padStart(w || 2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function waitUntil(targetMs) {
  return new Promise((resolve) => {
    function tick() {
      const remain = targetMs - Date.now();
      if (remain <= 0) {
        resolve();
        return;
      }
      let delay;
      if (remain > 2000) delay = Math.min(1000, remain - 1000);
      else if (remain > 100) delay = remain - 30;
      else delay = 1;
      setTimeout(tick, Math.max(1, delay));
    }
    tick();
  });
}

// ---------- 抢兑核心：多个互相独立的重试循环模拟并发 worker ----------

async function runWorker(workerId, account, gid, payload, fireMs, deadlineMs, state, log) {
  if (fireMs - Date.now() > 300) {
    await httpJson(account, "GET", `/snapped/getDetailInfo?deptId=${DEPT_ID}&id=${gid}`, null, 8);
  }
  await waitUntil(fireMs);
  let attempt = 0;
  while (!state.stopped && Date.now() < deadlineMs) {
    const sentAt = Date.now();
    attempt++;
    const resp = await httpJson(account, "POST", "/snapped/orderCommit", payload, 12);
    if (state.stopped) return;
    const code = resp.code;
    const msg = String(resp.msg || resp.message || JSON.stringify(resp));
    log(`[${state.tag}][W${workerId}] ${sentAt - fireMs >= 0 ? "+" : ""}${sentAt - fireMs}ms code=${code} ${msg}`);
    state.last = msg;
    if (code === 200 && resp.orderId) {
      state.stopped = true;
      state.state = "submitted";
      state.orderId = String(resp.orderId);
      return;
    }
    if (msg.indexOf("排队抢购中") !== -1 || msg.indexOf("请勿重复提交") !== -1) {
      state.stopped = true;
      state.state = "queued";
      return;
    }
    if (["商品已被秒完", "已抢购", "已兑换", "无法重复参与", "积分不足", "售罄", "已结束"].some((s) => msg.indexOf(s) !== -1)) {
      state.stopped = true;
      state.state = "failed";
      return;
    }
    let delayMs;
    if (code === 429 || msg.indexOf("访问人数过多") !== -1) delayMs = Math.min(800, INTERVAL_MS * Math.min(attempt, 6));
    else if (code === -1) delayMs = 500;
    else delayMs = INTERVAL_MS;
    delayMs += Math.floor(Math.random() * 45);
    await sleep(delayMs);
  }
}

async function runAccountRedeem(index, account, goods, log) {
  const tag = account.remark;
  const pointsResp = await getJson(account, "/snapped/getPoints?deptId=" + DEPT_ID);
  if (pointsResp.code !== 200) {
    log(`[${index}][${tag}] 商城登录失效：${pointsResp.msg || pointsResp.message}`);
    return "login_invalid";
  }
  const gid = String(goods.id || "");
  const name = String(goods.goodsName || gid);
  const startMs = Number(goods.startTime || 0);
  const endMs = Number(goods.endTime || 0);
  const nowMs = Date.now();
  log(`[${index}][${tag}] 积分=${pointsResp.point || "?"}，目标=${name}，id=${gid}，开抢=${fmtMs(startMs)}`);
  if (endMs && nowMs > endMs) {
    log(`[${index}][${tag}] 商品已结束`);
    return "failed";
  }

  const detailResp = await getJson(account, `/snapped/getDetailInfo?deptId=${DEPT_ID}&id=${gid}`);
  const detail = detailResp.snapped || goods;
  const shipmentType = String(detail.virtualShipment || "");
  let payload, shipmentDesc;
  if (shipmentType === "1") {
    if (!account.phone) {
      log(`[${index}][${tag}] 虚拟商品需要手机号，请在模块参数 szgh_phone 填手机号（自动抓取的凭据抓不到手机号）`);
      return "failed";
    }
    payload = { goodsSnappedId: gid, virtualShipmentPhone: account.phone, orderRemark: "" };
    shipmentDesc = "虚拟商品/手机号";
  } else {
    const addressId = await getDefaultAddressId(account);
    if (!addressId) {
      log(`[${index}][${tag}] 实物商品需要商城收货地址，请先在小程序设置默认地址`);
      return "failed";
    }
    payload = { goodsSnappedId: gid, addressId, orderRemark: "" };
    shipmentDesc = "实物商品/默认地址";
  }
  log(`[${index}][${tag}] 配送=${shipmentDesc}`);

  const fireMs = Math.max(nowMs, startMs + EARLY_MS);
  if (fireMs > nowMs) log(`[${index}][${tag}] 等待 ${fireMs - nowMs} ms，定点=${fmtMs(fireMs)}`);

  const deadlineMs = fireMs + QUEUE_DEADLINE_MS;
  const state = { stopped: false, state: "running", last: "", orderId: "", tag };
  const workers = [];
  for (let i = 0; i < WORKERS; i++) workers.push(runWorker(i + 1, account, gid, payload, fireMs, deadlineMs, state, log));
  await Promise.all(workers);

  if (state.state === "submitted") {
    log(`[${index}][${tag}] 已提交订单，开始查询排队结果`);
    while (Date.now() < deadlineMs) {
      const stateResp = await httpJson(account, "GET", `/snapped/checkOrderState?orderId=${state.orderId}&snappedId=${gid}`);
      if (stateResp.code === 200 && stateResp.isSuccess) {
        state.state = "success";
        state.last = "服务端确认抢兑成功";
        break;
      }
      if (stateResp.code === 200 && !stateResp.wait) {
        state.state = "failed";
        state.last = String(stateResp.failMsg || stateResp.msg || "抢兑失败");
        break;
      }
      await sleep(2000);
    }
    if (state.state === "submitted") {
      state.state = "queued";
      state.last = "排队查询超时，请到我的订单查看";
    }
  }

  const labels = { success: "抢兑成功", queued: "已在排队", failed: "抢兑失败", running: "抢兑超时" };
  log(`[${index}][${tag}] ${labels[state.state] || "抢兑结束"}：${state.last}`);
  return state.state;
}

// ---------- 参数解析（BoxJs 里 szgh_redeem_extra 的格式） ----------

function rsplit(str, sep, maxSplits) {
  const parts = [];
  let remaining = str;
  while (parts.length < maxSplits) {
    const idx = remaining.lastIndexOf(sep);
    if (idx === -1) break;
    parts.unshift(remaining.slice(idx + sep.length));
    remaining = remaining.slice(0, idx);
  }
  parts.unshift(remaining);
  return parts;
}

function parseRedeemAccounts(raw) {
  const accounts = [];
  raw = (raw || "").trim();
  if (!raw) return accounts;
  for (let item of raw.replace(/\n/g, "&").split("&")) {
    item = item.trim();
    if (!item) continue;
    const atIdx = item.lastIndexOf("@");
    let core = item, remark = "";
    if (atIdx !== -1) {
      core = item.slice(0, atIdx);
      remark = item.slice(atIdx + 1);
    }
    const parts = rsplit(core, "#", 2);
    if (parts.length !== 3) continue;
    let session = parts[0].trim();
    const csrf = parts[1].trim();
    const phone = parts[2].trim();
    if (!/^1\d{10}$/.test(phone)) continue;
    const m = /(?:^|;\s*)JSESSIONID=([^;]+)/.exec(session);
    if (m) session = m[1];
    if (!session || !csrf) continue;
    accounts.push({ session, csrf, phone, remark: remark.trim() || `账号${accounts.length + 1}` });
  }
  return accounts;
}

// ---------- 凭证自动抓取 ----------

const CAPTURED_SESSIONS_KEY = "szgh_redeem_sessions";
const MAX_CAPTURED_SESSIONS = 3;

function lowerCaseHeaders(headers) {
  const out = {};
  for (const k of Object.keys(headers || {})) out[k.toLowerCase()] = headers[k];
  return out;
}

function readCapturedSessions() {
  try {
    const list = JSON.parse($persistentStore.read(CAPTURED_SESSIONS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeCapturedSessions(list) {
  $persistentStore.write(JSON.stringify(list), CAPTURED_SESSIONS_KEY);
}

function pruneCapturedSession(session) {
  writeCapturedSessions(readCapturedSessions().filter((s) => s.session !== session));
}

function captureCredentials() {
  const headers = lowerCaseHeaders($request.headers);
  const cookie = headers["cookie"] || "";
  const m = /JSESSIONID=([^;]+)/.exec(cookie);
  const csrf = headers["csrf-token"];
  if (!m || !csrf) {
    $done({});
    return;
  }
  const session = m[1];
  const sessions = readCapturedSessions();
  const existing = sessions.find((s) => s.session === session);
  if (existing) {
    if (existing.csrf !== csrf) {
      existing.csrf = csrf;
      writeCapturedSessions(sessions);
    }
  } else {
    sessions.push({ session, csrf });
    while (sessions.length > MAX_CAPTURED_SESSIONS) sessions.shift();
    writeCapturedSessions(sessions);
    $notification.post("深i工抢兑", "已自动抓取新账号", `当前共 ${sessions.length} 个自动抓取账号，别忘了在 BoxJs 里填手机号 szgh_phone`);
  }
  $done({});
}

// 自动抓取的账号（同一个 phone 应用到全部，最多同时保留 MAX_CAPTURED_SESSIONS 个）+ BoxJs 手动追加的账号。
function buildAccounts(phone, capturedSessions) {
  const accounts = capturedSessions.map((s, i) => ({
    session: s.session,
    csrf: s.csrf,
    phone,
    remark: capturedSessions.length > 1 ? `本机自动抓取${i + 1}` : "本机自动抓取",
    _captured: true,
  }));
  const extraRaw = $persistentStore.read("szgh_redeem_extra") || "";
  for (const acc of parseRedeemAccounts(extraRaw)) {
    if (!accounts.some((a) => a.session === acc.session)) accounts.push(acc);
  }
  return accounts;
}

// 同一个脚本被两个 [Script] 条目复用：http-request 触发时只抓凭证，cron 触发时跑主流程。
async function runMain() {
  const target = ($persistentStore.read("szgh_target") || "").trim();
  const phone = ($persistentStore.read("szgh_phone") || "").trim();
  const capturedSessions = readCapturedSessions();
  const accounts = buildAccounts(phone, capturedSessions);
  if (!accounts.length) {
    console.log("未捕获到登录凭据，也未在 BoxJs 里配置 szgh_redeem_extra：请先正常打开一次深i工小程序并进入商城页面");
    $done();
    return;
  }

  let probe = null;
  for (const account of accounts) {
    const pointsResp = await getJson(account, "/snapped/getPoints?deptId=" + DEPT_ID);
    if (pointsResp.code === 200) {
      probe = account;
      break;
    }
    console.log(`[${account.remark}] 商城登录失效：${pointsResp.msg || pointsResp.message}`);
    if (account._captured) pruneCapturedSession(account.session);
  }
  if (!probe) {
    console.log("所有账号登录都已失效，请重新打开一次深i工小程序");
    $done();
    return;
  }

  const goodsList = await fetchAllGoods(probe);
  if (!goodsList.length) {
    console.log("未取到 0 元专区商品，请稍后重试");
    $done();
    return;
  }
  printGoods(goodsList);
  if (!target) {
    console.log("未设置模块参数 szgh_target，本次仅列出商品，不执行抢兑");
    $done();
    return;
  }
  const goods = selectGoods(goodsList, target);
  if (!goods) {
    console.log(`未匹配到 SKU=${target}，请填上方列表中的纯数字 SKU`);
    $done();
    return;
  }
  console.log(`已匹配目标：${goods.goodsName}（ID=${goods.id}）`);

  const logs = [];
  const log = (line) => {
    console.log(line);
    logs.push(line);
  };
  const results = await Promise.all(accounts.map((account, i) => runAccountRedeem(i + 1, account, goods, log)));
  accounts.forEach((account, i) => {
    if (results[i] === "login_invalid" && account._captured) pruneCapturedSession(account.session);
  });
  $notification.post("深i工抢兑", goods.goodsName, logs.join("\n"));
  $done();
}

(async () => {
  if (typeof $request !== "undefined") {
    captureCredentials();
  } else {
    await runMain();
  }
})().catch((e) => {
  console.log("深i工抢兑脚本异常：" + ((e && e.stack) || e));
  $done();
});
