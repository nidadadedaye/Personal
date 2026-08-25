# Personal

个人维护的 [Surge](https://nssurge.com) 模块（`.sgmodule`）仓库。

## 特别声明

本仓库内容仅供个人学习和研究使用，不保证内容的合法性、准确性、有效性，使用后果自负。涉及第三方 App/服务的模块，与对应厂商没有任何关系。

## 模块列表

| 模块 | 说明 | 状态 |
| --- | --- | --- |
| [shengong-daily.sgmodule](modules/shengong-daily.sgmodule) | 深i工（深圳工会小程序）每日积分任务，打开一次小程序自动抓 token | 自动抓凭据 + BoxJs 补充 |
| [shengong-redeem.sgmodule](modules/shengong-redeem.sgmodule) | 深i工 0 元专区抢兑，定点并发下单，登录凭据自动抓，手机号/SKU 走 BoxJs | 自动抓凭据 + BoxJs 补充 |
| [niuniu.sgmodule](modules/niuniu.sgmodule) | 牛牛短剧小程序日常任务（签到/看广告/点赞/收藏/资料），打开一次小程序自动抓 token | 自动抓凭据 + BoxJs 补充 |

## 目录结构

```
.
├── modules/    # .sgmodule 模块文件，每个功能一个文件
├── scripts/    # 模块引用的 JS 脚本
├── icon/       # 模块 #!icon 字段引用的图标资源
├── boxjs.json  # BoxJs 配置描述文件
└── docs/       # 说明文档
```

## 使用方法

见 [docs/usage.md](docs/usage.md)。

## License

[MIT](LICENSE)
