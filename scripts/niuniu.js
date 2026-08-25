/**
 * 牛牛短剧小程序日常任务。token 自动抓取，配置见 boxjs.json。
 */

const BASE = "https://api.tianjinzhitongdaohe.com/sqx_fast";
const APP_ID = "wxcb95401f250e9a53";

const UA_POOL = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.47(0x18002f2d) NetType/WIFI Language/zh_CN",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2d) NetType/WIFI Language/zh_CN",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.43(0x18002b2d) NetType/4G Language/zh_CN",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.47(0x28002f35) NetType/WIFI Language/zh_CN",
  "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.44(0x28002c35) NetType/WIFI Language/zh_CN",
];

const LOOK_MILESTONES = [3, 5, 8, 10, 12, 15, 20];
const MAX_DAILY_ADS = 20;

// ---------- 工具函数 ----------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanDelay(loSec, hiSec) {
  return sleep((loSec + Math.random() * (hiSec - loSec)) * 1000);
}

function pickUa(token) {
  let hash = 0;
  for (let i = 0; i < token.length; i++) hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  return UA_POOL[hash % UA_POOL.length];
}

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Decode(b64) {
  b64 = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = [];
  for (let i = 0; i < b64.length; i += 4) {
    const c0 = B64_CHARS.indexOf(b64[i]);
    const c1 = B64_CHARS.indexOf(b64[i + 1]);
    const c2 = i + 2 < b64.length ? B64_CHARS.indexOf(b64[i + 2]) : -1;
    const c3 = i + 3 < b64.length ? B64_CHARS.indexOf(b64[i + 3]) : -1;
    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) bytes.push(((c1 & 0xf) << 4) | (c2 >> 2));
    if (c3 >= 0) bytes.push(((c2 & 0x3) << 6) | c3);
  }
  return bytes;
}

function bytesToUtf8(bytes) {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if ((b0 & 0xe0) === 0xc0) {
      const b1 = bytes[i++];
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
    } else if ((b0 & 0xf0) === 0xe0) {
      const b1 = bytes[i++], b2 = bytes[i++];
      out += String.fromCharCode(((b0 & 0xf) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
    } else {
      const b1 = bytes[i++], b2 = bytes[i++], b3 = bytes[i++];
      const cp = ((b0 & 0x7) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

function parseJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return {};
    return JSON.parse(bytesToUtf8(base64Decode(parts[1])));
  } catch (e) {
    return {};
  }
}

function checkTokenExpiry(token, log) {
  const payload = parseJwtPayload(token);
  const exp = payload.exp;
  if (exp === undefined) return true;
  const remaining = exp - Date.now() / 1000;
  if (remaining <= 0) {
    log("❌ token已过期!");
    return false;
  }
  const hours = remaining / 3600;
  log(`token ${hours.toFixed(1)}h(${(hours / 24).toFixed(1)}天)`);
  if (hours < 24) log("⚠ 即将过期，请更新!");
  return true;
}

// ---------- HTTP ----------

function httpRequest(options) {
  return new Promise((resolve) => {
    const method = (options.method || "GET").toLowerCase();
    const fn = $httpClient[method] || $httpClient.get;
    fn.call($httpClient, options, (error, response, data) => resolve({ error, response, data }));
  });
}

function headersFor(token, ua) {
  return {
    "user-agent": ua,
    xweb_xhr: "1",
    "content-type": "application/json",
    token,
    accept: "*/*",
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    referer: `https://servicewechat.com/${APP_ID}/19/page-frame.html`,
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "zh-CN,zh;q=0.9",
  };
}

async function apiRequest(account, method, path, params, body) {
  let url = BASE + path;
  if (method === "GET" && params) {
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    if (qs) url += "?" + qs;
  }
  const options = { url, method, headers: headersFor(account.token, account.ua), timeout: 15 };
  if (method === "POST" && body !== undefined) options.body = JSON.stringify(body);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error, response, data } = await httpRequest(options);
    if (!error) {
      if (response && (response.status === 401 || response.status === 403)) {
        return { code: response.status, msg: "auth_failed" };
      }
      try {
        return JSON.parse(data);
      } catch (e) {
        return { code: -1, msg: "parse_error" };
      }
    }
    if (attempt < 3) await sleep(Math.min(2 ** attempt, 30) * 1000 * (0.7 + Math.random() * 0.6));
  }
  return { code: -1, msg: "max_retries" };
}

function apiGet(account, path, params) {
  return apiRequest(account, "GET", path, params);
}

function apiPost(account, path, body) {
  return apiRequest(account, "POST", path, undefined, body);
}

// ---------- 业务逻辑 ----------

async function refreshUserInfo(account) {
  const resp = await apiGet(account, "/app/user/selectUserById");
  if (resp.code === 0 && resp.data) {
    account.userInfo = resp.data;
    return account.userInfo;
  }
  return null;
}

async function getUserInfo(account, log) {
  const user = await refreshUserInfo(account);
  if (user) {
    log(`${user.userName || "N/A"} | ID:${user.userId} | 邀请:${user.invitationCode || "N/A"}`);
    return user;
  }
  log("获取用户信息失败");
  return null;
}

function statusLine(account) {
  const u = account.userInfo || {};
  const ad = u.lookDayVideoNum || 0;
  const fmt = (done, need) => (!need ? "—" : done >= need ? `✅${done}/${need}` : `❌${done}/${need}`);
  const adStr = ad >= MAX_DAILY_ADS ? `✅${ad}/${MAX_DAILY_ADS}` : `⏳${ad}/${MAX_DAILY_ADS}`;
  return `状态: 广告${adStr} 点赞${fmt(u.okGoodVideo || 0, u.goodVideo)} 收藏${fmt(u.okCollectVideo || 0, u.collectVideo)} 资料${fmt(u.okUserDataVideo || 0, u.userDataVideo)}`;
}

async function fetchEatGoldConfig(account) {
  const resp = await apiGet(account, "/app/common/type/933");
  if (resp.code === 0 && resp.data && resp.data.value) {
    account.eatWindows = resp.data.value
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
  }
}

async function getCoins(account) {
  const resp = await apiGet(account, "/app/integral/selectByUserId");
  if (resp.code === 0 && resp.data) return resp.data.integralNum || 0;
  return 0;
}

async function signIn(account, log) {
  const resp = await apiGet(account, "/app/integral/signIn", { date: formatDate(new Date()) });
  const code = resp.code, msg = resp.msg || "";
  if (code === 0) {
    log(`签到 ✓ ${msg}`);
    return true;
  }
  if (msg.includes("已经签到") || msg.includes("已签到") || msg.includes("重复")) {
    log("签到 ✓ 已签到");
    return true;
  }
  log(`签到 ✗ ${msg}`);
  return false;
}

async function fetchCourseSamples(account, count) {
  const resp = await apiGet(account, "/app/course/selectCourseDetailsList", {
    page: 1, limit: count || 5, randomNum: Math.floor(Math.random() * 100),
  });
  const courses = [];
  if (resp.code === 0 && resp.data && resp.data.list) {
    for (const item of resp.data.list) {
      courses.push({ courseId: String(item.courseId || ""), courseDetailsId: String(item.courseDetailsId || "") });
    }
  }
  return courses;
}

async function doCollectAction(account, classify, name, log) {
  const needField = classify === 1 ? "collectVideo" : "goodVideo";
  const doneField = classify === 1 ? "okCollectVideo" : "okGoodVideo";
  const u = account.userInfo || {};
  const need = u[needField], done = u[doneField];
  if (need != null && need > 0 && done != null && done >= need) {
    log(`${name} ✓ 已完成(${done}/${need})`);
    return true;
  }

  const courses = await fetchCourseSamples(account, 5);
  if (!courses.length) {
    log(`${name} ✗ 无可用视频`);
    return false;
  }

  for (const c of courses) {
    await apiPost(account, "/app/courseCollect/insertCourseCollect", {
      courseId: c.courseId, courseDetailsId: c.courseDetailsId, classify: 3, type: 1,
    });
    await humanDelay(0.3, 0.8);
  }

  let success = 0;
  for (const c of courses) {
    const resp = await apiPost(account, "/app/courseCollect/insertCourseCollect", {
      courseId: c.courseId, courseDetailsId: c.courseDetailsId, classify, type: 1,
    });
    if (resp.code === 0) success++;
    await humanDelay(0.5, 1.5);
  }

  await humanDelay(2.0, 3.0);

  const rewardPath = classify === 1 ? "/app/integral/collectVideo" : "/app/integral/goodVideo";
  let rewardOk = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const reward = await apiGet(account, rewardPath);
    if (reward.code === 0) {
      log(`${name} ✓ ${success}次操作完成`);
      rewardOk = true;
      break;
    }
    if (attempt < 2) await sleep((3 + Math.random() * 3) * 1000);
    else log(`${name} ✗ ${reward.msg || ""}`);
  }

  if (!rewardOk && success > 0) {
    await humanDelay(1.0, 2.0);
    await refreshUserInfo(account);
    const nu = account.userInfo || {};
    const newNeed = nu[needField], newDone = nu[doneField];
    if (newNeed && newDone != null && newDone >= newNeed) {
      log(`${name} ✓ 服务端已更新(${newDone}/${newNeed})`);
      return true;
    }
  }
  return rewardOk;
}

async function doLike(account, log) {
  return doCollectAction(account, 2, "点赞", log);
}

async function doCollect(account, log) {
  return doCollectAction(account, 1, "收藏", log);
}

async function doProfile(account, log) {
  const u = account.userInfo || {};
  const need = u.userDataVideo, done = u.okUserDataVideo;
  if (need == null || need === 0) {
    log("资料 — 无任务");
    return true;
  }
  if (done != null && done >= need) {
    log(`资料 ✓ 已完成(${done}/${need})`);
    return true;
  }
  const resp = await apiPost(account, "/app/user/updateUsers", {
    userName: u.userName || "用户", avatar: u.avatar || "", phone: u.phone || "",
  });
  if (resp.code === 0) {
    await humanDelay(1.0, 2.0);
    const reward = await apiGet(account, "/app/integral/userDataVideo");
    if (reward.code === 0) {
      log("资料 ✓ 更新完成");
      return true;
    }
    log(`资料 ✗ ${reward.msg || ""}`);
    return false;
  }
  log(`资料 ✗ ${resp.msg || ""}`);
  return false;
}

async function runAdWatch(account, log) {
  const already = account.userInfo.lookDayVideoNum || 0;
  if (already >= MAX_DAILY_ADS) {
    log(`广告 ✓ 已看完${already}/${MAX_DAILY_ADS}`);
    return;
  }
  let totalWatched = 0, totalClaimed = 0;
  for (const milestone of LOOK_MILESTONES) {
    if (already + totalWatched >= MAX_DAILY_ADS) break;
    if (already + totalWatched >= milestone) continue;
    const need = milestone - (already + totalWatched);
    const canWatch = MAX_DAILY_ADS - already - totalWatched;
    const watchCount = Math.min(need, canWatch);
    if (watchCount <= 0) continue;

    let successCount = 0;
    for (let i = 0; i < watchCount; i++) {
      const resp = await apiGet(account, "/app/integral/addLookVideoNum");
      if (resp.code === 0) {
        successCount++;
        totalWatched++;
        account.userInfo.lookDayVideoNum = already + totalWatched;
      } else {
        const msg = resp.msg || "";
        if (msg.includes("上限") || msg.includes("次数")) break;
      }
      await humanDelay(2.0, 4.0);
    }
    if (successCount > 0) {
      await humanDelay(1.5, 3.0);
      const rewardResp = await apiGet(account, "/app/integral/lookVideoNum");
      if (rewardResp.code === 0) totalClaimed++;
    }
    await humanDelay(1.0, 2.0);
  }
  log(`广告 ✓ +${totalWatched}次 里程碑×${totalClaimed} 总计${already + totalWatched}/${MAX_DAILY_ADS}`);
}

async function eatGold(account, log) {
  const now = new Date();
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  for (const window of account.eatWindows) {
    if (!window.includes("-")) continue;
    const [start, end] = window.split("-");
    if (start <= current && current <= end) {
      const resp = await apiGet(account, "/app/integral/eatGold");
      const code = resp.code, msg = resp.msg || "";
      if (code === 0) {
        log(`饭补 ✓ ${msg}`);
        return true;
      }
      if (msg.includes("已领")) {
        log("饭补 ✓ 已领取");
        return true;
      }
      log(`饭补 ✗ ${msg}`);
      return false;
    }
  }
  log(`饭补 — ${current}不在时段`);
  return false;
}

async function userTimer(account, log) {
  const resp = await apiGet(account, "/app/integral/userTimer");
  const code = resp.code, msg = resp.msg || "", data = resp.data;
  if (code === 0) {
    log(`宝箱 ✓ +${data || msg}金`);
    return true;
  }
  if (msg.includes("已领")) {
    log("宝箱 ✓ 已领取");
    return true;
  }
  log(`宝箱 ✗ ${msg}`);
  return false;
}

async function runAccount(token, remark) {
  const account = { token, remark, ua: pickUa(token), userInfo: {}, eatWindows: [] };
  const out = [`===== 账号[${remark}] =====`];
  const log = (line) => out.push(line);

  if (!checkTokenExpiry(token, log)) return out.join("\n");

  const user = await getUserInfo(account, log);
  if (!user) return out.join("\n");

  const initCoins = await getCoins(account);
  await fetchEatGoldConfig(account);

  await signIn(account, log);
  await humanDelay(0.3, 0.8);
  await userTimer(account, log);
  await humanDelay(0.3, 0.8);
  await eatGold(account, log);
  await humanDelay(0.5, 1.0);
  await runAdWatch(account, log);
  await humanDelay(0.5, 1.0);
  await doLike(account, log);
  await humanDelay(0.3, 0.8);
  await doCollect(account, log);
  await humanDelay(0.3, 0.8);
  await doProfile(account, log);

  await humanDelay(0.5, 1.0);
  await refreshUserInfo(account);
  out.push(statusLine(account));

  const finalCoins = await getCoins(account);
  out.push(`收益 +${finalCoins - initCoins}金 总计${finalCoins}金`);
  return out.join("\n");
}

// ---------- 凭证自动抓取 ----------

const CAPTURED_TOKENS_KEY = "nn_token_captured";
const MAX_CAPTURED_TOKENS = 3;

function lowerCaseHeaders(headers) {
  const out = {};
  for (const k of Object.keys(headers || {})) out[k.toLowerCase()] = headers[k];
  return out;
}

function readCapturedTokens() {
  try {
    const list = JSON.parse($persistentStore.read(CAPTURED_TOKENS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function writeCapturedTokens(tokens) {
  $persistentStore.write(JSON.stringify(tokens), CAPTURED_TOKENS_KEY);
}

function captureToken() {
  const token = lowerCaseHeaders($request.headers)["token"];
  if (!token) {
    $done({});
    return;
  }
  const tokens = readCapturedTokens();
  if (!tokens.includes(token)) {
    tokens.push(token);
    while (tokens.length > MAX_CAPTURED_TOKENS) tokens.shift();
    writeCapturedTokens(tokens);
    $notification.post("牛牛短剧", "已自动抓取新账号", `当前共 ${tokens.length} 个自动抓取账号`);
  }
  $done({});
}

function parseAccounts(raw) {
  const accounts = [];
  raw = (raw || "").trim();
  if (!raw) return accounts;
  for (let item of raw.replace(/\n/g, "&").split("&")) {
    item = item.trim();
    if (!item) continue;
    const atIdx = item.indexOf("@");
    let tok = item, tag = "";
    if (atIdx !== -1) {
      tok = item.slice(0, atIdx);
      tag = item.slice(atIdx + 1);
    }
    tok = tok.trim();
    tag = tag.trim() || tok.slice(0, 6) + "****";
    accounts.push([tok, tag]);
  }
  return accounts;
}

// 自动抓取的账号（最多同时保留 MAX_CAPTURED_TOKENS 个，跑失败的会被清掉）+ BoxJs 里手动追加的账号。
function buildAccounts(capturedTokens) {
  const accounts = capturedTokens.map((token, i) => [
    token,
    capturedTokens.length > 1 ? `本机自动抓取${i + 1}` : "本机自动抓取",
  ]);
  const extraRaw = $persistentStore.read("nn_token_extra") || "";
  for (const acc of parseAccounts(extraRaw)) {
    if (!accounts.some((a) => a[0] === acc[0])) accounts.push(acc);
  }
  return accounts;
}

async function runMain() {
  const capturedTokens = readCapturedTokens();
  const accounts = buildAccounts(capturedTokens);
  if (!accounts.length) {
    console.log("未捕获到 token，也未在 BoxJs 里配置 nn_token_extra：请先正常打开一次牛牛短剧小程序，或在 BoxJs 里手动填账号");
    $done();
    return;
  }
  console.log(`共 ${accounts.length} 个账号`);
  const reports = [];
  for (let i = 0; i < accounts.length; i++) {
    const [token, tag] = accounts[i];
    const rep = await runAccount(token, tag);
    console.log(rep);
    reports.push(rep);
    if (rep.includes("token已过期") && capturedTokens.includes(token)) {
      writeCapturedTokens(readCapturedTokens().filter((t) => t !== token));
    }
    if (i < accounts.length - 1) await sleep((5 + Math.random() * 10) * 1000);
  }
  $notification.post("牛牛短剧", "", reports.join("\n\n"));
  $done();
}

// 同一个脚本被两个 [Script] 条目复用：http-request 触发时只抓凭证，cron 触发时跑主流程。
(async () => {
  if (typeof $request !== "undefined") {
    captureToken();
  } else {
    await runMain();
  }
})().catch((e) => {
  console.log("牛牛短剧脚本异常：" + ((e && e.stack) || e));
  $done();
});
