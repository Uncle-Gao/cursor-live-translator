# PRD：Cursor 汉化 v2 — HTML 注入 + DOM 懒翻译方案

> 版本：v0.1  
> 日期：2026-03-24  
> 状态：草稿

---

## 1. 背景与目标

### 1.1 现有方案的痛点

当前 v1.x 方案通过**直接修改 `workbench.desktop.main.js`**（11MB 压缩 JS）实现汉化，存在以下根本性问题：

| 问题 | 描述 |
|------|------|
| OTA 更新脆弱 | Cursor 每次更新后 JS 文件变化，字典大概率失效，需人工维护 |
| V8 字节缓存崩溃 | 修改 JS 文件后字节偏移变化，需清除 Code Cache 否则白屏 |
| Checksum 修复 | 需要重新计算 SHA256 写入 `product.json` |
| macOS 重签名 | 每次都需要 `codesign --force --deep` |
| 高维护成本 | 开发者需跟踪每个 Cursor 版本的 JS 变化 |

### 1.2 新方案目标

- **零 JS 修改**：完全不碰 `workbench.desktop.main.js`
- **免维护**：Cursor 更新新增 UI 字符串后自动翻译，无需人工跟进
- **稳定**：无 V8 缓存、无 Checksum、无签名问题
- **精准**：只翻译真正出现在 DOM 中的 UI 文本，不误伤任何内部代码字符串

---

## 2. 方案架构

### 2.1 核心思路

```
安装阶段（一次性）
  ┌─────────────────────────────────────┐
  │ 1. 在 workbench.html 注入           │
  │    <script src="cursor-i18n.js">   │
  │ 2. 将运行时脚本复制到 Cursor 目录   │
  │ 3. macOS codesign（仅此一步需要）   │
  └─────────────────────────────────────┘

运行时（每次 Cursor 启动自动执行）
  ┌─────────────────────────────────────┐
  │ cursor-i18n.js 被加载               │
  │   ↓                                 │
  │ MutationObserver 监听 DOM 变化      │
  │   ↓                                 │
  │ 发现英文文本节点                     │
  │   ↓                                 │
  │ 查本地缓存 → 命中则直接替换         │
  │   ↓ 未命中                          │
  │ 调用翻译 API → 写缓存 → 替换        │
  └─────────────────────────────────────┘
```

### 2.2 文件结构

```
cursor-live-translator/
  cursor_zh_pro.js          # 安装工具（重构后只操作 HTML）
  cursor-i18n-runtime.js    # 运行时翻译脚本模板
  i18n/
    terms.json              # 核心术语表（人工维护，覆盖机器翻译的技术词汇）

Cursor 安装目录（注入后）
  .../workbench/
    workbench.html          # 被注入一行 <script src>
    cursor-i18n.js          # 运行时脚本（从模板生成，内含术语表）
```

---

## 3. 技术细节

### 3.1 workbench.html 注入点

**CSP 约束分析：**
```
script-src: 'self' 'unsafe-eval' blob:
```
- ✅ 允许 `<script src="./本地文件.js">` —— 注入外部脚本
- ❌ 不允许 `<script>内联代码</script>` —— 无 `'unsafe-inline'`
- ⚠️ `require-trusted-types-for 'script'` —— 我们只操作 `textContent`（纯字符串），不受影响

**注入位置**（`workbench.html` 第 101 行之前）：
```html
<!-- cursor-i18n: Cursor 汉化运行时 v2 -->
<script src="./cursor-i18n.js"></script>

<!-- Startup (do not modify order of script tags!) -->
<script src="./workbench.js" type="module"></script>
```

**注意**：`workbench.html` **存在于** `product.json` 的 `checksums` 中。注入脚本后，必须重新计算其以 base64 编码的 SHA256 并更新回 `product.json` 以消除启动时的 `corrupt` 破解警告，但由于其属于纯文本 HTML 文件，修改它不受 V8 字节码缓存的影响，彻底根绝了白屏崩溃的安全隐患。

### 3.2 运行时脚本（cursor-i18n.js）

#### 3.2.1 翻译层级

```javascript
// 优先级从高到低：
// 1. 本地术语表（terms.json 内联）—— 人工校对的权威译文
// 2. localStorage 缓存 —— 之前 API 翻译的结果
// 3. 翻译 API —— 在线翻译，结果写入缓存
```

#### 3.2.2 MutationObserver 配置

```javascript
observer.observe(document.body, {
  childList: true,               // 监听节点增删（设置面板 tab 切换时新增 DOM 节点）
  subtree: true,                 // 监听整棵子树
  characterData: false,          // 无需监听（实测：tab 切换是 childList，不是 characterData）
  attributes: true,              // 监听属性变化（捕获 title 属性动态修改）
  attributeFilter: ['title'],    // 只关心 title，减少无效触发
});
```

> **实测发现（验证 C）**：设置面板切换 tab 时，MutationObserver 捕获的类型为 `childList + attributes`，确认新 UI 内容是以**新增 DOM 节点**方式渲染的，而非修改已有文本节点的 characterData。
>
> ⚠️ **注意**：Cursor 拦截了原生 `console.log`，运行时脚本不能依赖 console 输出做调试，应改用其他反馈机制（如 DOM 注入或远程日志）。

#### 3.2.3 翻译目标

翻译以下两类用户可见内容：

| 类型 | 示例 | DOM 实现 |
|------|------|---------|
| Text 节点 `textContent` | 按钮文字、标题、描述 | 文本节点直接赋值 |
| 元素 `title` 属性 | 悬停 tooltip（OS 原生灰色小方框）| 读写元素的 `.title` 属性 |
| 含变量文本 | `"500 requests used"` | textContent，正则模式字典匹配 |

> **实测发现（验证 B）**：Cursor 设置面板的悬停 tooltip 来自原生 HTML `title` 属性，而非自定义 DOM 组件，因此必须处理 `title` 属性翻译。

#### 3.2.4 跳过的标签

```javascript
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT',
  'CODE', 'PRE', 'KBD', 'SAMP'
]);
```

#### 3.2.5 性能优化

```javascript
// 使用 requestAnimationFrame 批量处理，防止频繁触发
let pending = [];
let rafId = null;

const observer = new MutationObserver((mutations) => {
  for (const m of mutations)
    for (const node of m.addedNodes)
      pending.push(node);

  if (!rafId)
    rafId = requestAnimationFrame(() => {
      rafId = null;
      pending.splice(0).forEach(walkAndTranslate);
    });
});
```

### 3.3 翻译 API 集成

#### 3.3.1 候选 API

| API | 优点 | 缺点 |
|-----|------|------|
| Google Cloud Translation | 质量最好 | 需要 API Key，收费 |
| DeepL Free | 质量好 | 每月 500K 字符免费限额 |
| MyMemory（免费） | 无需 Key | 质量一般，有频率限制 |
| 本地 LLM（Ollama） | 完整隐私，无限制 | 需用户本地安装模型 |

#### 3.3.2 推荐策略

```
优先：本地术语表（terms.json）
  ↓ 未命中
优先：localStorage 缓存
  ↓ 未命中  
备选：MyMemory 免费 API（无需配置）
  ↓ 用户配置了 DeepL/Google Key
高质量：DeepL / Google Translate API
```

#### 3.3.3 缓存结构（localStorage）

```javascript
// key: "cursor_i18n_cache"
{
  "Settings": "设置",
  "Background Agent": "后台智能体",
  "500 requests used|pattern": "$1 次请求已使用", // 正则模式
  "_version": "2.6.21"   // 版本指纹，Cursor 更新后自动失效缓存
}
```

### 3.4 含变量字符串的处理

在 `terms.json` 中支持正则模式：

```json
{
  "patterns": [
    {
      "match": "^(\\d+) requests? used$",
      "replace": "$1 次请求已使用"
    },
    {
      "match": "^(\\d+) of (\\d+) files indexed$",
      "replace": "已索引 $1 / $2 个文件"
    }
  ]
}
```

运行时会先尝试精确匹配，再尝试正则模式，最后才走 API。

### 3.5 安装工具（cursor_zh_pro.js）重构

安装流程精简为：

```
1. 检测 Cursor 路径（不变）
2. 读取 terms.json，生成运行时脚本（内联术语表）
3. 复制 cursor-i18n.js 到 workbench 目录
4. 检查 workbench.html 是否已注入（幂等操作）
   → 未注入：插入 <script src> 标签
   → 已注入：跳过
5. 修复 product.json 中 workbench.html 的 checksums
6. macOS codesign（必需，因为修改了 App Bundle 内文件）
7. ❌ 不需要：操心任何 V8 缓存问题
```

**恢复流程：**
```
1. 从 workbench.html 移除 <script src="./cursor-i18n.js"> 标签
2. 删除 cursor-i18n.js 文件
3. macOS codesign
```

---

## 4. 与现有方案的功能对比

| 功能 | v1.x (修改 main.js) | v2 (HTML 注入) |
|------|---------------------|---------------|
| 设置面板静态文本 | ✅ | ✅ |
| 含变量动态文本 | ✅（正则字典） | ✅（正则模式字典）|
| Cursor OTA 更新后继续有效 | ❌ | ✅ |
| V8 缓存问题 | ❌ 需处理 | ✅ 无 |
| Checksum 修复 | ⚠️ 需要（难点：涉及 main.js） | ⚠️ 需要（简单：仅 html 文件） |
| macOS 重签名 | ⚠️ 需要 | ⚠️ 需要（修改了 App Bundle）|
| 翻译词条维护 | 高（跟版本走） | 低（仅术语表）|
| 离线可用 | ✅ | ✅（术语表 + 缓存命中时）|

---

## 5. 风险与缓解

| 风险 | 严重程度 | 缓解措施 |
|------|---------|---------|
| SolidJS 重渲染覆盖译文 | 中 | 重渲染触发 childList mutation，observer 会再次翻译 |
| 翻译 API 不可用 | 低 | 降级到术语表 + 缓存，设置面板核心词汇已覆盖 |
| Cursor 大版本重构 workbench.html | 极低 | HTML 结构极简，几乎不会变 |
| localStorage 被 Cursor 清除 | 极低 | 降级到 API，重新填充缓存 |

---

## 6. 开发里程碑

| 阶段 | 内容 | 交付物 |
|------|------|-------|
| M1 | 运行时核心 | `cursor-i18n-runtime.js`（MutationObserver + 术语表匹配） |
| M2 | 安装工具重构 | `cursor_zh_pro.js`（HTML 注入、codesign、恢复）|
| M3 | API 集成 | 懒翻译 + localStorage 缓存 |
| M4 | 正则模式字典 | `terms.json` 含变量字符串支持 |
| M5 | 测试 & 发布 | v2.0.0 |
