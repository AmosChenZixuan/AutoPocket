# autopocket

自托管的个人财务自动驾驶：开源工具同步账户和交易，自研的规划服务按你定的优先级（还债 → 应急金 → 退休账户 → 投资）逐月推演每一块钱该去哪，只在需要你行动时推送。

**状态**：原型阶段。还没有部署任何服务。

## 现在能做什么

- 用浏览器打开 `prototype/index.html`：一个单文件的交互式规划页，默认显示虚构的示例用户。可以拖滑块试算、看里程碑和每月操作清单，也可以导入你自己的设置 JSON
- `npm test`：用测试向量锁定推演引擎的行为（Node 18+）

## 目录

```
docs/
  prd.md               产品需求：目标、架构、数据源、长期设计、iOS 路线、里程碑
  prototype-spec.md    原型的精确规则、数据结构、测试向量、界面规格
prototype/
  index.html           单文件原型页面
  engine.js            推演引擎（纯函数）
config/
  example-settings.json  示例用户（虚构数据）
  settings.json          你的真实设置：已在 .gitignore 中，不会入库
tests/
  engine.test.js       引擎行为锁定
```

## 使用你自己的数字

把 `config/example-settings.json` 复制为 `config/settings.json`，填入真实数字；在原型页的"计划设置"里点"导入设置 JSON"。`config/settings.json` 永远不会被提交。

## 文档语言

文档为中文；代码、提交信息和 `CLAUDE.md` 为英文。
