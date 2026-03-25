---
name: translate-dictionary
description: 专门用于维护和扩展 Cursor Settings 汉化字典的技能，包含 V2 (DOM拦截) 架构下的分类原则和动态扩展策略。
---

# Cursor 汉化 Pro 维护技能 (translate-dictionary)

## 目的
本技能旨在指导维护 `cursor_zh_pro.js` 的核心汇编逻辑及 `i18n/*.json` 资源文件，重点配合 V2 架构的 DOM 拦截外挂脚本（`cursor-i18n-runtime.js`），指导 AI 确保安全地拓宽汉化覆盖面。

## 字典规则演进 (V2 架构革新)
在 V2 纯运行时 HTML 的外挂注入体系中，我们**彻底抛弃了在几十兆源码里做危险正则替换的做法**。所有翻译的映射都独立且安全地发生于浏览器渲染引擎中的前台文本节点 (`node.textContent`) 与悬浮提示 (`title`) 的变化瞬间！

1. **[dictionary.json](file:///Users/gaoxuyang/Developer/cursor-settings-zh/i18n/dictionary.json)**：
   - **定位**：V2 工作流的主力库。适用各类单短词、高频系统级名词（如 `"Settings"`）、组合词以及各种悬浮气泡文本。
   - **匹配原理**：运行时被编译为内存哈希表，依靠原生 DOM 抓取其内含 `textContent.trim()` 和字典键极速进行 **严格字符串等值命中**。
   - **🚨 封印解除 (安全重定义)**：在 V2 的运行时维度，现在**完全允许把极短或普适的英文短词**（例如 `"All"`, `"Default"`, `"True"`, `"False"`）**录入基础字典**！因为运行时的 `MutationObserver` 只会针对网页前端暴露出来的 UI 文本节点做判断，绝对不会干扰隐匿在后面运作的 JavaScript 内部框架变量和对象键，从物理隔离上 100% 消灭了引发渲染进程崩溃黑屏的可能！

2. **[fragments.json](file:///Users/gaoxuyang/Developer/cursor-settings-zh/i18n/fragments.json)** (兼容式超长注释/片段包)：
   - **定位**：遗留下来的巨型设置说明释义本。
   - **加载原理**：目前的安装程序会在执行时自动读取本文件，过滤掉无用的上下文特殊边界符，将其全量合并打平灌入到主字典环境。
   - **M4 计划**：在未来，此文件（或拆分为 `patterns.json`）将进一步进化为存放具备正则表达式特性的匹配模板（如 `"(.*) files analyzed"`），用于处理运行时含可变数字动态更新的复杂字符串。

## 维护作业流淌 (V2)
1. **拾取英文节点**：直观地阅读未汉化的设置页面 UI（或使用外部 DOM 分析剥离工具）。
2. **扩充语料库**：以纯文本键值对的形式补充进 `i18n/dictionary.json` 适当的分层内。
3. **注入投递引擎**：在项目内打开终端，调用 `sudo node cursor_zh_pro.js` 并选择注入选项 `1`。工具会安全地重打包包含了全新指纹与词条内存的 `cursor-i18n.js`。
4. **重载视界**：回到 Cursor 主界面按下 `Cmd+R` (Reload Window)。DOM 树被完全撕毁重构的瞬间，新的术语映射即可就绪显现。
