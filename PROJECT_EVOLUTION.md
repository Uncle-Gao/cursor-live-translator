# Project Evolution: Cursor-Live-Translator

本项目记录了从 `cursor-settings-zh` 到 `cursor-live-translator` 的核心演进历史与技术决策。

## 核心版本里程碑

### V1.1.0 奠基时代 (Pro 架构版)
*   **技术关键词**: 断言隔离、V8 逃逸、版本锚定。
*   **核心突破**:
    *   **断言表达式防护盾**: 使用 `(?=\s*(?![:=]))` 正则断言，实现了“只翻译 UI，不破坏代码变量”的深度汉化。
    *   **V8 Bytecode 逃逸**: 解决了修改核心 JS 后可能导致的字节码偏移冲突（黑屏/白屏启动失败）。
    *   **版本锁死备份**: 备份文件名自带版本号（如 `.2.6.21.bak`），防止 OTA 更新后的错误恢复。

### V2.1 PRO 飞跃时代 (Trusted Injection)
*   **技术关键词**: 受信任挂载、多引擎 AI、正则模式。
*   **核心突破**:
    *   **Trusted Bootstrap Injection**: 放弃 HTML 外部脚本，改为内联追加至 `workbench.js`，绕过 Cursor 0.45+ 的 `TrustedScript` 安全审计。
    *   **多引擎 AI 动力系统**: 原生支持 DeepSeek, OpenAI, Kimi 等，并引入本地二级缓存（localStorage）。
    *   **M4 正则模式映射**: 支持对 `Found (\d+) files` 等动态变量句式的智能汉化映射。

### V2.3.0 品牌与体验时代 (Live Edition)
*   **技术关键词**: 品牌重塑、异步实时刷新、精位屏蔽。
*   **核心突破**:
    *   **品牌迁移**: 项目正式更名为 `Cursor-Live-Translator`。配置目录自 `~/.cursor_zh_pro` 迁移至 `~/.cursor_live_translator`。
    *   **AI 异步实时刷新 (Direct UI Refresh)**: 攻克了 AI 翻译的“二次扫描延迟”，结果返回后自动微调 DOM，实现无感变色。
    *   **精位屏蔽系统 (Surgical Shielding)**: 针对 `.view-lines`、`.monaco-list-row` 等底层特征码进行精准隔离，确保代码原生体验。

---

## 架构原则 (Design Principles)
1.  **零侵入 (Non-Invasive)**: 绝不触碰用户源码，所有操作均在 UI 渲染层。
2.  **安全优先 (Safety First)**: 物理隔离 API Key，版本化强制备份，确保随时一键恢复官方原版。
3.  **高性能 (High Performance)**: 防抖请求、批处理、多级缓存，确保在大规模 UI 变动下依然流畅。
