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
| [example.sgmodule](modules/example.sgmodule) | 模块模板，复制后使用 | 模板 |

## 使用方法

1. 在 Surge 中打开 `设置 -> 模块`。
2. 点击右上角 `+`，粘贴对应模块文件的 raw 链接，例如：

   ```
   https://raw.githubusercontent.com/nidadadedaye/Personal/main/modules/example.sgmodule
   ```

3. 启用模块即可生效。

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
- 新增模块前先在 `modules/example.sgmodule` 基础上复制修改，保持字段顺序一致，方便对比。
- 每新增一个模块，在上方「模块列表」表格里补一行。

## License

[MIT](LICENSE)
