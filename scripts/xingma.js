/**
 * 星妈优选小程序日常任务：签到、任务列表逐项完成，登录凭据自动抓取。
 * 反混淆自第三方脚本，用 Node 沙箱运行原脚本自带的签名函数确认是 MD5
 * （命中 MD5 初始状态幻数 1732584193/4023233417/2562383102/271733878），
 * 逐个接口核对请求形状后重写，未逐字保留原始（受保护的）代码。
 */

const BASE = "https://www.feihevip.com/api";
const APP_TAG = "xmyx";
const SIGN_SALT = "TwUQ01lKS1Km5zlV2f7amsZc5EQYkTbv";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.48(0x1800302b) NetType/4G Language/zh_CN";
const REFERER = "https://servicewechat.com/wx4205ec55b793245e/215/page-frame.html";

// ---------- MD5（标准实现，用于请求签名）----------

function md5(message) {
  function rotl(x, n) {
    return (x << n) | (x >>> (32 - n));
  }
  function toBytesLE(nums) {
    const bytes = [];
    for (const n of nums) {
      bytes.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
    }
    return bytes;
  }
  const K = [];
  for (let i = 0; i < 64; i++) K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0);
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const bytes = utf8Bytes(message);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const lenBytes = toBytesLE([bitLen >>> 0, Math.floor(bitLen / 0x100000000) >>> 0]);
  for (const b of lenBytes) bytes.push(b);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const M = new Array(16);
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      M[i] = bytes[j] | (bytes[j + 1] << 8) | (bytes[j + 2] << 16) | (bytes[j + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, S[i])) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  function toHexLE(n) {
    const bytes = [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
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

// ---------- 签名 ----------

function randomNonce(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function buildSign(bodyObj) {
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : "";
  const nonceStr = randomNonce(16);
  const timestamp = Math.floor(Date.now() / 1000);
  const raw = `fhAppid${APP_TAG}fhNonceStr${nonceStr}fhTimestamp${timestamp}${bodyStr}${SIGN_SALT}`;
  return { fhNonceStr: nonceStr, fhTimestamp: timestamp, fhSign: md5(raw).toUpperCase() };
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

async function apiRequest(account, method, path, params, body) {
  let url = BASE + path;
  if (params) {
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    if (qs) url += "?" + qs;
  }
  // 签名字符串里的 body 段：有 body 用 body，没有就是空字符串（哪怕是 GET+params 也一样）。
  const sign = buildSign(body);
  const options = {
    url,
    method,
    headers: {
      Host: "www.feihevip.com",
      "User-Agent": UA,
      Referer: REFERER,
      token: account.token,
      fhAppid: APP_TAG,
      source: 1,
      fhNonceStr: sign.fhNonceStr,
      fhTimestamp: sign.fhTimestamp,
      fhSign: sign.fhSign,
    },
    timeout: 15,
  };
  if (body !== undefined) {
    options.headers["content-type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const { error, data } = await httpRequest(options);
  if (error) return { code: -1, msg: String(error) };
  try {
    return JSON.parse(data);
  } catch (e) {
    return { code: -1, msg: "parse_error" };
  }
}

function apiGet(account, path, params) {
  return apiRequest(account, "GET", path, params, undefined);
}

function apiPost(account, path, body) {
  return apiRequest(account, "POST", path, undefined, body || {});
}

// ---------- 业务逻辑 ----------

async function getMemberInfo(account) {
  return apiPost(account, "/starMember/getMemberInfo", {});
}

async function getPoints(account) {
  const resp = await getMemberInfo(account);
  if (resp.code === "200" && resp.data && resp.data.memberPoints) {
    return resp.data.memberPoints.scoreValue || 0;
  }
  return 0;
}

async function runAccount(account) {
  const out = [`===== 用户：${account.userName || account.userId} =====`];

  const memberResp = await getMemberInfo(account);
  if (memberResp.code === 40001) {
    out.push("用户需要去登录");
    return out.join("\n");
  }
  const before = memberResp.data && memberResp.data.memberPoints ? memberResp.data.memberPoints.scoreValue || 0 : 0;

  const signInfo = await apiGet(account, "/member/signin/getSignInfo");
  const alreadySigned = !!(signInfo.data && signInfo.data.todaySignFlag);
  if (alreadySigned) {
    out.push("今日已签到，请勿重复执行");
  } else {
    const signResp = await apiRequest(account, "POST", "/member/signin/sign", {}, undefined);
    if (signResp.code === "200") {
      const points = signResp.data ? signResp.data.awardSendPoints : undefined;
      out.push(`签到完成, 获取积分: ${points}`);
    } else {
      out.push(`签到失败：${signResp.msg}`);
    }
  }
  await sleep(500 + Math.random() * 500);

  const taskListResp = await apiGet(account, "/member/signin/getTaskList");
  const tasks = Array.isArray(taskListResp.data)
    ? taskListResp.data.map((t) => ({ taskName: t && t.taskName, taskType: t && t.taskType }))
    : [];
  for (const task of tasks) {
    if (!task.taskType) continue;
    await apiGet(account, "/member/signin/tofinish", { taskType: task.taskType });
    await sleep(500 + Math.random() * 500);
    const doneResp = await apiGet(account, "/member/signin/completeTask", { taskType: task.taskType });
    if (doneResp.code === "200" && doneResp.data) {
      out.push(`${task.taskName}完成, 获取积分: ${doneResp.data.awardSendPoints}`);
    } else {
      out.push(`${task.taskName}未完成：${doneResp.msg || "无奖励"}`);
    }
    await sleep(500 + Math.random() * 500);
  }

  const after = await getPoints(account);
  out.push(`拥有：${after}积分（本次 +${after - before}）`);
  return out.join("\n");
}

// ---------- 凭证自动抓取：type=http-response 命中 /starMember/getMemberInfo 时触发 ----------
// token 来自请求头，userId/昵称来自响应体，两者都要靠 http-response 类型同时拿到。

const CAPTURED_ACCOUNTS_KEY = "xmyx_accounts_captured";

function lowerCaseHeaders(headers) {
  const out = {};
  for (const k of Object.keys(headers || {})) out[k.toLowerCase()] = headers[k];
  return out;
}

function readCapturedAccounts() {
  try {
    const list = JSON.parse($persistentStore.read(CAPTURED_ACCOUNTS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeCapturedAccounts(list) {
  $persistentStore.write(JSON.stringify(list), CAPTURED_ACCOUNTS_KEY);
}

function captureAccount() {
  const token = lowerCaseHeaders($request.headers)["token"];
  let body;
  try {
    body = JSON.parse($response.body);
  } catch (e) {
    $done({});
    return;
  }
  const data = body && body.data;
  const userId = data && data.unionId;
  const userName = data && data.baseInfo && data.baseInfo.nickName;
  if (!token || !userId) {
    $done({});
    return;
  }
  const accounts = readCapturedAccounts();
  const idx = accounts.findIndex((a) => a.userId === userId);
  if (idx === -1) {
    accounts.push({ userId, userName, token });
    writeCapturedAccounts(accounts);
    $notification.post("星妈优选", "🎉新增用户", `${userName || userId} 已自动抓取`);
  } else if (accounts[idx].token !== token) {
    accounts[idx].token = token;
    accounts[idx].userName = userName;
    writeCapturedAccounts(accounts);
    $notification.post("星妈优选", "已更新登录凭据", userName || userId);
  }
  $done({});
}

// 自动抓取的账号 + BoxJs 里手动追加的账号（格式 token@备注，userId 用备注代替），按 token 去重。
function parseExtraAccounts(raw) {
  const accounts = [];
  raw = (raw || "").trim();
  if (!raw) return accounts;
  for (let item of raw.replace(/\n/g, "&").split("&")) {
    item = item.trim();
    if (!item) continue;
    const atIdx = item.indexOf("@");
    let token = item, remark = "";
    if (atIdx !== -1) {
      token = item.slice(0, atIdx);
      remark = item.slice(atIdx + 1);
    }
    token = token.trim();
    if (!token) continue;
    accounts.push({ userId: remark.trim() || token.slice(0, 6) + "****", userName: remark.trim(), token });
  }
  return accounts;
}

function buildAccounts() {
  const accounts = readCapturedAccounts().slice();
  const extraRaw = $persistentStore.read("xmyx_extra") || "";
  for (const acc of parseExtraAccounts(extraRaw)) {
    if (!accounts.some((a) => a.token === acc.token)) accounts.push(acc);
  }
  return accounts;
}

async function runMain() {
  const accounts = buildAccounts();
  if (!accounts.length) {
    console.log("未捕获到账号，也未在 BoxJs 里配置 xmyx_extra：请先正常打开一次星妈优选小程序完成登录");
    $done();
    return;
  }
  console.log(`共 ${accounts.length} 个账号`);
  const reports = [];
  for (let i = 0; i < accounts.length; i++) {
    const report = await runAccount(accounts[i]);
    console.log(report);
    reports.push(report);
    if (i < accounts.length - 1) await sleep(2000 + Math.random() * 3000);
  }
  $notification.post("星妈优选", "", reports.join("\n\n"));
  $done();
}

// 同一个脚本被两个 [Script] 条目复用：http-response 触发时只抓凭证，cron 触发时跑主流程。
(async () => {
  if (typeof $response !== "undefined") {
    captureAccount();
  } else {
    await runMain();
  }
})().catch((e) => {
  console.log("星妈优选脚本异常：" + ((e && e.stack) || e));
  $done();
});
