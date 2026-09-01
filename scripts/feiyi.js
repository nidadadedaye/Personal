/**
 * 飞蚁回收小程序日常任务：签到、步数兑换(3次)、打卡、投注，登录凭据自动抓取。
 * 反混淆自 xzxxn777/scripts 仓库的 FYHS.js，已用 Node 沙箱执行原脚本自带的字符串解码器
 * 逐个还原全部混淆调用，并核对了每个接口的请求体字段，未逐字保留原始（受保护的）代码。
 */

const BASE = "https://openapp.fmy90.com";
const VERSION = "V2.00.01";
const PLATFORM_KEY = "F2EE24892FBF66F0AFF8C0EB532A9394";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.52(0x18003421) NetType/4G Language/zh_CN";

// ---------- 工具函数 ----------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function baseBody(extra) {
  return Object.assign(
    { version: VERSION, platformKey: PLATFORM_KEY, mini_scene: 1089, partner_ext_infos: "" },
    extra || {}
  );
}

function httpRequest(options) {
  return new Promise((resolve) => {
    const method = (options.method || "GET").toLowerCase();
    const fn = $httpClient[method] || $httpClient.get;
    fn.call($httpClient, options, (error, response, data) => resolve({ error, response, data }));
  });
}

// GET path（path 自带查询字符串）
async function apiGet(account, path) {
  const { error, data } = await httpRequest({
    url: BASE + path,
    method: "GET",
    headers: {
      "Accept-Encoding": "gzip,compress,br,deflate",
      Connection: "keep-alive",
      "User-Agent": UA,
      Authorization: account.token,
    },
    timeout: 15,
  });
  if (error) return { code: -1, msg: String(error) };
  try {
    return JSON.parse(data);
  } catch (e) {
    return { code: -1, msg: "parse_error" };
  }
}

// POST path，body 是 baseBody() 基础上再合并 extra 字段
async function apiPost(account, path, extra) {
  const { error, data } = await httpRequest({
    url: BASE + path,
    method: "POST",
    headers: {
      "Accept-Encoding": "gzip,compress,br,deflate",
      Connection: "keep-alive",
      "User-Agent": UA,
      Authorization: account.token,
      "content-type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify(baseBody(extra)),
    timeout: 15,
  });
  if (error) return { code: -1, msg: String(error) };
  try {
    return JSON.parse(data);
  } catch (e) {
    return { code: -1, msg: "parse_error" };
  }
}

// ---------- 业务逻辑 ----------

async function runAccount(account) {
  const out = [`用户：${account.phone}开始任务`];

  const signResp = await apiPost(account, "/sign/new/do");
  out.push(`签到：${signResp.message}`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const stepResp = await apiPost(account, "/step/exchange", { steps: 1720 });
    out.push(`第${attempt}次步数兑换：${stepResp.message}`);
    if (stepResp.code === 400) break;
  }

  const signInResp = await apiPost(account, "/active/pool/sign");
  out.push(`打卡：${signInResp.message}`);

  const betResp = await apiPost(account, "/active/pool/bet");
  out.push(`投注：${betResp.message}`);

  const beansQuery = `?type=%d&version=${VERSION}&platformKey=${PLATFORM_KEY}&mini_scene=1089&partner_ext_infos=`;
  const before = await apiGet(account, "/user/new/beans/info" + beansQuery.replace("%d", "1"));
  const after = await apiGet(account, "/user/new/beans/info" + beansQuery.replace("%d", "2"));
  const gained = (after.data ? after.data.totalCount : 0) - (before.data ? before.data.totalCount : 0);
  out.push(`拥有：${gained}积分`);

  return { phone: account.phone, report: out.join("\n") };
}

// ---------- 凭证自动抓取：type=http-response 命中 /auth/wx/login 的响应体时触发 ----------

const CAPTURED_ACCOUNTS_KEY = "fyhs_accounts_captured";

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
  let body;
  try {
    body = JSON.parse($response.body);
  } catch (e) {
    $done({});
    return;
  }
  const data = body && body.data;
  const phone = data && data.user && data.user.userPhone;
  const rawToken = data && data.token;
  if (!phone || !rawToken) {
    $done({});
    return;
  }
  const token = "bearer " + rawToken;
  const accounts = readCapturedAccounts();
  const idx = accounts.findIndex((a) => a.phone === phone);
  if (idx === -1) {
    accounts.push({ phone, token });
    writeCapturedAccounts(accounts);
    $notification.post("飞蚁回收", "🎉新增用户", `${phone} 已自动抓取`);
  } else if (accounts[idx].token !== token) {
    accounts[idx].token = token;
    writeCapturedAccounts(accounts);
    $notification.post("飞蚁回收", "已更新登录凭据", phone);
  }
  $done({});
}

// 自动抓取的账号 + BoxJs 里手动追加的账号（格式 phone#token@备注），按手机号去重。
function parseExtraAccounts(raw) {
  const accounts = [];
  raw = (raw || "").trim();
  if (!raw) return accounts;
  for (let item of raw.replace(/\n/g, "&").split("&")) {
    item = item.trim();
    if (!item) continue;
    const idx = item.indexOf("#");
    if (idx === -1) continue;
    const phone = item.slice(0, idx).trim();
    let rest = item.slice(idx + 1).trim();
    const atIdx = rest.indexOf("@");
    let token = rest;
    if (atIdx !== -1) token = rest.slice(0, atIdx).trim();
    if (!phone || !token) continue;
    accounts.push({ phone, token: token.startsWith("bearer ") ? token : "bearer " + token });
  }
  return accounts;
}

function buildAccounts() {
  const accounts = readCapturedAccounts().slice();
  const extraRaw = $persistentStore.read("fyhs_extra") || "";
  for (const acc of parseExtraAccounts(extraRaw)) {
    if (!accounts.some((a) => a.phone === acc.phone)) accounts.push(acc);
  }
  return accounts;
}

async function runMain() {
  const accounts = buildAccounts();
  if (!accounts.length) {
    console.log("未捕获到账号，也未在 BoxJs 里配置 fyhs_extra：请先正常打开一次飞蚁回收小程序完成登录");
    $done();
    return;
  }
  console.log(`共 ${accounts.length} 个账号`);
  const reports = [];
  for (let i = 0; i < accounts.length; i++) {
    const { report } = await runAccount(accounts[i]);
    console.log(report);
    reports.push(report);
    if (i < accounts.length - 1) await sleep(2000 + Math.random() * 3000);
  }
  $notification.post("飞蚁回收", "", reports.join("\n\n"));
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
  console.log("飞蚁回收脚本异常：" + ((e && e.stack) || e));
  $done();
});
