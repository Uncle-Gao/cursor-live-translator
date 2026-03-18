---
name: translate-dictionary
description: 专门用于维护和扩展 Cursor Settings 汉化字典的技能，包含分类原则和动态扩展策略。
---

# Cursor 汉化 Pro 维护技能 (translate-dictionary)

## 目的
本技能旨在指导维护 `cursor_zh_pro.js` 的核心逻辑及 `i18n/*.json` 资源文件，确保汉化覆盖 100% 的 UI 表面积（包含主程序逻辑与 NLS 语言包）。

## 字典资源划分
Pro 版本通过两个核心文件分工处理汉化，严禁混用：

1. **[dictionary.json](file:///d:/开发项目/cursor-settings-zh/i18n/dictionary.json)**：
   - **适用场景**：短词、固定按钮、配置项、精准匹配。
   - **匹配原理**：采用严格边界正则（`"` 或 `>` 包裹）。
   - **组织形式**：按 UI 逻辑层级嵌套（如 `agents.privacy`），脚本会自动扁平化处理。

2. **[fragments.json](file:///d:/开发项目/cursor-settings-zh/i18n/fragments.json)**：
   - **适用场景**：长篇描述、带有 HTML 标签的片段、需要模糊匹配的长词条。
   - **匹配原理**：采用 `split/join` 或全文包含匹配，不限制边界。
   - **核心策略——碎片拆解 (Fragment Slicing)**：
     - 如果词条中包含动态内容（如 `${shortcut}`、`Ctrl+K` 等），**严禁整体录入**。
     - 必须将其拆解为多个静态片段分别录入。
     - *示例*：`Automatically parse links... (Ctrl+K)` 拆解为 `Automatically parse links... (`。

## 目标资源文件 (Targets)
维护时必须确保覆盖以下物理位置：
1. **主逻辑**：`out/vs/workbench/workbench.desktop.main.js`
2. **全局 NLS**：`out/nls.messages.json`（绝大多数按钮和弹窗词条的真实载体）
3. **扩展 NLS**：`extensions/**/package.nls.json`（插件相关的功能词条）

## 技术规范与风险控制
- **NLS JSON 原则**：在处理 JSON 资源时，替换逻辑必须仅限“值”部分，严禁触碰 JSON 的“键”或“结构控制符”。
- **校验值闭环 (Checksums)**：
    - 每次修改目标文件后，必须同步计算 SHA256 (Base64) 校验值。
    - 必须将新校验值写回 `product.json`，否则软件会弹出告警或强制更新。
- **备份强制性**：所有目标文件在修改前必须保留 `.bak` 原始文件。

## 维护流程
1. **定位残留英文**：运行 `cursor_zh_pro.js` 检查 `finalMissed` 统计结果，或直接在 `out` 目录下使用全量文本检索确认载体。
2. **分配至资源文件**：
   - 简单的键值对放入 `dictionary.json` 对应的 UI 分组下。
   - 复杂长文本放入 `fragments.json`。
3. **执行全量汉化**：运行汉化脚本，查看“扫描到 X 个目标文件”的输出结果。
4. **校验验证**：通过 product.json 的变化确认校验值修复成功。
