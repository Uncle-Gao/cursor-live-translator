# Cursor-Live-Translator：全场景 AI 实时本地化引擎

> [!IMPORTANT]
> **🎉 史诗级更新：现已深度支持 Cursor 及其所有内建/第三方 Webview 插件的 100% 汉化。**
> 本项目已正式进化为覆盖 **「Cursor 主程序」** 与 **「Webview 插件集群」**（如 Claude Code）的通用本地方案，解决插件在严格 CSP 环境下的汉化难题。

本项目是专门为 Cursor 定制的高性能实时翻译引擎。通过 **V2.5.0 Translation Bridge (翻译代理桥)** 架构，实现了离线字典匹配、动态变量正则解析与跨窗口 AI 实时翻译的深度融合。

> [!IMPORTANT]
> **架构重大突破：跨窗口通讯穿透与插件全量汉化**
> 在最新的 **V2.5.0 版本** 中，我们解决了长期困扰插件 Webview（如 Claude Code）的 CSP 联网限制问题。通过 `window.top` 直连通讯方案与递归广播机制，主窗口的 AI 能量可以无缝穿透至所有层级的插件内部，实现真正的“全场景汉化”。

## 🌟 核心亮点 (Pro Features)

### 1. 100% 架构穿透 (Full Architecture Penetration) 🎯
告别局部汉化，实现真正的全场景覆盖：
- **Cursor 核心 UI (Workbench)**：深度处理侧边栏资源管理器、状态栏、快捷指令面板及各类原生底层弹出窗口。
- **AI 交互与插件全域**：利用 Webview 穿透技术，100% 汉化 **AI 对话流 (Chat)**、**代码报错/追溯悬浮窗**、**Claude Code** 等所有基于独立容器运行的高级交互区域。

### 2. 翻译代理桥 (Translation Bridge) 🌉
- **突破限制**：针对插件 Webview 严苛的 CSP 策略，通过加密 `postMessage` 隧道将翻译请求转发至主窗口执行，解决“联网被拒”导致的翻译转圈问题。

### 3. AI 异步实时刷新 (Direct UI Refresh) 🚀
- **无感更新**：翻译结果返回时自动微调局部 DOM。
- **视觉反馈**：新增与文字高度一致的 **Loading 动画**，翻译进度一目了然。

### 4. 分域屏蔽系统 (Entity-based Shielding) 🛡️
- **独立规则**：支持分别为“主窗口”与“各个插件”配置完全独立的屏蔽规则（CSS 选择器、URL、标题），确保代码区与核心交互区逻辑纯净。

### 5. 交互式溯源 (Interactive Traceability) 🔍
- **动态高亮**：使用 `Cmd + Option + Shift + B` (Mac) 或 `Ctrl + Alt + Shift + B` (Win) 切换蓝色虚线边框。
- **悬停原词**：在开启调试高亮模式后，按住 **Option** (Mac) 或 **Alt** (Win) 并悬停在中文上即可查看原文。

---

## 🏗️ 架构演进：从 V1 到 V2.5.0 Pro

| 特性| V1 (静态替换) | V2.4 (交互增强) | V2.5.0 (全局同步架构) |
| :--- | :--- | :--- | :--- |
| **稳定性** | **极高风险**。 | **稳如磐石**。 | **工业级**。带引导校验与调试多端同步。 |
| **扩展性** | 无。 | 仅限主窗口。 | **全场景插件支持**。支持 Webview 注入。 |
| **交互性** | 无。 | 快捷键 + 悬停。 | **全感应交互**。高亮状态全局联动。 |
| **通讯方案** | 无。 | 浏览器 Fetch。 | **跨层级 Bridge**。直连 top + 递归广播。 |

---

## 🧩 插件汉化深度详解 (Plugin Localization In-Depth)

针对 **Claude Code** 等基于 Webview 的插件，本项目实现了全自动化的“穿透式”汉化方案。

### 1. 启动验证：如何确认插件汉化成功？
- **控制台日志**：快捷键 `Cmd + Option + I` (Mac) 或 `F12 / Ctrl + Shift + I` (Win) 唤起开发者工具：
  - `[Cursor-Live-Translator] [Workbench] 动力系统就绪` (主窗口环境)
  - `[Cursor-Live-Translator] [Claude Code] 动力系统就绪` (插件 Webview 环境)
- **视觉反馈**：向插件发送指令，观察翻译中的文本后方是否出现旋转的 **Loading 动画**。翻译完成后，在调试模式下按住 `Option/Alt` 并悬停在中文上可确认原文。

### 2. 运行机制：它是如何工作的？
- **静默注入**：安装程序会自动扫描 `~/.cursor/extensions/` 目录，在每个插件的 Webview 入口 `index.js` 末尾追加轻量级运行时。
- **通讯代理桥 (The Bridge)**：
  - **跨域穿透**：插件环境因 CSP 联网限制无法直连 AI 接口，它会通过 `window.top` 向主窗口发起翻译申请。
  - **中继分发**：主窗口作为“受信中心”调度 AI 引擎，并利用递归广播机制将结果精准推送到对应插件。
- **词典存储**：
  - **静态加载**：基础词条在注入时预置。
  - **动态缓存**：AI 翻译结果持久化存储在各实体的 `localStorage` 中，支持秒开预览。

### 3. 配置与分域屏蔽规则
- **统一配置**：所有设置存储在 `~/.cursor_live_translator/config.json`。
- **分域策略**：在配置文件的 `skip` 字段下，主窗口 (`_cursor_`) 与具体插件（如 `Anthropic.claude-code`）拥有**完全独立**的规则集（选择器、URL、标题）：
  - 您可以为插件设置几乎为零的屏蔽规则，以实现最深度的汉化；同时为主窗口保留严格的代码区保护。
- **管理方式**：运行安装器选择 `4. 管理汉化屏蔽规则`，首先会询问您要管理哪一个目标的规则。

---

## 🚀 快速开始

### 1. 环境准备
确保已安装 Node.js [或者直接使用 `dist/` 目录下的可执行文件]。

### 2. 运行安装程序
在终端执行：
```bash
./cursor-live-translator-macos  # Mac (示例)
# 或
node cursor_zh_pro.js
```

### 3. 操作指引
1. 选择 `3. 配置 AI 翻译引擎` 配置 API Key。
2. 选择 `1. 一键汉化`，完成后根据提示选择 `y` 即可进入插件汉化流程。
    - **Mac**: `Cmd + Opt + Shift + B` (切换高亮/调试模式) | `Option + 悬停` (调试模式下展示原文)
    - **Win**: `Ctrl + Alt + Shift + B` (切换高亮/调试模式) | `Alt + 悬停` (调试模式下展示原文)

## 🛡️ 安全性与隐私说明

1. **API Key 本地化**：存储在本地 `~/.cursor_live_translator/`，不随代码上传。
2. **直连通信**：不设立中转服务器，请求直达官方接口。
3. **分域隔离**：独立管理屏蔽规则，**绝不触碰您的源码**。

## 🛠️ 常见问题 (Troubleshooting)

### 1. 汉化后提示“损坏”？
请点击安装器菜单中的相应提示进行签名重校，或手动运行：
```bash
sudo xattr -cr /Applications/Cursor.app
sudo codesign --force --deep --sign - /Applications/Cursor.app
```

### 2. 如何确认引擎已启动？
按下 `Cmd + Option + I` (Mac) 或 `F12` (Win) 查看控制台。若看到紫色印记 `[Cursor-Live-Translator] [Workbench] 动力系统就绪 | V2.5.0`，则代表引擎已开启。

---
*本项目仅供交流学习使用。翻译质量受所选 AI 模型影响。*
