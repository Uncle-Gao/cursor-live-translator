# Cursor Pro 汉化工具 (cursor-settings-zh)

本项目通过对 Cursor 核心资源文件进行深度适配，实现设置界面、聊天 UI 及右键菜单的高深度中文化。

> [!NOTE]
> **Pro 版核心逻辑**：不再仅仅修改主 JS 文件，而是通过递归扫描 NLS 资源包与自动化校验修复，实现更稳健、覆盖率更高的汉化效果。

## 🌟 项目亮点 (Pro Features)
- **多资源深度汉化**：同步支持 `main.js`、`nls.messages.json` 以及 `extensions` 目录下所有插件的资源包。
- **全自动校验修复**：内置 SHA256 重新计算逻辑，汉化后自动修复 `product.json` 指纹，从根源消除“安装损坏”告警。
- **持久化资产库**：汉化词条存储在 `i18n/` 独立的 JSON 中，结构清晰，支持碎片化匹配与复合词项补全。
- **一键全量恢复**：完善的备份机制，支持一键将所有受影响的资源同步还原至官方原版。
- **智能进度日志**：自动生成 `missed_terms.log`，实时追踪未匹配词条，方便开发者精准补全。

## 📂 项目结构
- **[cursor_zh_pro.js](file:///d:/开发项目/cursor-settings-zh/cursor_zh_pro.js)**: 核心驱动脚本。
- **[i18n/](file:///d:/开发项目/cursor-settings-zh/i18n/)**: 
  - `dictionary.json`: 标准 UI 词条库。
  - `fragments.json`: 模糊片段与长文本库。
- **[dist/](file:///d:/开发项目/cursor-settings-zh/dist/)**: 预编译的多平台可执行成品（Win/Mac/Linux）。

## 🚀 使用方法

### 方式一：直接运行成品 (推荐)
1. **彻底关闭 Cursor**。
2. 运行 `dist/` 下对应系统的程序（如 Windows 下运行 `cursor-settings-zh-win.exe`）。
3. 输入 `1` 执行汉化（或输入 `2` 还原）。
4. 重新打开 Cursor 查看效果。

### 方式二：开发者调试 (Node.js)
1. 确保安装了 Node.js 环境。
2. 在根目录下执行：`node cursor_zh_pro.js`。

## 🛠️ 常见问题 (Troubleshooting)

### 1. 汉化后还是有部分英文？
- **原因**：部分词条可能包含动态内容（如快捷键）。
- **解决**：检查生成的 `missed_terms.log`，将对应词条拆解为静态片段后加入 `i18n/fragments.json`。

### 2. 软件更新后汉化失效？
- 直接重新运行本工具即可。工具会自动检测新版本并尝试执行补丁匹配。

### 3. 如何反馈？
- 欢迎提交 **Issue** 或 **PR**。请在反馈时附带 `missed_terms.log` 的内容，以便我们快速对齐字典。

---
*本项目仅供交流学习使用。请支持并关注 Cursor 官方后续的国际化计划。*

