/**
 * 星妈会小程序（momclub.feihe.com）签到 + 任务列表逐项完成。登录凭据自动抓取，配置见 boxjs.json。
 */

const BASE = "https://momclub.feihe.com";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.76(0x18004c2e) NetType/WIFI Language/zh_CN";
const REFERER = "https://servicewechat.com/wxc83b55d61c7fc51d/164/page-frame.html";

// ---------- HTTP ----------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headersFor(token) {
  return {
    Host: "momclub.feihe.com",
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

// ---------- 凭证自动抓取：type=http-request 命中 momclub.feihe.com 的请求时触发 ----------

const CAPTURED_TOKENS_KEY = "xmh_token_captured";

function lowerCaseHeaders(headers) {
  const out = {};
  for (const k of Object.keys(headers || {})) out[k.toLowerCase()] = headers[k];
  return out;
}

function readCapturedToken() {
  return $persistentStore.read(CAPTURED_TOKENS_KEY) || "";
}

function writeCapturedToken(token) {
  $persistentStore.write(token, CAPTURED_TOKENS_KEY);
}

// 这个 App 的 Authorization 不是长期稳定的会话 token（同一账号登录也可能换新），
// 所以只保留"最新一个"，不做多账号数组——避免把同一账号的新旧 token 误判成两个账号。
function captureToken() {
  const token = lowerCaseHeaders($request.headers)["authorization"];
  if (!token) {
    $done({});
    return;
  }
  if (token !== readCapturedToken()) {
    writeCapturedToken(token);
    $notification.post("星妈会", "已自动抓取/更新账号", "");
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

// 自动抓取的账号（只有一个）+ BoxJs 里手动追加的账号（真正的其他家庭成员账号）。
function buildAccounts(capturedToken) {
  const accounts = [];
  if (capturedToken) accounts.push({ token: capturedToken, remark: "本机自动抓取" });
  const extraRaw = $persistentStore.read("xmh_token_extra") || "";
  for (const acc of parseExtraAccounts(extraRaw)) {
    if (!accounts.some((a) => a.token === acc.token)) accounts.push(acc);
  }
  return accounts;
}

async function runMain() {
  const capturedToken = readCapturedToken();
  const accounts = buildAccounts(capturedToken);
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
    if (report.includes("登录已失效") && account.token === capturedToken) {
      writeCapturedToken("");
    }
    if (i < accounts.length - 1) await sleep(2000 + Math.random() * 3000);
  }
  $notification.post("星妈会", "", reports.join("\n\n"));
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
  console.log("星妈会脚本异常：" + ((e && e.stack) || e));
  $done();
});
