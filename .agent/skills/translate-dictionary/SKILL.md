---
name: translate-dictionary
description: 专门用于维护和扩展 Cursor Settings 汉化字典的技能，包含分类原则和动态扩展策略。
---

# Cursor 汉化 Pro 维护技能 (translate-dictionary)

## 目的
本技能旨在指导维护 `cursor_zh_pro.js` 的核心逻辑及 `i18n/*.json` 资源文件，确保汉化覆盖 100% 的 UI 表面积（包含主程序逻辑与 NLS 语言包）。

## 字典资源划分
Pro 版本通过两个核心文件分工处理汉化，严禁混用：

1. **[dictionary.json](file:///Users/gaoxuyang/Developer/cursor-settings-zh/i18n/dictionary.json)**：
   - **适用场景**：绝大多数短词、固定按钮、配置项、通用词汇。
   - **匹配原理**：采用严格边界正则（`"` 或 `>` 包裹），并已在底层脚本加入 **负向断言防呆机制** `(?=\\s*(?![:=]))`，自动跳过作为对象属性(Key)和变量赋值的代码。
   - **组织形式**：按 UI 逻辑层级嵌套，脚本会自动扁平化处理。**所有通用短词（如 Context、Chat 等）必须且只能存放在此处**。

2. **[fragments.json](file:///Users/gaoxuyang/Developer/cursor-settings-zh/i18n/fragments.json)**：
   - **适用场景**：带有特定 HTML/UI 特征的超长句子、多词组合。
   - **匹配原理**：采用暴力的 `split/join` 全局纯文本替换，无任何边界限制。
   - **⚠️ 灾难级红线 (Anti-Black-Screen)**：**绝对不允许将没有任何上下文符号包裹的、纯粹的英文通用短词（如 `All`, `Open`, `Default`, `User`）直接放入此文件！** 这会无差异替换掉 JS 底层源码中的变量名、对象、导出函数等，引发瞬间的 Syntax Error 导致导致渲染进程（界面） 100% 暴毙黑屏！
   - **正确用法示例**：如果一定要用它匹配短词，必须包含上下文字符，例如：`>Default<`、`"Cursor Tab"` 或 `class="btn">Open<`。

## 目标资源文件 (Targets)
维护时必须确保覆盖以下物理位置：
1. **主逻辑**：`out/vs/workbench/workbench.desktop.main.js`
2. **全局 NLS**：`out/nls.messages.json`（绝大多数按钮和弹窗词条的真实载体）
3. **扩展 NLS**：`extensions/**/package.nls.json`（插件相关的功能词条）

## 技术规范与风险控制
- **NLS JSON 原则**：在处理 JSON 资源时，替换逻辑必须仅限“值”部分，严禁触碰 JSON 的“键”或“结构控制符”。
- **校验值闭环 (Checksums)**：修改目标文件后自动计算 SHA256 (Base64) 写入 `product.json`，防止软件告警。
- **白屏/黑屏防御机制 (Core Resiliency)**：
    - **JS 变量防篡改**：严格依据 `dictionary.json` (防呆正则) 和 `fragments.json` (长文本/特征符) 分治。
    - **V8 代码缓存清洗**：汉化脚本底层已包含自动删除 `CachedData` 与 `Code Cache` 的逻辑，防止新老代码体积偏移量不一致导致引擎底层崩溃。
    - **macOS Gatekeeper 防封杀**：汉化脚本底层已包含针对 `darwin` 环境的自动 `codesign` 重新签名及 `xattr` 属性剥离，防止改动文件后失去 JIT 引擎执行权限。
    - **总结**：作为翻译录入者，你唯一需要防范的引发黑屏的原因，就是**向 json 词库中投入了错误的“毒词”**（例如将纯泛用短词违规塞入了 `fragments.json`）。

## 维护流程
1. **定位残留英文**：运行 `cursor_zh_pro.js` 检查 `finalMissed` 统计结果，或直接在 `out` 目录下使用全量文本检索确认载体。
2. **分配至资源文件**：
   - 简单的键值对放入 `dictionary.json` 对应的 UI 分组下。
   - 复杂长文本放入 `fragments.json`。
3. **执行全量汉化**：运行汉化脚本，查看“扫描到 X 个目标文件”的输出结果。
4. **校验验证**：通过 product.json 的变化确认校验值修复成功。
