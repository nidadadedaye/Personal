/**
 * 深i工（深圳工会小程序）每日积分任务 —— 由 shenigong_daily.py 移植。
 *
 * 配置：在 Surge 模块的「配置」界面填写参数（对应 shenigong-daily.sgmodule 的 #!arguments）：
 *   szgh_token（必填）：登录 token，来源为小程序抓包请求头 token 字段。
 *                       多账号用 & 或换行分隔，格式 token@备注；备注不要含英文逗号。
 *   szgh_card （选填，仅"阵地打卡"需要）：会员卡号，格式 备注:卡号，多个用 & 分隔；
 *                       备注需与 szgh_token 的 @备注 完全一致。
 *
 * apiId 由内置 AES-128-CBC（对齐 shenigong_daily.py 的手写实现）现算，key=iv="1234567812345678"。
 * UA 选择用简单字符串哈希代替原脚本的 MD5（Surge JS 无内置哈希 API），
 * 只用于稳定选取同一账号的 UA，不影响任务正确性。
 */

const BASE = "https://lsapp.szzgh.org:99/api";

const SIGNIN = ["sig001", 101];

const CONTENT = {
  "阅读文章": ["sig004", 104, 0],
  "分享文章": ["sig006", 106, 0],
  "观看视频": ["sig005", 105, 2],
  "收听音频": ["sig007", 108, 1],
};

const BROWSE = {
  "深工学堂": "sgxt01",
  "工匠云课堂": "lmgj01",
  "疗休养基地": "lxy01",
  "困难帮扶": "knbf01",
  "深工守护": "sgsh01",
  "法律法规": "flfw01",
  "技能竞赛": "ghjs01",
  "互助保障": "hzbz01",
  "阵地活动": "zdfw03",
};

const CATEGORIES = [
  "4BDD2459CFDE48C99C376EDA440AAEB4",
  "25C7C16BAE7D430E95F75C268BD6DBDB",
  "387AB3E2231B4DEFAE03AEFC41E1CE19",
  "3CE32FA61C224CC3A6C5ECF718C903C6",
];

const VIDEO_COLUMN = "D8C9821B50C54E7FA052AAA21EBBB301";

const CHECKIN_SEEDS = [
  [113.92896, 22.49003],
  [114.05446, 22.54327],
  [114.05957, 22.60893],
  [113.88307, 22.55366],
];
const CHECKIN_DISTANCE = 3000;

const QUIZ_PLACE_KEYS = ["sig_jf_02", "sig_jf_01"];

const UA_POOL = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.53(0x18003531) NetType/WIFI",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.60(0x18003c2f) NetType/4G",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003123) NetType/WIFI",
];

// ---------- AES-128-CBC（逐行对齐 shenigong_daily.py 的手写实现，仅加密方向，解密未用到不移植）----------

const AES_SBOX = hexToBytes(
  "637c777bf26b6fc53001672bfed7ab76ca82c97dfa5947f0add4a2af9ca472c0" +
    "b7fd9326363ff7cc34a5e5f171d8311504c723c31896059a071280e2eb27b275" +
    "09832c1a1b6e5aa0523bd6b329e32f8453d100ed20fcb15b6acbbe394a4c58cf" +
    "d0efaafb434d338545f9027f503c9fa851a3408f929d38f5bcb6da2110fff3d2" +
    "cd0c13ec5f974417c4a77e3d645d197360814fdc222a908846eeb814de5e0bdb" +
    "e0323a0a4906245cc2d3ac629195e479e7c8376d8dd54ea96c56f4ea657aae08" +
    "ba78252e1ca6b4c6e8dd741f4bbd8b8a703eb5664803f60e613557b986c11d9e" +
    "e1f8981169d98e949b1e87e9ce5528df8ca1890dbfe6426841992d0fb054bb16"
);
const AES_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function hexToBytes(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
  return out;
}

function gmul(a, b) {
  let r = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) r ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return r & 0xff;
}

function aesKeyExpansion(key) {
  const w = [];
  for (let i = 0; i < 4; i++) w.push([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]);
  for (let i = 4; i < 44; i++) {
    let t = w[i - 1].slice();
    if (i % 4 === 0) {
      t = t.slice(1).concat(t.slice(0, 1));
      t = t.map((x) => AES_SBOX[x]);
      t[0] ^= AES_RCON[i / 4 - 1];
    }
    w.push([w[i - 4][0] ^ t[0], w[i - 4][1] ^ t[1], w[i - 4][2] ^ t[2], w[i - 4][3] ^ t[3]]);
  }
  return w;
}

function aesEncryptBlock(inp, w) {
  const st = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) st[r][c] = inp[c * 4 + r];

  function addRoundKey(rnd) {
    for (let c = 0; c < 4; c++) {
      const wd = w[rnd * 4 + c];
      for (let r = 0; r < 4; r++) st[r][c] ^= wd[r];
    }
  }

  addRoundKey(0);
  for (let rnd = 1; rnd < 10; rnd++) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) st[r][c] = AES_SBOX[st[r][c]];
    for (let r = 1; r < 4; r++) st[r] = st[r].slice(r).concat(st[r].slice(0, r));
    for (let c = 0; c < 4; c++) {
      const a0 = st[0][c], a1 = st[1][c], a2 = st[2][c], a3 = st[3][c];
      st[0][c] = gmul(a0, 2) ^ gmul(a1, 3) ^ a2 ^ a3;
      st[1][c] = a0 ^ gmul(a1, 2) ^ gmul(a2, 3) ^ a3;
      st[2][c] = a0 ^ a1 ^ gmul(a2, 2) ^ gmul(a3, 3);
      st[3][c] = gmul(a0, 3) ^ a1 ^ a2 ^ gmul(a3, 2);
    }
    addRoundKey(rnd);
  }
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) st[r][c] = AES_SBOX[st[r][c]];
  for (let r = 1; r < 4; r++) st[r] = st[r].slice(r).concat(st[r].slice(0, r));
  addRoundKey(10);

  const out = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = st[r][c];
  return out;
}

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? "=" : B64_CHARS[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? "=" : B64_CHARS[b2 & 0x3f];
  }
  return out;
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

function aesEncryptCbcBase64(text, key, iv) {
  const w = aesKeyExpansion(key);
  let data = utf8Bytes(text);
  const padLen = 16 - (data.length % 16);
  data = data.concat(new Array(padLen).fill(padLen));
  let prev = iv;
  const out = [];
  for (let i = 0; i < data.length; i += 16) {
    const block = data.slice(i, i + 16).map((b, idx) => b ^ prev[idx]);
    prev = aesEncryptBlock(block, w);
    out.push.apply(out, prev);
  }
  return bytesToBase64(out);
}

const AES_KEY = utf8Bytes("1234567812345678");
const AES_IV = utf8Bytes("1234567812345678");
function apiId(sig) {
  return aesEncryptCbcBase64(sig, AES_KEY, AES_IV);
}

// ---------- 工具函数 ----------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cooldown() {
  return sleep(800 + Math.random() * 1100);
}

function pickUa(token) {
  let hash = 0;
  for (let i = 0; i < token.length; i++) hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  return UA_POOL[hash % UA_POOL.length];
}

function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function httpRequest(options) {
  return new Promise((resolve) => {
    const method = (options.method || "GET").toLowerCase();
    const fn = $httpClient[method] || $httpClient.get;
    fn.call($httpClient, options, (error, response, data) => resolve({ error, response, data }));
  });
}

async function httpJson(token, ua, path, body, method, ct) {
  method = method || "POST";
  ct = ct || "application/json";
  const headers = { token: token, "User-Agent": ua };
  let requestBody;
  if (method === "GET") {
    requestBody = undefined;
  } else if (body === null || body === undefined) {
    requestBody = "";
    headers["Content-Type"] = ct;
  } else {
    requestBody = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error, data } = await httpRequest({ url: BASE + path, method, headers, body: requestBody, timeout: 20 });
    if (!error) {
      try {
        return JSON.parse(data);
      } catch (e) {
        return { code: -1, msg: "解析响应失败", data: null };
      }
    }
    lastError = String(error);
    await sleep(1500 * (attempt + 1));
  }
  return { code: -1, msg: lastError, data: null };
}

function asList(resp) {
  const d = resp && resp.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") return d.list || d.records || d.rows || [];
  return [];
}

async function complete(token, ua, sig, bpt, pk) {
  const body = { apiId: apiId(sig), buryingPointType: bpt, systemType: 0 };
  if (pk) body.pkRelevance = pk;
  return httpJson(token, ua, "/ebs/point/pointTask/completePointTask", body);
}

async function getTasks(token, ua) {
  const tasks = {};
  for (const tid of CATEGORIES) {
    const r = await httpJson(
      token, ua, "/ebs/point/energytree/userTaskListByCategory?typeId=" + tid,
      null, "POST", "application/x-www-form-urlencoded"
    );
    for (const t of r.data || []) {
      if (t.name) tasks[t.name] = t;
    }
  }
  return tasks;
}

function singlePoint(task) {
  const sp = task.singlePoint;
  if (sp) return sp;
  const nums = [];
  const re = /(\d+)\s*积分/g;
  let m;
  const describe = task.describe || "";
  while ((m = re.exec(describe))) nums.push(parseInt(m[1], 10));
  return nums.length ? Math.min.apply(Math, nums) : 0;
}

function repsNeeded(task) {
  if (!task) return 1;
  if (task.isTaskComplete) return 0;
  const total = task.taskPointTotal || 0;
  const got = task.point || 0;
  const single = singlePoint(task);
  const remain = total - got;
  if (remain <= 0) return 1;
  if (single > 0) return Math.max(1, Math.ceil(remain / single));
  return 1;
}

async function fetchIds(token, ua, column, wantType, pages) {
  pages = pages || 5;
  const ids = [];
  for (let p = 1; p <= pages; p++) {
    const r = await httpJson(token, ua, "/ebs/ebs/operationNewsInfo/queryShowPageList", {
      titles: "", pkOperationColumn: column, page: p, limit: 10,
    });
    const items = asList(r);
    if (!items.length) break;
    for (const it of items) {
      if (it.infoType === wantType) {
        const pid = it.pkOperationNewsInfo;
        if (pid && ids.indexOf(pid) === -1) ids.push(pid);
      }
    }
  }
  return ids;
}

function taskColumn(task) {
  const link = (task && (task.appletLinkUrl || task.appLinkUrl)) || "";
  const m = /id=([0-9A-Fa-f]{20,})/.exec(link);
  return m ? m[1] : "";
}

async function contentPool(token, ua, infoType, column) {
  if (!column && infoType === 2) column = VIDEO_COLUMN;
  if (column) {
    const pool = await fetchIds(token, ua, column, infoType);
    if (pool.length) return pool;
  }
  return fetchIds(token, ua, "", infoType);
}

async function runContent(token, ua, name, task, out) {
  const def = CONTENT[name];
  const sig = def[0], bpt = def[1], itype = def[2];
  const reps = repsNeeded(task);
  if (reps === 0) {
    out.push(`  ${name}：今日已完成，跳过`);
    return;
  }
  const pool = await contentPool(token, ua, itype, taskColumn(task));
  if (!pool.length) {
    out.push(`  ${name}：未取到内容 id，跳过`);
    return;
  }
  let done = 0;
  for (const pid of pool) {
    if (done >= reps) break;
    const r = await complete(token, ua, sig, bpt, pid);
    const code = r.code;
    if (code === 0) done++;
    else if (code === 203) {
      // 该内容已领过，换下一个
    } else if (String(r.msg || "").indexOf("上限") !== -1) break;
    await cooldown();
  }
  out.push(`  ${name}：完成 ${done}/${reps}（内容池 ${pool.length}）`);
}

function memberCard(cfg, tag) {
  const cards = cfg.cards || {};
  const v = String(cards[tag] || "").trim();
  if (v) return v;
  const values = Object.values(cards);
  if (values.length === 1) return String(values[0]).trim();
  return "";
}

async function runCheckin(token, ua, task, cfg, tag, out) {
  let reps = repsNeeded(task);
  if (reps === 0) {
    out.push("阵地打卡：今日已完成，跳过");
    return;
  }
  reps = Math.min(reps, 3);
  const card = memberCard(cfg, tag);
  if (!card) {
    out.push(`阵地打卡：未配置会员卡号（token-only getUserInfo 实测 401），请在模块参数 szgh_card 配 "${tag}:<会员卡号>"`);
    return;
  }
  const seeds = cfg.seeds || CHECKIN_SEEDS;
  const city = cfg.city || "深圳市";
  const fronts = [];
  const seen = new Set();
  for (const seed of seeds) {
    if (fronts.length >= reps) break;
    const [lng, lat] = seed;
    const r = await httpJson(token, ua, "/ebs/zhzd/checkinFront/searchCheckinFronts", {
      checkinAddressLng: lng, checkinAddressLat: lat, distance: CHECKIN_DISTANCE, limit: 10, page: 1,
    });
    for (const fr of asList(r)) {
      const pkf = fr.pkFront;
      if (pkf && !seen.has(pkf) && fr.hasPointsConfig) {
        seen.add(pkf);
        fronts.push(fr);
      }
    }
    await cooldown();
  }
  if (!fronts.length) {
    out.push("阵地打卡：附近未发现可打卡阵地（可在 szgh_card/脚本内 seeds 调整搜索坐标）");
    return;
  }
  let done = 0;
  for (const fr of fronts) {
    const lng = fr.addressLng, lat = fr.addressLat;
    const r = await httpJson(token, ua, "/ebs/zhzd/checkinFront/checkin", {
      systemType: 0, checkinAddressLng: lng, checkinAddressLat: lat,
      frontAddressLng: lng, frontAddressLat: lat, pkFront: fr.pkFront,
      memberCard: card, checkinType: 3, distance: 200, city,
    });
    const d = r.data || {};
    const msg = d.pointResult || d.checkInResult || r.msg;
    const gotPoint = r.code === 0 && d.pointResult;
    if (gotPoint) done++;
    out.push(`  阵地[${String(fr.name || "").slice(0, 16)}]：${msg}`);
    await cooldown();
    if (gotPoint && String(d.pointMsg || "").indexOf("上限") !== -1 && done >= reps) break;
  }
  out.push(`阵地打卡：完成 ${done} 个阵地`);
}

async function discoverQuizActivities(token, ua) {
  const acts = [];
  const seen = new Set();
  for (const pk of QUIZ_PLACE_KEYS) {
    const r = await httpJson(token, ua, "/ebs/ebs/operation/advertising/queryShowList?placeKey=" + pk, null, "GET");
    for (const it of asList(r)) {
      const link = (it.advertisingHttps || "") + " " + (it.appSetLink || "");
      const m = /\/answer\/index\?id=([0-9A-Fa-f]+)/.exec(link);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        acts.push([it.name || m[1].slice(0, 8), m[1]]);
      }
    }
  }
  return acts;
}

async function runQuiz(token, ua, cfg, out) {
  const acts = await discoverQuizActivities(token, ua);
  if (!acts.length) {
    out.push("答题抽奖：运营位未发现答题活动");
    return;
  }
  const city = cfg.city || "深圳市";
  const street = cfg.street || "";
  const now = formatDateTime(new Date());
  out.push(`答题抽奖：发现 ${acts.length} 个活动`);
  for (const act of acts) {
    let name = act[0];
    const aid = act[1];
    const infoResp = await httpJson(token, ua, "/ebs/hd/questionActivity/getQuestionActivityInfo/" + aid, null, "GET");
    const info = infoResp.data || {};
    const title = info.title;
    if (!title) {
      out.push(`  [${name}]：活动不存在或已下架，跳过`);
      continue;
    }
    name = title;
    const begin = info.beginTime, end = info.endTime;
    if (begin && now < begin) {
      out.push(`  [${name}]：未开始（${begin} 起），跳过`);
      continue;
    }
    if (end && now > end) {
      out.push(`  [${name}]：已结束（${end} 止），跳过`);
      continue;
    }
    const answeredResp = await httpJson(token, ua, "/ebs/hd/questionActivity/userIsAnswerQuestion/" + aid, null);
    const answered = answeredResp.data === true;
    if (!answered) {
      const qs = asList(
        await httpJson(token, ua, "/ebs/hd/questionActivity/getRandomList", {
          pkQuestionActivity: aid, street, city,
        })
      );
      if (!qs.length) {
        out.push(`  [${name}]：未取到题目，跳过`);
        continue;
      }
      const answerNumber = qs[0].answerNumber;
      for (const q of qs) {
        const options = q.itemRespVoList || [{}];
        const submit = (options[0] && options[0].number) || "A";
        await httpJson(token, ua, "/ebs/hd/questionActivity/userAnswerIsCorrect", {
          type: q.type, answer: submit, id: q.id, answerNumber,
          pkQuestionLibrary: q.pkQuestionLibrary, pkQuestionActivity: aid,
        });
        await cooldown();
      }
      await httpJson(token, ua, "/ebs/hd/questionActivity/userFinishAnswer", {
        pkQuestionActivity: aid, pkLuckyDrawActivity: "", answerNumber, street, city,
      });
      out.push(`  [${name}]：答题完成 ${qs.length} 题`);
      await cooldown();
    } else {
      out.push(`  [${name}]：今日已答题`);
    }
    const lotteryResp = await httpJson(token, ua, "/ebs/hd/questionActivity/userIsLottery?pkRelevance=" + aid, null);
    if (lotteryResp.data === true) {
      out.push(`  [${name}]：今日已抽奖`);
      continue;
    }
    const dr = await httpJson(token, ua, "/ebs/hd/questionActivity/answerDrawPrize", {
      activeType: 1, channelType: 0, city, street, pkRelevance: aid,
    });
    const prize = (dr.data || {}).title;
    out.push(`  [${name}]：抽奖 → ${prize || dr.msg || "无奖"}`);
    await cooldown();
  }
}

async function runAccount(token, tag, cfg) {
  const ua = pickUa(token);
  const out = [`===== 账号[${tag}] =====`];

  const grow = await httpJson(token, ua, "/ebs/point/energytree/myGrowthStage", null, "POST", "application/x-www-form-urlencoded");
  const gd = grow.data || {};
  if (grow.code === 401 || !grow.data) {
    out.push(`token 失效或无数据，需重抓（${grow.msg || "无 data"}）`);
    return out.join("\n");
  }
  out.push(
    `等级：${gd.growthStageName || "?"}  累计积分：${gd.cumulativePoint || "?"}  距下一级还需：${gd.gapToNextPoint || "?"}分（→${gd.gapToNextStageName || "?"}）`
  );

  const p0Resp = await httpJson(token, ua, "/ebs/point/memberPoint/getUserPoint", null, "POST", "application/x-www-form-urlencoded");
  const p0 = p0Resp.data;
  out.push(`初始积分：${p0}`);

  const tasks = await getTasks(token, ua);

  if (repsNeeded(tasks["每日登录"])) {
    const r = await complete(token, ua, SIGNIN[0], SIGNIN[1]);
    out.push(`每日登录：${r.data !== undefined && r.data !== null ? r.data : r.msg}`);
    await cooldown();
  } else {
    out.push("每日登录：今日已完成");
  }

  out.push("频道浏览：");
  for (const name of Object.keys(BROWSE)) {
    if (repsNeeded(tasks[name]) === 0) {
      out.push(`  ${name}：已完成`);
      continue;
    }
    const r = await complete(token, ua, BROWSE[name], 108);
    out.push(`  ${name}：${r.data !== undefined && r.data !== null ? r.data : r.msg}`);
    await cooldown();
  }

  out.push("内容任务：");
  for (const name of ["阅读文章", "分享文章", "观看视频", "收听音频"]) {
    await runContent(token, ua, name, tasks[name], out);
  }

  if (cfg.do_checkin !== false) {
    await runCheckin(token, ua, tasks["阵地打卡"], cfg, tag, out);
  }
  if (cfg.do_quiz !== false) {
    await runQuiz(token, ua, cfg, out);
  }

  const p1Resp = await httpJson(token, ua, "/ebs/point/memberPoint/getUserPoint", null, "POST", "application/x-www-form-urlencoded");
  const p1 = p1Resp.data;
  const delta = typeof p0 === "number" && typeof p1 === "number" ? p1 - p0 : "?";
  out.push(`最终积分：${p1}（本次 +${delta}）`);
  return out.join("\n");
}

// ---------- 参数解析：$argument = "szgh_card=<...>&szgh_token=<...>"（szgh_token 放最后，值本身可含 & # @）----------

function readArguments(raw) {
  raw = raw || "";
  const marker = "&szgh_token=";
  const idx = raw.indexOf(marker);
  let cardPart = raw, tokenPart = "";
  if (idx !== -1) {
    cardPart = raw.slice(0, idx);
    tokenPart = raw.slice(idx + marker.length);
  }
  const cardMatch = /^szgh_card=([\s\S]*)$/.exec(cardPart);
  return { cardRaw: cardMatch ? cardMatch[1] : "", tokenRaw: tokenPart };
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

function parseCards(raw) {
  const cards = {};
  raw = (raw || "").trim();
  if (!raw) return cards;
  for (let item of raw.replace(/\n/g, "&").split("&")) {
    item = item.trim();
    if (!item) continue;
    const idx = item.indexOf(":");
    if (idx === -1) continue;
    const tag = item.slice(0, idx).trim();
    const card = item.slice(idx + 1).trim();
    if (tag && card) cards[tag] = card;
  }
  return cards;
}

// ---------- 入口 ----------

(async () => {
  const { cardRaw, tokenRaw } = readArguments(typeof $argument === "string" ? $argument : "");
  const accounts = parseAccounts(tokenRaw);
  if (!accounts.length) {
    console.log("未配置模块参数 szgh_token");
    $done();
    return;
  }
  const cfg = { cards: parseCards(cardRaw), city: "深圳市", seeds: CHECKIN_SEEDS, do_checkin: true, do_quiz: true };
  console.log(`共 ${accounts.length} 个账号`);
  const reports = [];
  for (const account of accounts) {
    const rep = await runAccount(account[0], account[1], cfg);
    console.log(rep);
    reports.push(rep);
    await cooldown();
  }
  $notification.post("深i工每日任务", "", reports.join("\n\n"));
  $done();
})().catch((e) => {
  console.log("每日任务脚本异常：" + ((e && e.stack) || e));
  $done();
});
