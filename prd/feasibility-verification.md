# 可行性验证方案：HTML 注入 + DOM 懒翻译

> 目标：在**不写任何正式代码**的情况下，通过 Cursor DevTools 控制台快速验证方案的核心假设。

---

## 核心假设清单

| # | 假设 | 验证方法 |
|---|------|---------|
| A | electron-sandbox 中可以直接修改 Text 节点的 `textContent` | DevTools 控制台 |
| B | Tooltip 的文字是 textContent，而非 `title` 属性 | DevTools Elements 面板 |
| C | MutationObserver 能捕获 Cursor 动态渲染的新元素 | DevTools 控制台 |
| D | SolidJS 重渲染不会导致翻译无限循环 | DevTools 控制台观察 |
| E | `localStorage` 在 electron-sandbox 中可读写持久化 | DevTools 控制台 |
| F | `<script src="./local.js">` 能被 CSP 正常加载 | 临时注入 workbench.html |

---

## 第一阶段：DevTools 控制台验证（无需改任何文件）

### 前置步骤

打开 Cursor → `Help` → `Toggle Developer Tools`（或 `Cmd+Shift+I`）→ 切到 **Console** 标签

---

### 验证 A：textContent 是否可以修改

打开 Cursor 设置面板（`Cmd+,`），在 Console 执行：

```javascript
// 找到第一个包含英文文字的文本节点并修改
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
let node;
while ((node = walker.nextNode())) {
  if (/^[A-Z][a-zA-Z\s]+$/.test(node.textContent.trim()) && node.textContent.trim().length > 3) {
    console.log('找到节点:', node.textContent);
    node.textContent = '【已汉化】' + node.textContent;
    break;
  }
}
```

**✅ 期望结果**：页面上某个英文文字变为 `【已汉化】xxx`，无报错  
**❌ 失败表现**：抛出 SecurityError 或页面无变化

---

### 验证 B：Tooltip 文字是 textContent 还是 title 属性

鼠标**悬停**在任意设置项上，等 tooltip 出现，然后在 Console 执行：

```javascript
// 查找最近插入的 tooltip 元素
const tooltips = document.querySelectorAll('[class*="tooltip"], [role="tooltip"], [data-tooltip]');
tooltips.forEach(el => {
  console.log('tagName:', el.tagName);
  console.log('textContent:', el.textContent);
  console.log('title attr:', el.getAttribute('title'));
});
```

或者直接在 **Elements** 面板悬停 → 观察是否有新的元素插入 DOM，以及该元素是否有 textContent。

**✅ 期望结果**：tooltip 是一个有 textContent 的 DOM 元素，`title` 属性为空  
**❌ 失败表现**：tooltip 来自原生 `title` 属性（则需要补充属性翻译逻辑）

---

### 验证 C：MutationObserver 能捕获动态渲染

在 Console 执行以下代码，然后在设置面板**点击不同菜单项**切换页面：

```javascript
let count = 0;
const obs = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        count++;
        console.log(`[#${count}] 新文本节点:`, JSON.stringify(node.textContent.trim()));
      }
    }
  }
});
obs.observe(document.body, { childList: true, subtree: true });
console.log('MutationObserver 已启动，请切换设置页面...');
```

**✅ 期望结果**：切换菜单后，Console 持续打印新出现的英文文本节点  
**❌ 失败表现**：无任何输出（observer 被沙箱阻止）

---

### 验证 D：修改 textContent 是否引发 SolidJS 重渲染循环

在上一步 observer 运行时，再执行：

```javascript
// 监听 characterData 变化，检查我们修改后是否触发再次回调
const obs2 = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === 'characterData') {
      console.warn('[characterData 变化]', m.target.textContent);
    }
  }
});
obs2.observe(document.body, { characterData: true, subtree: true });

// 手动修改一个文本节点
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
let node;
while ((node = walker.nextNode())) {
  if (node.textContent.trim() === 'General') {
    node.textContent = '通用';
    console.log('已修改 General → 通用，观察有无循环...');
    break;
  }
}
```

等待 3 秒观察。

**✅ 期望结果**：修改后无连续的 characterData 回调，`"通用"` 维持不变  
**❌ 失败表现**：不停打印 characterData 回调（SolidJS 持续覆写）或文字闪回英文

---

### 验证 E：localStorage 可用性

```javascript
// 写入
localStorage.setItem('cursor_i18n_test', JSON.stringify({ 'General': '通用', _ts: Date.now() }));

// 读取
const cached = JSON.parse(localStorage.getItem('cursor_i18n_test'));
console.log('缓存读取:', cached);

// 验证跨重载是否持久（重启 Cursor 后再次读取）
```

重启 Cursor 后再次打开 DevTools，执行 `localStorage.getItem('cursor_i18n_test')`。

**✅ 期望结果**：重启后数据仍存在  
**❌ 失败表现**：返回 `null`（需改用其他持久化方案，如 IndexedDB）

---

## 第二阶段：脚本注入验证（需临时修改 workbench.html）

> 仅在第一阶段全部通过后执行。

### 步骤

**1. 创建最小化测试脚本**

```bash
# 在 workbench 目录创建测试脚本
cat > /Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/cursor-i18n-test.js << 'EOF'
console.log('[cursor-i18n] 运行时脚本加载成功 ✅');
document.addEventListener('DOMContentLoaded', () => {
  console.log('[cursor-i18n] DOM 就绪，body 子节点数:', document.body.childNodes.length);
});
EOF
```

**2. 在 workbench.html 注入 script 标签**

在 `<script src="./workbench.js">` 之前加一行：

```html
<script src="./cursor-i18n-test.js"></script>
```

**3. macOS 重签名**

```bash
sudo xattr -cr /Applications/Cursor.app
sudo codesign --force --deep --sign - /Applications/Cursor.app
```

**4. 重启 Cursor，打开 DevTools**

**✅ 期望结果**：Console 输出 `[cursor-i18n] 运行时脚本加载成功 ✅`，无 CSP 报错  
**❌ 失败表现**：`Refused to load script` CSP 错误

---

## 验证结果记录

| 假设 | 通过 | 失败 | 备注 |
|------|------|------|------|
| A - textContent 可修改 | | | |
| B - Tooltip 是 textContent | | | |
| C - Observer 捕获动态节点 | | | |
| D - 无 SolidJS 循环 | | | |
| E - localStorage 持久化 | | | |
| F - 脚本注入无 CSP 错误 | | | |

> 🟢 A~D 全部通过 → 核心方案可行，立即进入 M1 开发  
> 🔴 任意一项失败 → 记录失败原因，调整对应技术方案后重新验证
