# 使用方法

## 添加模块

在 Surge 中打开 `设置 -> 模块`，点击右上角 `+`，粘贴模块文件的 raw 链接，例如每日任务模块：

```
https://raw.githubusercontent.com/nidadadedaye/Personal/main/modules/shengong-daily.sgmodule
```

保存并启用模块。`[Script]` 里是一个 `type=cron`（跑正式任务）加一个挂在 `[MITM]` 拦截域名上的
`type=http-request`（负责自动抓取登录凭据），两个条目复用同一个脚本文件。也可以在 Surge 的「脚本」
日志面板里找到对应脚本手动点一次，立即测试、看输出。

## 配合 BoxJs 填自动抓不到的字段

自动抓不到的少数字段（手机号、会员卡号、额外账号）配合 [BoxJs](https://docs.boxjs.app/) 填写：在
BoxJs 里订阅本仓库的设置描述文件：

```
https://raw.githubusercontent.com/nidadadedaye/Personal/main/boxjs.json
```

订阅后 BoxJs 面板会出现对应模块的表单，填的值直接写进 Surge 的 `$persistentStore`，脚本下次运行就能
读到；同样只存在你本机，不会进本仓库。

两个模块都用 `[MITM]` + `type=http-request` 做自动抓取，前提是 Surge 已经安装好 MITM 证书并整体启用了
MITM 功能（Surge 首次配置时的标准步骤，不是这两个模块特有的）。

## 深i工·每日任务

启用模块后正常打开一次深i工小程序（发出任意请求即可，不需要真的做任务），脚本自动抓 token 并存起来，
之后每天 `cronexp`（默认 08:17）自动跑，token 过期了再打开一次小程序会自动刷新。最多同时保留 3 个自动
抓取的账号（比如换过 WeChat 账号），失效的会自动清掉。

- 阵地打卡需要在 BoxJs 里填 `szgh_card`（会员卡号）
- `szgh_token_extra` 只有想加自动抓不到的其他账号（比如家人的）时才需要填

## 深i工·0元专区抢兑

启用模块后正常打开一次深i工小程序并进入过商城页面，脚本自动抓 JSESSIONID / csrf-token。

1. 在 BoxJs 里填 `szgh_phone`（仅虚拟商品下单要用）
2. `szgh_target` 先留空，在脚本面板手动跑一次，从日志打印的商品清单里拿到目标 SKU，回填到 BoxJs 里
3. 把模块里的 `cronexp` 改成实际开抢时间前一分钟左右（比如 10:00 开抢改成 `"55 9 * * *"`），保存启用

`szgh_redeem_extra` 同样只在要追加抓不到的其他账号时才需要填。

## 新增模块时的约定

- 元信息头 `#!key=value` 两边不能有空格（`#!name = x` 会导致 Surge 解析不出模块名，显示为空白）。
- 脚本文件放 `scripts/`，图标放 `icon/`（文件名与模块同名），都用本仓库 raw 链接引用。
- 涉及账号 token / cookie 等私密凭据的模块，优先用 `[MITM]` + `type=http-request` 从流量里自动抓取、
  写入 `$persistentStore`（同一个脚本文件被 `type=cron` 和 `type=http-request` 两个 `[Script]` 条目
  复用，靠 `typeof $request !== "undefined"` 判断走哪条路径，参考 `shengong-daily.sgmodule` /
  `scripts/shengong_daily.js`）。抓不到的字段配合 [BoxJs](https://docs.boxjs.app/) 提供表单：把对应
  `$persistentStore` key 加进 `boxjs.json` 的 `apps[].settings[]`，脚本直接 `$persistentStore.read(key)`
  读取——不用 Surge 自带的 `#!arguments`，那套机制是纯文本替换、不转义，容易和 `.sgmodule` 自身的逗号/
  `&` 语法冲突。
- 新增模块后，在根目录 README 的「模块列表」表格里补一行。
