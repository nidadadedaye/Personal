# Personal

个人维护的 [Surge](https://nssurge.com) 模块（`.sgmodule`）仓库，用于收集/发布重写规则、脚本增强、分流规则等。

## 特别声明

本仓库内容仅供个人学习和研究使用，不保证内容的合法性、准确性、有效性，使用后果自负。涉及第三方 App/服务的模块，与对应厂商没有任何关系。

## 目录结构

```
.
├── modules/   # .sgmodule 模块文件，每个功能一个文件
├── scripts/   # 模块引用的 JS 脚本（http-request / http-response 等）
├── rules/     # 独立维护的分流规则列表（.list），供模块或配置引用
└── icon/      # 模块 #!icon 字段引用的图标资源
```

模块数量较多时，可参考 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script) 的做法，在 `modules/` 下按功能再分子目录（如 `modules/Advertising/`、`modules/Media/`），当前规模保持扁平即可。

## 模块列表

| 模块 | 说明 | 状态 |
| --- | --- | --- |
| [shenigong-daily.sgmodule](modules/shenigong-daily.sgmodule) | 深i工（深圳工会小程序）每日积分任务，需在模块参数里填自己抓包的 token | 需自行抓包 token |
| [shenigong-redeem.sgmodule](modules/shenigong-redeem.sgmodule) | 深i工 0 元专区抢兑，定点并发下单，需在模块参数里填 SKU 和抓包凭据 | 需自行抓包 token |

## 使用方法

1. 在 Surge 中打开 `设置 -> 模块`，点击右上角 `+`，粘贴模块文件的 raw 链接，例如每日任务模块：

   ```
   https://raw.githubusercontent.com/nidadadedaye/Personal/main/modules/shenigong-daily.sgmodule
   ```

2. 添加后点开该模块条目进入"配置模块"界面，会看到模块头部 `#!arguments` 声明的参数输入框，按模块自带的
   `#!arguments-desc` 说明填写真实值（比如 `szgh_token`）。这些值只保存在你本机的 Surge 配置里，**不会**
   上传到本仓库。
3. 保存并启用模块。`[Script]` 里配置的是 `type=cron` 定时任务，会按 `cronexp` 定的时间自动触发；也可以在
   Surge 的「脚本」日志面板里找到对应脚本手动点一次，立即测试、看输出。

两个 shenigong 模块的具体填参步骤：

- **shenigong-daily**（每日任务）：填 `szgh_token`（阵地打卡还要填 `szgh_card`），保存后等 `cronexp`
  （默认每天 08:17）自动跑，或在脚本面板手动点一次立即验证。
- **shenigong-redeem**（抢兑）：先把 `szgh_target` 留空、只填 `szgh_redeem`，手动跑一次，从日志打印的商品
  清单里拿到目标 SKU；把 SKU 填进 `szgh_target`，再把模块里的 `cronexp` 改成实际开抢时间前一分钟左右
  （比如 10:00 开抢改成 `"55 9 * * *"`），保存启用即可，之后每天定点自动触发。

## 模块开发约定

- 每个 `.sgmodule` 文件顶部使用标准元信息头：

  ```ini
  #!name = 模块名称
  #!desc = 模块描述
  #!category = 分类
  #!author = 作者
  #!homepage = 仓库或主页链接
  #!icon = 图标 raw 链接（可选）
  ```

- 脚本类型模块（`[Script]` 段）引用的 `.js` 文件统一放在 `scripts/` 目录下，模块内使用相对本仓库 raw 路径引用。
- 独立分流规则放在 `rules/`，命名格式为 `<用途>.list`，供 `[Rule] RULE-SET=` 或 Surge 配置直接引用。
- 图标放在 `icon/`，文件名与模块同名，通过本仓库 raw 链接在 `#!icon` 中引用。
- 新增模块时保持元信息头字段顺序与现有模块一致，方便对比（可参考 `modules/shenigong-daily.sgmodule`）。
- 每新增一个模块，在上方「模块列表」表格里补一行。
- **涉及账号 token / cookie 等私密凭据的模块，绝不硬编码进脚本文件**（仓库是公开的）。用模块头部
  `#!arguments=key=默认值` 声明参数，脚本行 `argument=key={{{key}}}` 引用，用户在 Surge App「配置模块」
  界面里填真实值，只留在用户本机，不会进 git。若一个脚本要放多个参数，把值可能含 `&`/`#`/`@` 的那个
  参数放在 `argument=` 字段**最后**，因为 Surge 只做文本替换不转义，参数值本身不能包含英文逗号
  （会打断 `.sgmodule` 脚本行自身的字段分隔），具体写法参考 `shenigong-daily.sgmodule` /
  `shenigong-redeem.sgmodule`。

## License

[MIT](LICENSE)
