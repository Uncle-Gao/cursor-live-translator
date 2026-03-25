# 更新日志 (Changelog)

## [2.4.1] - 2026-03-25

### 🚀 突破性更新：AI 驱动的全页面汉化
- **全页面翻译 (Full-Page Coverage)**：打破了以往仅支持菜单汉化的局限。利用智能 DOM 扫描机制，实现对 Cursor 工作区、AI 对话流、编辑器侧边栏等所有界面的 100% 覆盖。
- **AI 动态注入 (Direct UI Refresh)**：深度集成 OpenAI、DeepSeek、Kimi 等尖端模型，翻译结果异步回传并实时“跳变”更新 UI，提供丝滑的本地化体验。
- **工业级稳定性**：针对高频 DOM 变动（如 AI 推理流）进行了 `requestAnimationFrame` 级防抖优化，确保翻译过程不产生界面卡顿。
- **多平台二进制包**：正式发布基于 `pkg` 的预编译包，支持 macOS (x64), Windows (x64), Linux (x64)，即开即用。

## [2.4.0] - 2026-03-25

### ✨ 重大变更：品牌重塑与架构基石
- **品牌更名**：项目正式更名为 **`Cursor-Live-Translator`**，定位从“汉化脚本”进化为“实时翻译引擎”。
- **架构演进**：确立 V2.3 核心架构 —— **Trusted Bootstrap Injection**（受信任引导挂载），彻底解决更新后失效的问题。
- **演进历程**：新增 `PROJECT_EVOLUTION.md`，完整记录从 V1.0 到 Pro 版本的数次架构跨代。

## [Legacy] - 2026-03-24 之前
- 原 `cursor-settings-zh` 阶段的各项基础汉化功能。
