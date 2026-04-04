/**
 * cursor-live-translator-runtime.js (V2.5.1 - Live Edition)
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
const MATCHED_SELECTORS = new Set(); // [V2.5.2] 记录已匹配的屏蔽规则，用于日志去重

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
const ERROR_JOBS = new Map(); // [V2.5.1] 用于记录失败任务及原因
let globalBatchTimer = null;
const REQUEST_INTERVAL = 2000;
const API_TIMEOUT = 12000; // [V2.5.3] 网络请求超时限制 (12秒)
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
  .i18n-error::after {
    content: '!';
    display: inline-block;
    width: 0.8em;
    height: 0.8em;
    margin-left: 6px;
    vertical-align: middle;
    text-align: center;
    line-height: 0.7em; /* 居中对齐 */
    font-size: 0.6em;
    font-weight: 900;
    color: #622b2bff;
    border: 2px solid rgba(239, 68, 68, 0.3);
    border-radius: 50%;
    cursor: help;
    box-sizing: border-box;
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

  // [V2.5.3] 配置完整性预检，防止因配置缺失导致的 PENDING 挂起
  const isInvalid = (CONFIG.apiType === 'openai' && !CONFIG.openai?.apiKey) ||
    (CONFIG.apiType === 'deepl' && !CONFIG.deepl?.apiKey);

  if (isInvalid) {
    console.error('[I18N] 翻译配置不完整，无法发起请求:', CONFIG.apiType);
    applyTranslationErrors(texts, '翻译配置不完整 (缺失 API Key)');
    return;
  }

  if (CONFIG.apiType === 'openai') {
    await callOpenAI(texts);
  } else if (CONFIG.apiType === 'deepl') {
    await callDeepL(texts);
  }
}

/**
 * OpenAI 协议适配
 */
async function callOpenAI(texts) {
  if (document.body.classList.contains('i18n-debug-active')) {
    console.log(`%c[I18N-TRACE] OpenAI 请求发起 (${texts.length} 条):`, 'color:#3b82f6', texts);
    console.log(`%c[I18N-TRACE] Payload 预览: ${JSON.stringify(texts).substring(0, 200)}...`, 'color:#64748b');
  }
  const prompt = `UI strings to Simplified Chinese. Return JSON only: {"original": "translated"}.
Strings: ${JSON.stringify(texts)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const response = await fetch(CONFIG.openai.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.openai.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: CONFIG.openai.model,
        messages: [{ role: 'user', content: prompt }], // [V2.5.3] 改为 user 角色防止部分 API 中转站挂起
        stream: false,
        temperature: 0.3
      })
    });

    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const finishReason = data.choices?.[0]?.finish_reason;

    if (!content) throw new Error('Empty AI response');

    if (finishReason === 'length') {
      console.warn('[I18N] 警告：AI 响应因长度限制被截断，建议减小请求规模。');
    }

    try {
      // [V2.5.3] 增强解析：尝试从内容中提取 JSON 块，防止 AI 返回 Markdown 包裹
      const jsonStr = content.match(/\{[\s\S]*\}/)?.[0] || content;
      const result = JSON.parse(jsonStr);
      applyTranslations(result, texts);
    } catch (parseErr) {
      console.error('[I18N] JSON 解析失败。预览:', content.substring(0, 100));
      applyTranslationErrors(texts, 'AI 响应格式非法');
      throw parseErr;
    }
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    console.error('[I18N] OpenAI Error:', isTimeout ? '请求超时' : err.message);
    applyTranslationErrors(texts, isTimeout ? `API 调用超时 (${API_TIMEOUT / 1000}s)` : (err.message || '网络异常'));
  }
}

/**
 * DeepL 协议适配 (DeepL API 不支持批处理 JSON 直接返回，需循环或特殊处理)
 * 注：DeepL 免费版通常一次请求只能翻译一个，此处为了性能采用分次异步并发
 */
async function callDeepL(texts) {
  if (document.body.classList.contains('i18n-debug-active')) {
    console.log(`%c[I18N-TRACE] DeepL 请求发起 (${texts.length} 条):`, 'color:#3b82f6', texts);
  }
  const results = {};
  const promises = texts.map(async (text) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const params = new URLSearchParams();
      params.append('auth_key', CONFIG.deepl.apiKey);
      params.append('text', text);
      params.append('target_lang', 'ZH');

      const response = await fetch(CONFIG.deepl.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
        body: params
      });

      clearTimeout(timer);
      const data = await response.json();
      if (data.translations?.[0]?.text) {
        results[text] = data.translations[0].text;
      }
    } catch (e) {
      clearTimeout(timer);
      console.warn(`[I18N] DeepL item failed: ${text.substring(0, 20)}...`, e.message);
    }
  });

  await Promise.all(promises);
  applyTranslations(results, texts); // [V2.5.3] 传入 texts 统一清理，简化逻辑
}

/**
 * 翻译错误处理器
 */
function applyTranslationErrors(texts, reason) {
  if (document.body.classList.contains('i18n-debug-active')) {
    console.warn(`%c[I18N-TRACE] 翻译失败清理: ${reason}`, 'color:#ef4444', texts);
  }
  texts.forEach(t => {
    ERROR_JOBS.set(t, reason);
    IN_FLIGHT_JOBS.delete(t);
    PENDING_JOBS.delete(t);
  });
  requestAnimationFrame(() => walkAndTranslate(document.body));
}

/**
 * 翻译结果生效器
 * 将获取到的全新翻译键值对持久化到 localStorage（二级缓存），并触发 DOM 重绘
 * @param {object} newMap - 新的 { '英文原句': '中文翻译' } 字典映射
 * @param {Array<string>} originalTexts - [V2.5.3] 原始请求的任务列表，用于确保清理
 */
function applyTranslations(newMap, originalTexts = []) {
  if (document.body.classList.contains('i18n-debug-active')) {
    console.log(`%c[I18N-TRACE] 翻译结果下发: ${Object.keys(newMap).length} 条`, 'color:#10b981', newMap);
  }
  Object.assign(CACHE, newMap);

  // [V2.5.3] 核心修复：无论 AI 是否返回，都必须清除对应的进行中标记
  // 如果提供了 originalTexts，以此为准清理；否则以 newMap 的键为准
  const keysToClear = originalTexts.length > 0 ? originalTexts : Object.keys(newMap);
  keysToClear.forEach(k => {
    IN_FLIGHT_JOBS.delete(k);
    PENDING_JOBS.delete(k);
  });

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
        } catch (e) { }
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

      // [V2.5.3] 桥接请求自清理逻辑：如果 15 秒内主窗口未下发翻译（BRIDGE_PUSH），则强制清理 Loading
      setTimeout(() => {
        if (PENDING_JOBS.has(text) || IN_FLIGHT_JOBS.has(text)) {
          console.warn('[I18N] 桥接请求响应超时:', text);
          applyTranslationErrors([text], '桥接请求无响应 (Workbench Busy)');
        }
      }, API_TIMEOUT + 3000);
    }
    return;
  }

  PENDING_JOBS.add(text);

  if (globalBatchTimer) clearTimeout(globalBatchTimer);
  globalBatchTimer = setTimeout(() => {
    let batch = Array.from(PENDING_JOBS);
    if (batch.length > 0) {
      if (document.body.classList.contains('i18n-debug-active')) {
        console.log(`%c[I18N-TRACE] 发起分批请求: ${batch.length} 条数据`, 'color:#3b82f6');
      }
      batch.forEach(t => {
        PENDING_JOBS.delete(t);
        IN_FLIGHT_JOBS.add(t);
      });

      const chunkSize = 12; // 从 30 减小到 12，防止因翻译过长导致响应截断
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
  if (!t || t.length < 2 || t.length > 800) return null; // 增加长度限制，忽略过长的非 UI 文本

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
        // [V2.5.2] 规则命中记录与去重输出
        if (!MATCHED_SELECTORS.has(selector)) {
          MATCHED_SELECTORS.add(selector);
          if (document.body.classList.contains('i18n-debug-active')) {
            console.warn(`[I18N] 首次捕获屏蔽规则命中: ${selector}`, node);
          }
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

  if (trans) {
    // [V2.5.3] 状态清理逻辑：只要有翻译结果（即使翻译后与原文相同），就必须移除 Loading
    if (parent) {
      parent.classList.add('i18n-debug-highlight');
      parent.classList.remove('i18n-loading');
      parent.setAttribute('data-i18n-original', raw);
    }
    // 只有在内容真实变化时才执行 DOM 更新，减少重绘开销
    if (node.textContent !== node.textContent.replace(raw, trans)) {
      node.textContent = node.textContent.replace(raw, trans);
    }
  } else if (parent && (PENDING_JOBS.has(raw) || IN_FLIGHT_JOBS.has(raw))) {
    // 异步翻译中
    parent.classList.remove('i18n-error');
    if (!parent.classList.contains('i18n-loading')) parent.classList.add('i18n-loading');
  } else if (parent && ERROR_JOBS.has(raw)) {
    // 翻译失败状态
    parent.classList.remove('i18n-loading');
    parent.classList.add('i18n-error', 'i18n-debug-highlight');
    parent.setAttribute('data-i18n-error', ERROR_JOBS.get(raw));
    parent.setAttribute('data-i18n-original', raw);
  } else if (parent && parent.classList.contains('i18n-loading')) {
    // [V2.5.3] 极其重要：状态机异常热修复
    // 如果任务已不在进行中队列，且没有翻译或错误结果，强制移除 Loading 标记
    // 这解决了任务被忽略（Ignored）或被 Watchdog 清理后，UI 状态未能同步的问题
    parent.classList.remove('i18n-loading');
    if (document.body.classList.contains('i18n-debug-active')) {
      console.warn(`[I18N-TRACE] 发现孤立 Loading 节点并强制清理: "${raw.substring(0, 20)}..."`);
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
  } else if (root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    if (root.tagName && SKIP_TAGS.has(root.tagName)) return;
    if (root.hasAttribute && root.hasAttribute('title')) processTitle(root);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, (n) => {
      // 这里的 n.parentElement 可能为 null (如果在 ShadowRoot 下)
      const p = n.parentElement || (n.parentNode && n.parentNode.host);
      return (p && p.tagName && SKIP_TAGS.has(p.tagName)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    });
    let textNode;
    while ((textNode = walker.nextNode())) processNode(textNode);

    // [V2.5.3] 极其重要：递归探测 Shadow DOM 边界
    const elements = (root.nodeType === Node.ELEMENT_NODE) ? [root] : [];
    const all = elements.concat(Array.from(root.querySelectorAll ? root.querySelectorAll('*') : []));
    for (const el of all) {
      if (el.shadowRoot && !el.shadowRoot.__I18N_OBSERVED__) {
        el.shadowRoot.__I18N_OBSERVED__ = true;
        if (document.body.classList.contains('i18n-debug-active')) {
          console.log('%c[I18N-TRACE] 穿透 Shadow DOM:', 'color:#8b5cf6', el);
        }
        walkAndTranslate(el.shadowRoot);
        // 为该 ShadowRoot 动态挂载监听器
        const subObserver = new MutationObserver(() => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => walkAndTranslate(el.shadowRoot), 500);
        });
        subObserver.observe(el.shadowRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
      }
    }
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
      if (newState) {
        console.warn(`[I18N] 调试模式已开启。当前已生效的屏蔽规则汇总：`, Array.from(MATCHED_SELECTORS));
      }
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
      const error = target.getAttribute('data-i18n-error');
      const original = target.getAttribute('data-i18n-original') || target.getAttribute('data-i18n-original-title');
      if (error) {
        tooltip.innerHTML = `<span style="color:#ef4444;font-weight:bold">翻译出错：</span>${error}<br><small style="opacity:0.7">原文：${original}</small>`;
        tooltip.style.display = 'block';
      } else if (original) {
        tooltip.textContent = `原文：${original}`;
        tooltip.style.display = 'block';
      }
      if (tooltip.style.display === 'block') {
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

  // [V2.5.3] Watchdog 僵尸任务监视器：每 30 秒强制检查并清理异常挂起的任务
  setInterval(() => {
    if (PENDING_JOBS.size > 0 || IN_FLIGHT_JOBS.size > 0) {
      console.warn(`[I18N] Watchdog 触发自清理: PENDING(${PENDING_JOBS.size}) | IN_FLIGHT(${IN_FLIGHT_JOBS.size})`);
      PENDING_JOBS.clear();
      IN_FLIGHT_JOBS.clear();
      requestAnimationFrame(() => walkAndTranslate(document.body));
    }
  }, 30000);

  logCacheStatus();
  const runtimeInfo = `V2.5.1 (${CONFIG.apiType}) | 注入于: ${CONFIG.injectTime || '未知'}`;
  console.log(`%c[Cursor-Live-Translator]%c ${CONFIG.name ? `[${CONFIG.name}] ` : ''}动力系统就绪 | ${runtimeInfo}`, 'color:#8b5cf6;font-weight:bold', '');

  // [V2.5.3] 自动冒烟测试：启动时静默测试 API 连通性
  async function smokeTest() {
    console.log(`%c[I18N-SMOKE] 正在进行 API 连通性自检 (${CONFIG.apiType})...`, 'color:#8b5cf6');
    if (CONFIG.apiType === 'none') {
      console.log('%c[I18N-SMOKE] 当前为单机字典模式，跳过自检。', 'color:#f59e0b');
      return;
    }
    try {
      const controller = new AbortController();
      const st = setTimeout(() => controller.abort(), 6000); // 6秒超快检测
      const testText = "Connection Test";

      let res;
      if (CONFIG.apiType === 'openai') {
        res = await fetch(CONFIG.openai.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.openai.apiKey}` },
          signal: controller.signal,
          body: JSON.stringify({ model: CONFIG.openai.model, messages: [{ role: 'user', content: testText }], max_tokens: 1 })
        });
      } else {
        const params = new URLSearchParams();
        params.append('auth_key', CONFIG.deepl.apiKey);
        params.append('text', testText);
        params.append('target_lang', 'ZH');
        res = await fetch(CONFIG.deepl.endpoint, { method: 'POST', body: params, signal: controller.signal });
      }
      clearTimeout(st);
      if (res.ok) {
        console.log('%c[I18N-SMOKE] ✅ API 连通性测试通过！', 'color:#10b981;font-weight:bold');
      } else {
        const errTag = await res.text();
        console.error(`%c[I18N-SMOKE] ❌ API 连通性测试失败！原因: HTTP ${res.status}`, 'color:#ef4444;font-weight:bold', errTag.substring(0, 50));
      }
    } catch (e) {
      console.error('%c[I18N-SMOKE] ❌ 连通性测试异常！可能被网络防火墙或 CSP 禁止。', 'color:#ef4444;font-weight:bold', e.message);
    }
  }
  smokeTest();

  // [V2.5.3] 暴露全局排查工具
  window.__I18N_DIAGNOSE__ = () => {
    console.log('==== [I18N] 实时诊断数据包 ====');
    console.log('PENDING:', Array.from(PENDING_JOBS));
    console.log('IN_FLIGHT:', Array.from(IN_FLIGHT_JOBS));
    console.log('ERRORS:', Object.fromEntries(ERROR_JOBS));
    console.log('CACHE SIZE:', Object.keys(CACHE).length);
    console.log('==== [I18N] 诊断结束 ====');
    return '诊断完成';
  };

  // [V2.5.3] 暴露手动翻译工具
  window.__I18N_TRANSLATE__ = async (text) => {
    console.log(`[I18N-MANUAL] 正在尝试手动翻译: "${text}"...`);
    const originalConfig = Object.assign({}, CONFIG);
    try {
      if (CONFIG.apiType === 'openai') {
        const prompt = `UI strings to Simplified Chinese. Return JSON only: {"original": "translated"}.
Strings: ${JSON.stringify([text])}`;
        const res = await fetch(CONFIG.openai.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.openai.apiKey}` },
          body: JSON.stringify({ model: CONFIG.openai.model, messages: [{ role: 'user', content: prompt }], response_format: { type: "json_object" } })
        });
        const data = await res.json();
        const content = data.choices[0].message.content;
        console.log('[I18N-MANUAL] 接到响应内容:', content);
        return JSON.parse(content);
      }
    } catch (e) {
      console.error('[I18N-MANUAL] 手动翻译异常:', e);
    }
  };
}

if (document.body) init();
else document.addEventListener('DOMContentLoaded', init);
window.__CURSOR_I18N_INJECTED__ = true;
