/**
 * cursor-live-translator-runtime.js (V2.5.0 - Live Edition)
 * 支持 OpenAI 与 DeepL 双协议的高品质实时翻译引擎。
 */

// === 1. 外部注入配置与初始化 ===
const I18N_TERMS = window.__CURSOR_TERMS__ || {};
const CONFIG = window.__I18N_CONFIG__ || { apiType: 'none', skip: {} };
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'KBD', 'SAMP']);
const SKIP_TITLES = CONFIG.skip?.titles || [];
const SKIP_URLS = CONFIG.skip?.urls || [];
const SKIP_SELECTORS = CONFIG.skip?.selectors || [];
const CACHE_KEY = 'cursor_i18n_v2_pro_cache';
const IS_WORKBENCH = window.self === window.top;

// === 2. 缓存体系 ===
let CACHE = {};
try {
  CACHE = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
} catch (e) { }

// 一次性重置检查 (V2.5 物理清理)
if (CONFIG.resetCache) {
  localStorage.removeItem(CACHE_KEY);
  CACHE = {};
  console.log('%c[I18N] 已执行缓存物理重置', 'color:#f59e0b;font-weight:bold');
}

/**
 * 缓存状态监控器
 * 计算当前 localStorage 占用的字节数并输出到控制台，同时提供百分比预警（基于 5MB 限制）
 */
function logCacheStatus() {
  if (!IS_WORKBENCH && Object.keys(CACHE).length === 0) return;
  try {
    const serialized = JSON.stringify(CACHE);
    const blob = new Blob([serialized]);
    const kb = (blob.size / 1024).toFixed(2);
    const limitKB = 5120; // 5MB
    const percent = ((kb / limitKB) * 100).toFixed(2);

    let color = '#10b981'; // 绿色 (正常)
    if (percent > 80) color = '#ef4444'; // 红色 (危险)
    else if (percent > 50) color = '#f59e0b'; // 橙色 (警告)

    console.log(
      `%c[I18N]${CONFIG.name ? ` [${CONFIG.name}]` : ''}%c 翻译缓存占用: %c${kb} KB / ${limitKB} KB (${percent}%)`,
      'color:#3b82f6;font-weight:bold',
      'color:inherit',
      `color:${color};font-weight:bold`
    );
  } catch (e) {
    console.warn('[I18N] 无法计算缓存体积:', e.message);
  }
}

// === 3. 异步翻译管线 (智能防抖与批处理) ===
const PENDING_JOBS = new Set();
const IN_FLIGHT_JOBS = new Set();
let globalBatchTimer = null;
const REQUEST_INTERVAL = 2000;
const DEBUG_STYLE = `
  /* 仅在激活态显示边框 */
  body.i18n-debug-active .i18n-debug-highlight {
    outline: 1px dashed #3b82f6 !important;
    outline-offset: -1px !important;
    background-color: rgba(59, 130, 246, 0.1) !important;
    position: relative !important;
  }
  #i18n-hover-tooltip {
    position: fixed; z-index: 1000000; padding: 6px 10px;
    background: rgba(0, 0, 0, 0.85); color: #fff; border-radius: 4px;
    font-size: 12px; pointer-events: none; display: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); backdrop-filter: blur(4px);
    border: 1px solid rgba(255,255,255,0.1); max-width: 450px;
    word-break: break-word; line-height: 1.4;
  }
  .i18n-loading::after {
    content: '';
    display: inline-block;
    width: 0.8em;
    height: 0.8em;
    margin-left: 6px;
    vertical-align: middle;
    border: 2px solid rgba(59, 130, 246, 0.2);
    border-top-color: #4f5f7cff;
    border-radius: 50%;
    animation: i18n-spin 0.8s linear infinite;
    z-index: 1000;
    pointer-events: none;
    opacity: 1 !important;
  }
  @keyframes i18n-spin {
    to { transform: rotate(360deg); }
  }
`;
const HAS_CHINESE = /[\u4e00-\u9fa5]/;

/**
 * 核心：多引擎适配转发器
 * 根据用户配置的 AI 类型（如 OpenAI 协议兼容族或 DeepL）分发翻译任务
 * @param {Array<string>} texts - 需要翻译的整条原始长句集合
 */
async function callOnlineAPI(texts) {
  if (CONFIG.apiType === 'none') return;

  if (CONFIG.apiType === 'openai' && CONFIG.openai?.apiKey) {
    await callOpenAI(texts);
  } else if (CONFIG.apiType === 'deepl' && CONFIG.deepl?.apiKey) {
    await callDeepL(texts);
  }
}

/**
 * OpenAI 协议适配
 */
async function callOpenAI(texts) {
  const prompt = `Translate software UI strings to Simplified Chinese (Faithful, Expressive, Elegant). 
Return JSON ONLY with keys as original strings and values as translated strings.
Strings: ${JSON.stringify(texts)}`;

  try {
    const response = await fetch(CONFIG.openai.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.openai.apiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.openai.model,
        messages: [{ role: 'system', content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 4096,
        temperature: 0.3
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    const result = JSON.parse(content);
    applyTranslations(result);
  } catch (err) {
    console.error('[I18N] OpenAI Error:', err.message || err);
  }
}

/**
 * DeepL 协议适配 (DeepL API 不支持批处理 JSON 直接返回，需循环或特殊处理)
 * 注：DeepL 免费版通常一次请求只能翻译一个，此处为了性能采用分次异步并发
 */
async function callDeepL(texts) {
  const results = {};
  const promises = texts.map(async (text) => {
    try {
      const params = new URLSearchParams();
      params.append('auth_key', CONFIG.deepl.apiKey);
      params.append('text', text);
      params.append('target_lang', 'ZH');

      const response = await fetch(CONFIG.deepl.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });
      const data = await response.json();
      if (data.translations?.[0]?.text) {
        results[text] = data.translations[0].text;
      }
    } catch (e) { }
  });

  await Promise.all(promises);
  applyTranslations(results);
}

/**
 * 翻译结果生效器
 * 将获取到的全新翻译键值对持久化到 localStorage（二级缓存），并触发 DOM 重绘
 * @param {object} newMap - 新的 { '英文原句': '中文翻译' } 字典映射
 */
function applyTranslations(newMap) {
  Object.assign(CACHE, newMap);
  for (const k in newMap) {
    IN_FLIGHT_JOBS.delete(k);
    PENDING_JOBS.delete(k);
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(CACHE));
  } catch (e) {
    console.error('%c[I18N] 写入缓存失败 (可能超 5MB 限制):', 'color:#ef4444;font-weight:bold', e.message);
  }

  // 桥接：如果是主窗口，则通知所有 Webview 插件更新缓存
  if (IS_WORKBENCH) {
    const broadcast = (win) => {
        if (!win || !win.frames) return;
        for (let i = 0; i < win.frames.length; i++) {
            const frame = win.frames[i];
            try {
                frame.postMessage({ type: 'I18N_BRIDGE_PUSH', newMap }, '*');
                broadcast(frame);
            } catch (e) {}
        }
    };
    broadcast(window);
  }

  logCacheStatus();
  requestAnimationFrame(() => walkAndTranslate(document.body));
}

/**
 * 在线翻译防抖调度中心
 * 当本地字典未命中时触发。利用 setTimeout 将极短时间内（2000ms）产生的大量零碎断句
 * 合并为一个批次数组后统一发送至 AI，从而极大节省 Token 损耗并减少并发网络请求。
 * @param {string} text - 等待调度的原始长句
 */
function scheduleTranslation(text) {
  if (I18N_TERMS[text] || CACHE[text] || PENDING_JOBS.has(text) || IN_FLIGHT_JOBS.has(text) || CONFIG.apiType === 'none') return;

  if (!IS_WORKBENCH) {
    // 桥接：Webview 无法直接联网 (CSP 限制)，向主窗口申请翻译 (直连 top)
    if (window.top && window.top !== window.self && typeof window.top.postMessage === 'function') {
      PENDING_JOBS.add(text);
      window.top.postMessage({ type: 'I18N_BRIDGE_REQ', text }, '*');
    }
    return;
  }

  PENDING_JOBS.add(text);

  if (globalBatchTimer) clearTimeout(globalBatchTimer);
  globalBatchTimer = setTimeout(() => {
    let batch = Array.from(PENDING_JOBS);
    if (batch.length > 0) {
      batch.forEach(t => {
        PENDING_JOBS.delete(t);
        IN_FLIGHT_JOBS.add(t);
      });

      const chunkSize = 30;
      for (let i = 0; i < batch.length; i += chunkSize) {
        const chunk = batch.slice(i, i + chunkSize);
        callOnlineAPI(chunk);
      }
    }
  }, REQUEST_INTERVAL);
}

// === 4. 核心匹配逻辑与正则引擎 ===
let REGEX_RULES = [];

/**
 * 初始化正则匹配引擎 (M4 特性)
 * 启动时将配置在 dictionary.json 中的字符串形式的正则表达式预编译为 RegExp 对象，
 * 从而在后续高频的 DOM 遍历中极大提升正则测试速度。
 */
function initRegexRules() {
  if (!I18N_TERMS.regex) return;
  for (const [pattern, template] of Object.entries(I18N_TERMS.regex)) {
    try { REGEX_RULES.push({ re: new RegExp(pattern), template }); } catch (e) { }
  }
}

// 递归查找嵌套字典 (由 V2 嵌套结构改版支持)
function findInNestedDict(dict, key) {
  if (dict[key] && typeof dict[key] === 'string') return dict[key];
  for (const v of Object.values(dict)) {
    if (typeof v === 'object' && v !== null) {
      const res = findInNestedDict(v, key);
      if (res) return res;
    }
  }
  return null;
}

function getTranslation(text) {
  const t = text.trim();
  if (!t || t.length < 2) return null;

  // 1. 本地字典直接匹配
  const direct = findInNestedDict(I18N_TERMS, t);
  if (direct) return direct;

  // 2. 缓存匹配
  if (CACHE[t]) return CACHE[t];

  // 3. 正则模式匹配 (M4 核心)
  for (const rule of REGEX_RULES) {
    if (rule.re.test(t)) {
      const result = t.replace(rule.re, rule.template);
      CACHE[t] = result; // 存入缓存以防重复正则计算
      return result;
    }
  }

  // 4. 安全检查：如果已包含中文且无本地配置，则跳过 AI 调度，防止重复翻译
  if (HAS_CHINESE.test(t)) return null;

  // 5. 调度 AI 翻译
  scheduleTranslation(t);
  return null;
}

/**
 * 屏蔽检查：判断节点是否处于被屏蔽的区域中
 */
function isExcluded(node) {
  if (!node) return false;
  // 检查元素节点及其祖先
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!el) return false;

  // 1. 检查选择器 (带安全保护)
  for (const selector of SKIP_SELECTORS) {
    if (!selector || typeof selector !== 'string') continue;
    try {
      if (el.closest(selector)) {
        // 仅对元素节点在控制台输出提示，避免日志淹没
        if (node.nodeType === Node.ELEMENT_NODE) {
          console.warn(`[Cursor-Live-Translator] 屏蔽区域匹配成功: ${selector}`, node);
        }
        return true;
      }
    } catch (e) {
      console.error(`[Cursor-Live-Translator] 非法的 CSS 选择器: ${selector}`);
    }
  }
  return false;
}

function processNode(node) {
  if (isExcluded(node)) return;
  const raw = node.textContent.trim();
  const trans = getTranslation(raw);
  const parent = node.parentElement;

  if (trans && node.textContent !== node.textContent.replace(raw, trans)) {
    if (parent) {
      parent.classList.add('i18n-debug-highlight');
      parent.classList.remove('i18n-loading');
      parent.setAttribute('data-i18n-original', raw);
    }
    node.textContent = node.textContent.replace(raw, trans);
  } else if (parent && (PENDING_JOBS.has(raw) || IN_FLIGHT_JOBS.has(raw))) {
    // 异步翻译中，添加动画类
    if (!parent.classList.contains('i18n-loading')) {
      parent.classList.add('i18n-loading');
    }
  }
}

function processTitle(el) {
  if (isExcluded(el)) return;
  const title = el.getAttribute('title');
  if (!title) return;
  const target = getTranslation(title.trim());
  if (target && title !== title.replace(title.trim(), target)) {
    // V2.5: 始终注入标签
    el.classList.add('i18n-debug-highlight');
    el.setAttribute('data-i18n-original-title', title);
    el.setAttribute('title', title.replace(title.trim(), target));
  }
}

// === 5. DOM 驱动与监听 ===
let mutationBuffer = [];
let rafId = null;

/**
 * 核心：高效 DOM 树递归遍历
 * 仅筛选符合条件的文本节点 (Node_TEXT) 和带有 title 属性的元素节点。
 * 运用原生 TreeWalker API 穿越复杂的网页嵌套结构并批量执行渲染。
 * @param {Node} root - 起始根节点，通常为 document.body 或被 Observer 捕获的变动节点
 */
function walkAndTranslate(root) {
  if (!root || !root.isConnected) return;
  if (root.nodeType === Node.TEXT_NODE) {
    processNode(root);
  } else if (root.nodeType === Node.ELEMENT_NODE) {
    if (SKIP_TAGS.has(root.tagName)) return;
    if (root.hasAttribute('title')) processTitle(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, (n) => {
      return (n.parentElement && SKIP_TAGS.has(n.parentElement.tagName)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    });
    let textNode;
    while ((textNode = walker.nextNode())) processNode(textNode);
  }
}

function handleMutations() {
  rafId = null;
  const nodes = mutationBuffer.splice(0, mutationBuffer.length);
  nodes.forEach(n => { if (n.isConnected) walkAndTranslate(n); });
}

/**
 * MutationObserver 全量节点嗅探器
 * 核心作用：当界面 UI 发生任何细微变动（组件加载、AI 生成流式输出文字）时精准切入翻译。
 * 性能优化：利用 requestAnimationFrame (RAF) 将堆积的 DOM 更新统一推迟到下一帧渲染前执行，
 * 避免了因同步重绘造成的“界面白屏抖动/卡顿”。
 */
const observer = new MutationObserver((mutations) => {
  let hasAct = false;
  for (const m of mutations) {
    if (m.type === 'childList') {
      m.addedNodes.forEach(n => { mutationBuffer.push(n); hasAct = true; });
    } else if (m.type === 'attributes' && m.attributeName === 'title') {
      mutationBuffer.push(m.target);
      hasAct = true;
    }
  }
  if (hasAct && !rafId) rafId = requestAnimationFrame(handleMutations);
});

function init() {
  if (SKIP_URLS.some(u => location.href.includes(u)) || SKIP_TITLES.some(t => document.title.includes(t))) return;

  initRegexRules();

  // 始终注入样式和 Tooltip 节点
  const style = document.createElement('style');
  style.textContent = DEBUG_STYLE;
  document.head.appendChild(style);

  const tooltip = document.createElement('div');
  tooltip.id = 'i18n-hover-tooltip';
  document.body.appendChild(tooltip);

  // 全平台快捷键监听 (Mac/Win)
  window.addEventListener('keydown', (e) => {
    // 切换高亮: Cmd/Ctrl + Opt/Alt + Shift + B
    const isToggle = (e.metaKey || e.ctrlKey) && e.altKey && e.shiftKey && e.code === 'KeyB';
    if (isToggle) {
      const newState = !document.body.classList.contains('i18n-debug-active');
      document.body.classList.toggle('i18n-debug-active', newState);
      if (IS_WORKBENCH) {
        broadcastMessage({ type: 'I18N_DEBUG_SYNC', state: newState });
      } else if (window.top && window.top !== window.self) {
        window.top.postMessage({ type: 'I18N_DEBUG_SYNC', state: newState }, '*');
      }
      console.log('[I18N] 调试模式已同步切换:', newState);
    }
  });

  // 辅助函数：全窗口广播
  function broadcastMessage(data) {
    const broadcast = (win) => {
      if (!win || !win.frames) return;
      for (let i = 0; i < win.frames.length; i++) {
        const frame = win.frames[i];
        try {
          frame.postMessage(data, '*');
          broadcast(frame);
        } catch (e) { }
      }
    };
    broadcast(window);
  }

  // 悬停感应 (仅在高亮模式下按住 Alt/Option 生效)
  document.body.addEventListener('mouseover', (e) => {
    if (!document.body.classList.contains('i18n-debug-active') || !e.altKey) return;
    const target = e.target.closest('.i18n-debug-highlight');
    if (target) {
      const original = target.getAttribute('data-i18n-original') || target.getAttribute('data-i18n-original-title');
      if (original) {
        tooltip.textContent = `原文：${original}`;
        tooltip.style.display = 'block';
        tooltip.style.left = `${Math.min(e.clientX + 10, window.innerWidth - tooltip.offsetWidth - 20)}px`;
        tooltip.style.top = `${Math.min(e.clientY + 10, window.innerHeight - tooltip.offsetHeight - 20)}px`;
      }
    }
  });
  document.body.addEventListener('mouseout', () => { tooltip.style.display = 'none'; });

  // 桥接协议监听
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;

    if (e.data.type === 'I18N_DEBUG_SYNC') {
      const state = !!e.data.state;
      if (document.body.classList.contains('i18n-debug-active') !== state) {
        document.body.classList.toggle('i18n-debug-active', state);
        if (IS_WORKBENCH) broadcastMessage({ type: 'I18N_DEBUG_SYNC', state });
      }
      return;
    }

    if (IS_WORKBENCH && e.data.type === 'I18N_BRIDGE_REQ') {
      // 主窗口接收到插件的翻译请求
      const text = e.data.text;
      const trans = getTranslation(text);
      if (trans && e.source) {
        e.source.postMessage({ type: 'I18N_BRIDGE_PUSH', newMap: { [text]: trans } }, '*');
      }
    } else if (!IS_WORKBENCH && e.data.type === 'I18N_BRIDGE_PUSH') {
      // 插件接收到主窗口下发的翻译结果
      applyTranslations(e.data.newMap);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
  walkAndTranslate(document.body);
  logCacheStatus();
  console.log(`%c[Cursor-Live-Translator]%c ${CONFIG.name ? `[${CONFIG.name}] ` : ''}动力系统就绪 | V2.5.0 (Eng: ${CONFIG.engineId || CONFIG.apiType})`, 'color:#8b5cf6;font-weight:bold', '');
}

if (document.body) init();
else document.addEventListener('DOMContentLoaded', init);
window.__CURSOR_I18N_INJECTED__ = true;
