/**
 * 星妈会小程序（momclub.feihe.com）签到 + 任务列表逐项完成。登录凭据自动抓取，配置见 boxjs.json。
 */

// 版本标记：出现在通知标题和 cron 日志里，用来确认设备上实际跑的是哪一版脚本
const SCRIPT_VERSION = "v3";

const BASE = "https://momclub.feihe.com";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.76(0x18004c2e) NetType/WIFI Language/zh_CN";
const REFERER = "https://servicewechat.com/wxc83b55d61c7fc51d/164/page-frame.html";

// ---------- HTTP ----------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headersFor(token) {
  return {
    cuk: "[object Undefined]",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "content-type": "application/json",
    Authorization: token,
    "Accept-Encoding": "gzip,compress,br,deflate",
    "User-Agent": UA,
    Referer: REFERER,
  };
}

function httpRequest(options) {
  return new Promise((resolve) => {
    const method = (options.method || "GET").toLowerCase();
    const fn = $httpClient[method] || $httpClient.get;
    fn.call($httpClient, options, (error, response, data) => resolve({ error, response, data }));
  });
}

async function apiGet(account, path) {
  const { error, data } = await httpRequest({
    url: BASE + path,
    method: "GET",
    headers: headersFor(account.token),
    timeout: 15,
  });
  if (error) return { success: false, msg: String(error) };
  try {
    return JSON.parse(data);
  } catch (e) {
    return { success: false, msg: "parse_error" };
  }
}

async function apiPost(account, path, body) {
  const { error, data } = await httpRequest({
    url: BASE + path,
    method: "POST",
    headers: headersFor(account.token),
    body: JSON.stringify(body),
    timeout: 15,
  });
  if (error) return { success: false, msg: String(error) };
  try {
    return JSON.parse(data);
  } catch (e) {
    return { success: false, msg: "parse_error" };
  }
}

// ---------- 业务逻辑 ----------

async function getPoints(account) {
  const resp = await apiGet(account, "/capis/c/user/memberInfo");
  return resp.data ? resp.data.points || 0 : 0;
}

async function runAccount(account) {
  const out = [`===== 用户：${account.remark} =====`];
  const before = await getPoints(account);

  const listResp = await apiGet(account, "/capis/c/activity/todo/list?mockTime=" + Date.now());
  if (!listResp.success || !listResp.data) {
    out.push(`获取任务列表失败：${listResp.msg || "登录已失效"}`);
    return out.join("\n");
  }

  const checkInTodo = listResp.data.checkInTodo;
  if (checkInTodo) {
    const joinRecord = (checkInTodo.checkInExtra && checkInTodo.checkInExtra.joinRecord) || [];
    const today = joinRecord.find((r) => r.today);
    if (today && today.joined) {
      out.push("签到：今日已签到");
    } else {
      const resp = await apiPost(account, "/capis/c/activity/todo/checkIn", {
        activityId: checkInTodo.id,
        mockTime: Date.now(),
      });
      out.push(resp.success ? `签到：成功，+${today ? today.credits : "?"}积分` : `签到：失败（${resp.message || resp.msg}）`);
    }
    await sleep(500 + Math.random() * 500);
  }

  const tasks = listResp.data.taskTodo || [];
  for (const task of tasks) {
    const extra = task.taskTodoExtra || {};
    const completeCount = Number(extra.completeCount || 0);
    const completeLimit = Number(extra.completeLimit || 0);
    if (completeLimit && completeCount >= completeLimit) {
      out.push(`${extra.title || task.name}：已完成`);
      continue;
    }
    // 真实抓包里这两个接口的调用顺序是先 receive 后 complete，原样保留。
    await apiPost(account, "/capis/c/activity/todo/receive", { activityId: task.id, mockTime: Date.now() });
    await sleep(400 + Math.random() * 400);
    const doneResp = await apiPost(account, "/capis/c/activity/todo/complete", { activityId: task.id, mockTime: Date.now() });
    out.push(doneResp.success ? `${extra.title || task.name}：完成，${extra.desc || ""}` : `${extra.title || task.name}：${doneResp.message || doneResp.msg || "未完成"}`);
    await sleep(500 + Math.random() * 500);
  }

  const after = await getPoints(account);
  out.push(`拥有：${after}积分（本次 +${after - before}）`);
  return out.join("\n");
}

// ---------- 凭证自动抓取：type=http-response 命中 /capis/c/user/memberInfo 时触发 ----------
// token 本身不稳定（同账号也可能换新），改用响应体里的 memberId 当账号身份的去重 key，
// 见到同一个 memberId 就原地更新 token，见到新的 memberId 才算新增账号，这样才能正确支持多账户。

const CAPTURED_ACCOUNTS_KEY = "xmh_accounts_captured";

function lowerCaseHeaders(headers) {
  const out = {};
  for (const k of Object.keys(headers || {})) out[k.toLowerCase()] = headers[k];
  return out;
}

// 读的时候就地清理：丢掉没有 memberId 的旧格式条目，同一个 memberId 只保留最后写入的那条。
// 这样即使存储里已经躺着旧版本留下的重复数据，也不会被当成多个账号重复跑。
function readCapturedAccounts() {
  let list;
  try {
    list = JSON.parse($persistentStore.read(CAPTURED_ACCOUNTS_KEY) || "[]");
  } catch (e) {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const byMemberId = new Map();
  for (const item of list) {
    if (item && item.memberId && item.token) byMemberId.set(item.memberId, item);
  }
  const cleaned = Array.from(byMemberId.values());
  if (cleaned.length !== list.length) {
    $persistentStore.write(JSON.stringify(cleaned), CAPTURED_ACCOUNTS_KEY);
  }
  return cleaned;
}

function writeCapturedAccounts(list) {
  $persistentStore.write(JSON.stringify(list), CAPTURED_ACCOUNTS_KEY);
}

function captureAccount() {
  const token = lowerCaseHeaders($request.headers)["authorization"];
  // 抓取失败时把中间状态写进一个可在 BoxJs 里查看的诊断 key，不依赖 console.log
  // （http-response 类型脚本的 console.log 在 Surge 界面上很难找到）。
  const diag = (stage, extra) => {
    $persistentStore.write(
      `[${new Date().toLocaleString()}] ${stage}${extra === undefined ? "" : " | " + extra}`,
      "xmh_capture_diag"
    );
  };
  const rawBody = $response.body;
  let body;
  try {
    body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
  } catch (e) {
    diag("解析body失败", String(e));
    $done({});
    return;
  }
  const data = body && body.data;
  const memberId = data && data.memberId;
  if (!token || !memberId) {
    diag("缺字段跳过", `memberId=${memberId}, body前120字=${String(rawBody).slice(0, 120)}`);
    $done({});
    return;
  }
  const nickname = data.nickname || data.memberName || "";
  const accounts = readCapturedAccounts();
  const idx = accounts.findIndex((a) => a.memberId === memberId);
  if (idx === -1) {
    accounts.push({ memberId, nickname, token });
    writeCapturedAccounts(accounts);
    $notification.post(`星妈会 ${SCRIPT_VERSION}`, "🎉新增账号", nickname || memberId);
  } else if (accounts[idx].token !== token) {
    accounts[idx].token = token;
    accounts[idx].nickname = nickname;
    writeCapturedAccounts(accounts);
    $notification.post(`星妈会 ${SCRIPT_VERSION}`, "已更新登录凭据", nickname || memberId);
  }
  $done({});
}

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
    accounts.push({ token, remark: remark.trim() || token.slice(0, 6) + "****" });
  }
  return accounts;
}

// 自动抓取的账号（按 memberId 去重，可以有多个）+ BoxJs 里手动追加的账号。
function buildAccounts() {
  const accounts = readCapturedAccounts().map((a) => ({
    token: a.token,
    remark: a.nickname || a.memberId,
    memberId: a.memberId,
  }));
  const extraRaw = $persistentStore.read("xmh_token_extra") || "";
  for (const acc of parseExtraAccounts(extraRaw)) {
    if (!accounts.some((a) => a.token === acc.token)) accounts.push(acc);
  }
  return accounts;
}


async function runMain() {
  // 早期版本用过 xmh_token_captured 这个 key，现在已经不读了，清掉避免残留数据造成困惑。
  if ($persistentStore.read("xmh_token_captured")) {
    $persistentStore.write("", "xmh_token_captured");
  }

  // cron 的日志是目前唯一确认能看到的输出通道，所以把存储现状直接打在这里，
  // 不再依赖 http-response 脚本的 console.log 或 BoxJs 界面。
  console.log(`---------- 存储诊断（脚本 ${SCRIPT_VERSION}）----------`);
  console.log(`xmh_accounts_captured = ${$persistentStore.read(CAPTURED_ACCOUNTS_KEY)}`);
  console.log(`xmh_capture_diag      = ${$persistentStore.read("xmh_capture_diag")}`);
  console.log(`xmh_token_extra       = ${$persistentStore.read("xmh_token_extra")}`);
  console.log("------------------------------");

  const accounts = buildAccounts();
  if (!accounts.length) {
    console.log("未捕获到账号，也未在 BoxJs 里配置 xmh_token_extra：请先正常打开一次星妈会小程序");
    $done();
    return;
  }
  console.log(`共 ${accounts.length} 个账号`);
  const reports = [];
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const report = await runAccount(account);
    console.log(report);
    reports.push(report);
    if (report.includes("登录已失效") && account.memberId) {
      writeCapturedAccounts(readCapturedAccounts().filter((a) => a.memberId !== account.memberId));
    }
    if (i < accounts.length - 1) await sleep(2000 + Math.random() * 3000);
  }
  $notification.post(`星妈会 ${SCRIPT_VERSION}`, "", reports.join("\n\n"));
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
  console.log("星妈会脚本异常：" + ((e && e.stack) || e));
  $done();
});
