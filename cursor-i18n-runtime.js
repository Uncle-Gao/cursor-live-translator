/**
 * cursor-i18n-runtime.js (V3.5 - Polyglot Edition)
 * 支持 OpenAI 与 DeepL 双协议的高品质翻译引擎。
 */

// === 1. 外部注入配置与初始化 ===
const I18N_TERMS = window.__CURSOR_TERMS__ || {};
const CONFIG = window.__I18N_CONFIG__ || { apiType: 'none' };
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'KBD', 'SAMP']);
const CACHE_KEY = 'cursor_i18n_v2_pro_cache';

// === 2. 缓存体系 ===
let CACHE = {};
try {
  CACHE = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
} catch (e) {}

// === 3. 异步翻译管线 (智能防抖与批处理) ===
const PENDING_JOBS = new Map();
let globalBatchTimer = null;
const REQUEST_INTERVAL = 2000;

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
  const prompt = `Translate software UI strings to Simplified Chinese (Faithful, Expressive, Elegant). Return JSON ONLY.
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
        response_format: { type: "json_object" }
      })
    });
    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    applyTranslations(result);
  } catch (err) { console.error('[I18N] OpenAI Error', err); }
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
        } catch (e) {}
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
    localStorage.setItem(CACHE_KEY, JSON.stringify(CACHE));
    requestAnimationFrame(() => walkAndTranslate(document.body));
}

/**
 * 在线翻译防抖调度中心
 * 当本地字典未命中时触发。利用 setTimeout 将极短时间内（2000ms）产生的大量零碎断句
 * 合并为一个批次数组后统一发送至 AI，从而极大节省 Token 损耗并减少并发网络请求。
 * @param {string} text - 等待调度的原始长句
 */
function scheduleTranslation(text) {
  if (I18N_TERMS[text] || CACHE[text] || PENDING_JOBS.has(text) || CONFIG.apiType === 'none') return;
  PENDING_JOBS.set(text, true);

  if (globalBatchTimer) clearTimeout(globalBatchTimer);
  globalBatchTimer = setTimeout(() => {
    const batch = Array.from(PENDING_JOBS.keys());
    if (batch.length > 0) {
      callOnlineAPI(batch);
      PENDING_JOBS.clear();
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
        try { REGEX_RULES.push({ re: new RegExp(pattern), template }); } catch (e) {}
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

  // 4. 调度 AI 翻译
  scheduleTranslation(t);
  return null;
}

function processNode(node) {
  const raw = node.textContent.trim();
  const trans = getTranslation(raw);
  if (trans && node.textContent !== node.textContent.replace(raw, trans)) {
    node.textContent = node.textContent.replace(raw, trans);
  }
}

function processTitle(el) {
  const title = el.getAttribute('title');
  if (!title) return;
  const target = getTranslation(title.trim());
  if (target && title !== title.replace(title.trim(), target)) {
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
  initRegexRules(); // M4: 初始化正则引擎
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
  walkAndTranslate(document.body);
  console.log(`%c[Cursor-i18n]%c 多引擎动力系统就绪 | 当前模式: ${CONFIG.apiType}`, 'color:#8b5cf6;font-weight:bold', '');
}

if (document.body) init();
else document.addEventListener('DOMContentLoaded', init);
window.__CURSOR_I18N_INJECTED__ = true;
