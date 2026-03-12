# Cursor 设置页面汉化脚本方案

本方案旨在通过脚本自动替换 Cursor 核心资源文件中的英文文本，实现设置页面的中文化。

## 用户评议

> [!WARNING]
> 修改 `workbench.desktop.main.js` 属于一种“硬补丁”行为，存在以下风险：
> 1. **更新失效**：每次 Cursor 自动更新后，汉化补丁会被覆盖，需要重新运行脚本。
> 2. **语法风险**：如果替换逻辑不够严谨，可能会破坏 JS 文件的语法，导致 Cursor 无法启动或部分功能失效。
> 3. **性能开销**：文件大小约为 50MB，运行脚本需要几秒钟。

## 提议的更改

### [汉化脚本]

#### [NEW] [translate_cursor.js](file:///D:/开发项目/cursor-settings-zh/translate_cursor.js)
创建一个 Node.js 脚本，执行以下逻辑：
- 备份原始 `workbench.desktop.main.js` 文件。
- 读取文件内容。
- 使用键值对映射表（Dictionary）进行批量字符串替换。
- 将修改后的内容写回文件。

### [翻译字典]
初步确定的翻译词条包括：
- `Manage Account` -> `管理账户`
- `Upgrade to Pro` -> `升级到 Pro`
- `Sync layouts across windows` -> `在窗口间同步布局`
- `Editor Settings` -> `编辑器设置`
- `Keyboard Shortcuts` -> `键盘快捷键`
- `Import Settings from VS Code` -> `从 VS Code 导入设置`
- `Status Bar` -> `状态栏`
- `Auto-hide editor when empty` -> `编辑器为空时自动隐藏`
- `System Notifications` -> `系统通知`
- `System Tray Icon` -> `系统托盘图标`
- `Completion Sound` -> `补全音效`

## 验证计划

### 自动化测试
- 编写脚本检查 `workbench.desktop.main.js` 的文件完整性，确保替换后仍是有效的 JS 代码。

### 手动验证
1. 关闭所有 Cursor 窗口。
2. 运行 `node translate_cursor.js`。
3. 重新打开 Cursor，进入设置页面确认显示效果。
4. 验证设置功能（点击、切换开关）是否正常。
