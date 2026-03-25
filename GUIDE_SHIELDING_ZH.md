# Cursor 汉化屏蔽 (Skip) 实战指南

如果您发现 Cursor 的某些区域（如文件夹名、特定插件窗口）不应该被汉化，可以按照本指南自主配置屏蔽规则。

## 一、 配置文件结构说明

屏蔽规则存储在您的个人配置文件中：`~/.cursor_live_translator/config.json`。

### 字段详解 (JSON Structure)

```jsonc
{
  "activeId": "deepseek", // 当前激活的 AI 引擎 ID
  "skip": {
    "titles": [],      // [窗口标题] 屏蔽关键字 (document.title.includes)
    "urls": [],        // [URL] 屏蔽关键字 (location.href.includes)
    "selectors": [     // [CSS 选择器] 屏蔽区域 (el.closest)
      ".explorer-folders-view", // 防止文件/目录名汉化 (默认已加入)
      ".terminal-container"    // 防止终端回显汉化 (默认已加入)
    ]
  },
  "engines": { ... }   // 各 AI 模型的 API 配置
}
```

---

## 二、 如何查找屏蔽对象？（实战步骤）

如果您发现某个 UI 区域汉化异常，请按以下步骤找到它的“特征码”：

1.  **打开开发者工具**：
    - 在 Cursor 菜单栏点击 `Help` -> `Toggle Developer Tools`（或快捷键 `Cmd/Ctrl + Option + I`）。
2.  **定位元素**：
    - 点击开发者工具面板左上角的 **“箭头（Select an element）”** 图标。
    - 然后在 Cursor 界面上点击那个“不需要汉化”的区域。
3.  **提取类名 (Class Name)**：
    - 在 `Elements` 面板中，找到被选中的 HTML 标签。
    - 观察它的 `class="..."` 属性（例如 `explorer-folders-view` 或 `monaco-workbench`）。
4.  **添加到配置**：
    - 记录下这个类名（在前面加一个点号 `.`，如 `.sidebar`）。

---

## 三、 如何管理屏蔽配置？

为了降低配置门槛，我们提供了**交互式管理界面**和**手动编辑**两种方式。

### 方法 A：使用安装器管理（推荐）
1.  在终端运行 `node cursor_zh_pro.js`。
2.  在主菜单选择 `4. 管理汉化屏蔽规则 (实时预览)`。
3.  您可以直观地看到当前已有的规则，并根据提示输入 `A` 添加选择器。
    - **[智能识别]**: 您可以直接粘贴从开发者工具复制的 **HTML 标签** 或 **纯类名**（如 `sidebar`），安装器会自动将其转化为标准选择器（如 `.sidebar`）。
4.  修改完成后返回主菜单，选择 `1. 一键汉化` 重新注入配置。

### 方法 B：手动编辑 config.json
1.  打开配置文件：`[~/.cursor_live_translator/config.json]`。
2.  在 `skip` 字段下直接修改对应的数组。
3.  保存后，同样需要运行 `node cursor_zh_pro.js` -> `1. 一键汉化` 以生效。

---

## 四、 如何应用屏蔽配置？

屏蔽规则存储在您的**个人配置文件**中：
`[~/.cursor_live_translator/config.json]`

### 编辑步骤：
1.  打开上述 `config.json`。
2.  在 `skip.selectors` 数组中填入您找到的选择器：
    ```jsonc
    "skip": {
      "selectors": [
        ".explorer-folders-view", // 默认已加入：防止文件管理器汉化
        ".terminal-container",      // 默认已加入：终端区域
        ".my-special-plugin-id"     // 您新加的屏蔽项
      ]
    }
    ```
3.  保存文件。
4.  **关键步骤**：在终端运行汉化程序 `node cursor_zh_pro.js` 并选择 `1. 一键汉化`（因为配置需要重新注入到引导程序中）。
5.  **重启 Cursor** 使变更生效。

---

## 五、 常见屏蔽场景示例

| 屏蔽目标 | 推荐选择器 (Selector) | 说明 |
| :--- | :--- | :--- |
| **导航面包屑** | `.monaco-breadcrumbs`     | 防止编辑器顶部的路径导航被汉化 |
| **代码编辑区** | `.view-lines`             | 确保代码区域不被任何汉化引擎触碰 |
| **列表视图** | `.monaco-list-row`        | 屏蔽侧边栏列表区域 (如资源管理器、搜索列表) |
| **面板标题** | `.pane-header.expanded`   | 保持各个侧边栏区块的标题为英文 |
| **集成终端** | `.terminal-container`      | 保持终端回显为原生英文 |
| **终端链接** | `.xterm-link-layer`       | 防止终端里的文件路径/链接被误汉化 |
| **调试面板** | `.debug-pane` | 保持调试信息为英文 |
| **特定插件** | `[id="plugin-id-xxx"]` | 通过特定的 ID 屏蔽第三方插件 |

---
> [!TIP]
> 如果您不确定选择器是否正确，可以在开发者工具的 Console 中输入 `document.querySelector('.您的选择器')` 检查是否能选中对应元素。
