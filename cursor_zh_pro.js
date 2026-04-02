const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const os = require('os');

/**
 * Cursor-Live-Translator (V2.5.0 架构：HTML 注入 + AI 实时刷新)
 * 适配版本：2.6.21+
 */
const BASE_CURSOR_VERSION = '2.6.21';

// === 1. 环境与持久化配置 ===
const CONFIG_DIR = path.join(os.homedir(), '.cursor_live_translator');
const OLD_CONFIG_DIR = path.join(os.homedir(), '.cursor_zh_pro');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

// V2.3 推荐的默认屏蔽列表 (精细化控制)
const DEFAULT_SKIPS = [
    ".monaco-breadcrumbs",                    // 面包屑导航
    ".view-lines.monaco-mouse-cursor-text",   // 编辑器代码行
    ".monaco-list-row",                       // 各种列表项 (资源管理器、搜索等)
    ".pane-header.expanded",                  // 面板标题
    ".xterm-link-layer",                      // 终端内部链接
    ".conversations",                         // AI 对话流区域 (隔离保护)
    ".aislash-editor-input",                  // AI 命令输入框 (防止占位符被翻)
    ".composer-file-list-item",               // AI Composer 文件列表项 (保护文件名)
    ".agent-sidebar-cell-content-wrapper"     // AI Agent 侧边栏单元 (隔离保护)
];

function ensureConfigDir() {
    // [V2.3 品牌迁移逻辑]：如果旧配置目录存在而新目录不存在，则执行自动迁移
    if (fs.existsSync(OLD_CONFIG_DIR) && !fs.existsSync(CONFIG_DIR)) {
        try {
            fs.renameSync(OLD_CONFIG_DIR, CONFIG_DIR);
            console.log(`\n\x1b[32m💡 检测到旧版本配置，已成功迁移至新品牌路径: ~/.cursor_live_translator\x1b[0m\n`);
        } catch (e) {
            console.warn(`\n⚠️ 自动迁移配置失败: ${e.message}。您可以手动将 ~/.cursor_zh_pro 更名为 ~/.cursor_live_translator。\n`);
        }
    }

    if (!fs.existsSync(CONFIG_DIR)) {
        try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch (e) { }
    }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

/**
 * 核心路径探测与解析
 * 根据当前操作系统（Win/Mac/Linux），自动定位 Cursor 的底层核心目录
 * @param {string} customRoot - 用户自定义的根目录（如果自动探测失败）
 */
function getPaths(customRoot = null) {
    let appRoot = customRoot;

    if (!appRoot) {
        const platform = process.platform;
        if (platform === 'win32') {
            const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
            const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
            const possibleWinPaths = [
                path.join(localAppData, 'Programs', 'cursor', 'resources', 'app'),
                path.join(programFiles, 'Cursor', 'resources', 'app'),
                path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'cursor', 'resources', 'app')
            ];
            appRoot = possibleWinPaths.find(p => fs.existsSync(path.join(p, 'product.json'))) || '';
        } else if (platform === 'darwin') {
            appRoot = '/Applications/Cursor.app/Contents/Resources/app';
        } else {
            const possibleLinuxPaths = [
                '/usr/lib/cursor/resources/app',
                '/opt/cursor/resources/app',
                path.join(process.env.HOME || '', '.local', 'lib', 'cursor', 'resources', 'app')
            ];
            appRoot = possibleLinuxPaths.find(p => fs.existsSync(path.join(p, 'product.json'))) || '';
        }
    }

    if (!appRoot || !fs.existsSync(appRoot) || !fs.existsSync(path.join(appRoot, 'product.json'))) {
        return null;
    }

    const workbenchDir = path.join(appRoot, 'out', 'vs', 'code', 'electron-sandbox', 'workbench');

    return {
        root: appRoot,
        workbenchDir: workbenchDir,
        workbenchHtml: path.join(workbenchDir, 'workbench.html'),
        workbenchJs: path.join(workbenchDir, 'workbench.js'),
        cursorI18nJs: path.join(workbenchDir, 'cursor-i18n.js'),
        productJson: path.join(appRoot, 'product.json'),
        // 旧版 v1 路径用于清理和恢复
        mainJs: path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
        backupMainJs: path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.js.bak'),
        nlsJson: path.join(appRoot, 'out', 'nls.messages.json'),
        backupNlsJson: path.join(appRoot, 'out', 'nls.messages.json.bak')
    };
}

// === 2. 加载字典 ===
const flattenDict = (obj, res = {}) => {
    for (let key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            flattenDict(obj[key], res);
        } else {
            res[key] = obj[key];
        }
    }
    return res;
};

function loadI18n() {
    let resultDict = {
        "Manage Account": "管理账号",
        "Upgrade to Pro": "升级到 Pro"
    };
    try {
        // 全量 V2 主字典
        const dictPath = path.join(__dirname, 'i18n', 'dictionary.json');
        if (fs.existsSync(dictPath)) {
            const rawDictionary = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
            // 不再使用 flattenDict，保留嵌套结构和 regex 对象，运行时引擎已支持递归查找
            Object.assign(resultDict, rawDictionary);
            console.log(`  ✓ 已从 [${dictPath}] 加载全量本地化词库 (词条数量: ${Object.keys(resultDict).length}+)`);
        } else {
            console.error(`❌ 未找到字典文件: ${dictPath}`);
        }
    } catch (err) {
        console.error('❌ 加载 i18n 数据失败:', err.message);
    }
    return resultDict;
}

const I18N_DICT = loadI18n();

// === 3. 配置管理 ===
const DEFAULT_ENTITY_SKIP = () => ({ titles: [], urls: [], selectors: [...DEFAULT_SKIPS] });

function loadConfig() {
    ensureConfigDir();
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            if (!cfg.engines) cfg.engines = {};

            // [V2.6.0 配置升级] 检测旧格式 (skip.selectors 直接存在) 并自动迁移
            if (cfg.skip && Array.isArray(cfg.skip.selectors)) {
                console.log('\x1b[32m 🔄 [V2.6 配置升级] 检测到旧版屏蔽规则格式，自动迁移至分域结构...\x1b[0m');
                cfg.skip = {
                    _cursor_: {
                        titles: cfg.skip.titles || [],
                        urls: cfg.skip.urls || [],
                        selectors: cfg.skip.selectors.length > 0 ? cfg.skip.selectors : [...DEFAULT_SKIPS]
                    }
                };
                saveConfig(cfg);
                console.log('\x1b[32m  ✓ 您的 API Key 和自定义屏蔽规则已完整保留。\x1b[0m');
            }

            // 确保 _cursor_ 节点存在
            if (!cfg.skip) cfg.skip = {};
            if (!cfg.skip._cursor_) cfg.skip._cursor_ = DEFAULT_ENTITY_SKIP();
            const cursorSkip = cfg.skip._cursor_;
            if (!cursorSkip.selectors) cursorSkip.selectors = [...DEFAULT_SKIPS];
            if (!cursorSkip.titles) cursorSkip.titles = [];
            if (!cursorSkip.urls) cursorSkip.urls = [];

            // 智能合并：将最新的 DEFAULT_SKIPS 推荐规则合并至 _cursor_ (去重)
            const currentSelectors = new Set(cursorSkip.selectors);
            let hasNew = false;
            DEFAULT_SKIPS.forEach(s => {
                if (!currentSelectors.has(s)) { cursorSkip.selectors.push(s); hasNew = true; }
            });
            if (hasNew) saveConfig(cfg);

            return cfg;
        } catch (e) {
            console.error(`\n❌ 解析配置文件 [${CONFIG_PATH}] 失败: ${e.message}`);
            console.error(`请检查文件内容是否为合法的 JSON 格式。您也可以尝试删除该文件并重新配置。\n`);
        }
    }
    return {
        activeId: 'none',
        engines: {
            openai: { endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-4o-mini' },
            deepseek: { endpoint: 'https://api.deepseek.com/chat/completions', apiKey: '', model: 'deepseek-chat' },
            qwen: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', apiKey: '', model: 'qwen-turbo' },
            kimi: { endpoint: 'https://api.moonshot.cn/v1/chat/completions', apiKey: '', model: 'moonshot-v1-8k' },
            deepl: { endpoint: 'https://api-free.deepl.com/v2/translate', apiKey: '' }
        },
        skip: { _cursor_: DEFAULT_ENTITY_SKIP() },
        resetCache: false
    };
}
function saveConfig(cfg) {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

// === 4. 插件 Webview 汉化模块 ===

// 'anthropic.claude-code-2.1.90-darwin-x64' → 'anthropic.claude-code'
function toPluginKey(dirName) {
    return dirName.replace(/-[\d]+(\.[\d]+)*(-[a-z].*)?$/, '');
}

// 获取某实体的屏蔽配置，不存在则创建空结构
function getEntitySkip(config, key) {
    if (!config.skip) config.skip = {};
    if (!config.skip[key]) config.skip[key] = { titles: [], urls: [], selectors: [] };
    const s = config.skip[key];
    if (!s.titles) s.titles = [];
    if (!s.urls) s.urls = [];
    if (!s.selectors) s.selectors = [];
    return s;
}

// 查找某插件当前已有的备份文件（含版本号）
function getExistingBak(plugin) {
    const dir = path.dirname(plugin.webviewJs);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const bakFile = files.find(f => f.startsWith('index.js.') && f.endsWith('.bak'));
    if (!bakFile) return null;
    const verMatch = bakFile.match(/^index\.js\.(.+)\.bak$/);
    return { path: path.join(dir, bakFile), version: verMatch ? verMatch[1] : 'unknown' };
}

// 扫描 ~/.cursor/extensions/ 找到所有含 webview/index.js 的插件
function getPluginPaths() {
    const extDir = path.join(os.homedir(), '.cursor', 'extensions');
    if (!fs.existsSync(extDir)) return [];
    const results = [];
    for (const name of fs.readdirSync(extDir)) {
        const webviewJs = path.join(extDir, name, 'webview', 'index.js');
        if (!fs.existsSync(webviewJs)) continue;
        let version = 'unknown';
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(extDir, name, 'package.json'), 'utf8'));
            version = pkg.version || 'unknown';
        } catch (e) { }
        const pluginKey = toPluginKey(name);
        results.push({ name, version, webviewJs, pluginKey, bakPath: `${webviewJs}.${version}.bak` });
    }
    return results;
}

// 对单个插件执行备份 + 注入
function patchPlugin(plugin, runtimeCode, config) {
    const existingBak = getExistingBak(plugin);
    if (existingBak && existingBak.version !== plugin.version) {
        console.log(`  ⚠️ 检测到插件已更新 (${existingBak.version} → ${plugin.version})，清除旧备份并重新备份...`);
        fs.unlinkSync(existingBak.path);
    }
    if (!fs.existsSync(plugin.bakPath)) {
        fs.copyFileSync(plugin.webviewJs, plugin.bakPath);
        console.log(`  ✓ 已备份原始文件 (v${plugin.version})`);
    }
    fs.copyFileSync(plugin.bakPath, plugin.webviewJs); // 每次从干净备份重新注入
    const pluginSkip = getEntitySkip(config, plugin.pluginKey);
    const activeEngine = config.engines[config.activeId];
    const runtimeConfig = {
        apiType: (config.activeId === 'none') ? 'none' : (config.activeId === 'deepl' ? 'deepl' : 'openai'),
        engineId: config.activeId,
        openai: (config.activeId !== 'none' && config.activeId !== 'deepl') ? activeEngine : null,
        deepl: (config.activeId === 'deepl') ? activeEngine : null,
        skip: pluginSkip,
        resetCache: false,
        name: plugin.name
    };
    const injectCode = `\n\n// === * cursor-live-translator-runtime.js (V2.6.0 - Live Edition) v${plugin.version} ===\n` +
        `(function(){\n` +
        `window.__CURSOR_TERMS__ = Object.assign(window.__CURSOR_TERMS__ || {}, ${JSON.stringify(I18N_DICT)});\n` +
        `window.__I18N_CONFIG__ = ${JSON.stringify(runtimeConfig)};\n` +
        `${runtimeCode}\n` +
        `})();\n`;
    fs.appendFileSync(plugin.webviewJs, injectCode, 'utf8');
    console.log(`  ✓ ${plugin.name} @${plugin.version} 已注入汉化引擎`);
}

// 对单个插件执行恢复
function restorePlugin(plugin) {
    const existingBak = getExistingBak(plugin);
    if (!existingBak) { console.log(`  ⚠️ ${plugin.name} 无备份，跳过`); return false; }
    fs.copyFileSync(existingBak.path, plugin.webviewJs);
    fs.unlinkSync(existingBak.path);
    console.log(`  ✓ ${plugin.name} 已还原为原版`);
    return true;
}

// 插件汉化交互式管理菜单
async function managePluginLocalization() {
    const runtimePath = path.join(__dirname, 'cursor-i18n-runtime.js');
    if (!fs.existsSync(runtimePath)) {
        console.error('❌ 找不到运行时引擎 (cursor-i18n-runtime.js)');
        await askQuestion('按回车返回...');
        return;
    }
    const runtimeCode = fs.readFileSync(runtimePath, 'utf8');

    while (true) {
        console.clear();
        const config = loadConfig();
        const plugins = getPluginPaths();

        console.log('\n==== Webview 插件汉化管理 ====');
        if (plugins.length === 0) {
            console.log('\n未检测到任何含 Webview 界面的插件。');
            await askQuestion('按回车返回...');
            return;
        }

        console.log('\n[已发现的 Webview 插件]');
        plugins.forEach((p, i) => {
            const bak = getExistingBak(p);
            let status;
            if (!bak) { status = '⚪ 未汉化'; }
            else if (bak.version !== p.version) { status = `🟡 已汉化 v${bak.version} [⚠️ 插件已更新为 v${p.version}，建议重新汉化]`; }
            else { status = `🟢 已汉化 v${bak.version}`; }
            console.log(` ${i + 1}. ${p.name}  [${status}]`);
        });

        console.log('\n[汉化操作]');
        console.log(' A.  汉化所有插件');
        console.log(' 1-N. 选择序号汉化单个插件');
        console.log('\n[恢复操作]');
        console.log(' B.  恢复所有插件原版');
        console.log(' R+序号. 恢复单个插件 (如 R1)');
        console.log('\n Q.  返回主菜单');

        const choice = (await askQuestion('\n请选择操作: ')).trim();
        if (choice.toUpperCase() === 'Q') break;

        if (choice.toUpperCase() === 'A') {
            console.log('\n--- 汉化所有 Webview 插件 ---');
            for (const p of plugins) patchPlugin(p, runtimeCode, config);
            saveConfig(config);
            console.log('\n✅ 全部插件汉化完成！请彻底重启 Cursor 后生效。');
            await askQuestion('按回车继续...');
        } else if (choice.toUpperCase() === 'B') {
            console.log('\n--- 恢复所有 Webview 插件原版 ---');
            let count = 0;
            for (const p of plugins) { if (restorePlugin(p)) count++; }
            console.log(`\n✅ 已还原 ${count} 个插件。请彻底重启 Cursor 后生效。`);
            await askQuestion('按回车继续...');
        } else if (/^r\d+$/i.test(choice)) {
            const idx = parseInt(choice.slice(1)) - 1;
            if (idx >= 0 && idx < plugins.length) {
                restorePlugin(plugins[idx]);
                console.log('\n✅ 已还原。请彻底重启 Cursor 后生效。');
            } else { console.log('❌ 序号无效。'); }
            await askQuestion('按回车继续...');
        } else {
            const idx = parseInt(choice) - 1;
            if (idx >= 0 && idx < plugins.length) {
                console.log(`\n--- 汉化 ${plugins[idx].name} ---`);
                patchPlugin(plugins[idx], runtimeCode, config);
                saveConfig(config);
                console.log('\n✅ 汉化完成！请彻底重启 Cursor 后生效。');
            } else { console.log('❌ 无效输入。'); }
            await askQuestion('按回车继续...');
        }
    }
}


async function main() {
    let paths = getPaths();
    while (!paths) {
        console.warn('\n⚠️ 自动检测未发现 Cursor 默认安装目录。');
        let prompt = '请输入您的 Cursor 所在目录 (如果退出请输入 Q):';
        if (process.platform === 'win32') {
            prompt += '\n  提示: 通常位于 C:\\Users\\您的用户名\\AppData\\Local\\Programs\\cursor';
        }
        let customPath = await askQuestion(`${prompt}\n> `);
        customPath = customPath.replace(/^["']|["']$/g, '').trim();

        if (customPath.toLowerCase() === 'q') {
            console.log('提前结束。');
            process.exit(0);
        }

        let testPaths = [
            customPath,
            path.join(customPath, 'resources', 'app'),
            path.join(customPath, 'Contents', 'Resources', 'app')
        ];

        for (let p of testPaths) {
            paths = getPaths(p);
            if (paths) break;
        }

        if (!paths) {
            console.error(`\n❌ 获取不到有效的特征文件，请检查您的路径是否输入正确。`);
        }
    }

    showMenu(paths);
}

function cleanOrphanedBackups(paths) {
    let deletedCount = 0;
    // 清理可能存在的旧版 V1 残留备份
    const scanDirs = [
        path.join(paths.root, 'out'),
        path.join(paths.root, 'extensions')
    ];

    const scanAndClean = (dir) => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
                if (fs.statSync(fullPath).isDirectory()) {
                    scanAndClean(fullPath);
                } else if (file.endsWith('.bak')) {
                    if (file.includes('workbench.desktop.main.js') || file.includes('nls.json') || file.includes('nls.messages.json')) {
                        fs.unlinkSync(fullPath);
                        deletedCount++;
                    }
                }
            } catch (e) { }
        }
    };

    scanDirs.forEach(d => scanAndClean(d));
    return deletedCount;
}

async function showMenu(paths) {
    console.clear();
    const config = loadConfig();
    console.log(`\n==== Cursor-Live-Translator: 实时本地化引擎 (V2.5.0 PRO) ====`);
    const isMac = process.platform === 'darwin';
    console.log(` 💡 [操作指引] 调试高亮: ${isMac ? 'Cmd+Opt+Shift+B' : 'Ctrl+Alt+Shift+B'} | 溯源原文: ${isMac ? 'Option' : 'Alt'} + 悬停`);
    console.log(` 架构方案 : Trusted Bootstrap + AI Real-time + Plugin Webview (V2.6)`);

    let version = 'unknown';
    let hasCurrentBak = false;
    try {
        const currentProduct = JSON.parse(fs.readFileSync(paths.productJson, 'utf8'));
        version = currentProduct.version;
        const bakPattern = `workbench.js.${version}.bak`;
        const versionedBak = path.join(paths.workbenchDir, bakPattern);
        hasCurrentBak = fs.existsSync(versionedBak);
    } catch (e) {
        console.error(`\n❌ 读取 Cursor 核心配置 (product.json) 失败: ${e.message}`);
        console.warn(`建议手动检查路径: ${paths.productJson}\n`);
        const retry = await askQuestion('是否尝试输入新路径？(y/n): ');
        if (retry.toLowerCase() === 'y') return main();
        process.exit(1);
    }

    // 扫描所有可能的旧备份
    const allFiles = fs.readdirSync(paths.workbenchDir);
    const otherBaks = allFiles.filter(f => (f.includes('.js.') || f.includes('.html.')) && f.endsWith('.bak') && !f.includes(version));

    let backupStatus = hasCurrentBak ? `🟢 [版本匹配] v${version} 引导备份就绪` : `🔴 [无当前备份] 建议汉化以创建 v${version} 备份`;
    if (otherBaks.length > 0) {
        backupStatus += ` (检测到 ${otherBaks.length} 个跨版本孤块)`;
    }
    console.log(` 备份状态 : ${backupStatus}`);

    const engines = config.engines || {};
    let aiStatus = '未开启 (仅离线字典)';
    if (config.activeId !== 'none') {
        aiStatus = `[${config.activeId}] 🟢 正在运行`;
    }
    const otherSaved = Object.keys(engines).filter(id => id !== config.activeId && engines[id].apiKey);
    if (otherSaved.length > 0) {
        aiStatus += ` / 其他已就绪: [${otherSaved.join(', ')}]`;
    }
    console.log(` AI 引擎  : ${aiStatus}`);

    // 插件汉化状态
    const webviewPlugins = getPluginPaths();
    const localizedPlugins = webviewPlugins.filter(p => getExistingBak(p));
    if (webviewPlugins.length > 0) {
        const pluginStatus = localizedPlugins.length > 0
            ? `🟢 ${localizedPlugins.length}/${webviewPlugins.length} 个 Webview 插件已注入`
            : `⚪ ${webviewPlugins.length} 个 Webview 插件尚未汉化`;
        console.log(` 插件汉化 : ${pluginStatus}`);
    }

    const orphanedCount = cleanOrphanedBackups(paths);
    if (orphanedCount > 0) {
        console.log(`\n 🧹 已为您静默清除了 ${orphanedCount} 个来自旧版 V1 的遗留备份垃圾！`);
    }

    console.log(`\n============== 操作菜单 ==============`);
    console.log(` 1. 一键汉化 (V2 动态注入模式)`);
    console.log(` 2. 恢复官方原版`);
    console.log(` 3. 配置 AI 翻译引擎 (信达雅增强)`);
    console.log(` 4. 管理汉化屏蔽规则 (实时预览)`);
    console.log(` 5. 清理全部 AI 实时翻译记录 (排除故障与重置) ${config.resetCache ? '🔴 [已就绪]' : ''}`);
    console.log(` 6. 汉化 Webview 插件 (如 Claude Code)`);
    console.log(` Q. 退出`);
    console.log(`======================================\n`);

    const choice = await askQuestion('请选择操作: ');
    if (choice === '1') await runLocalization(paths);
    else if (choice === '2') await restoreOfficial(paths);
    else if (choice === '3') {
        await configureAI();
        await showMenu(paths);
    }
    else if (choice === '4') {
        await manageShielding();
        await showMenu(paths);
    }
    else if (choice === '5') {
        config.resetCache = !config.resetCache;
        saveConfig(config);
        if (config.resetCache) {
            console.log(`\n✅ 缓存清理指令已就绪！下次执行"一键汉化"并启动 Cursor 时将生效。`);
        } else {
            console.log(`\n已取消缓存清理。`);
        }
        await askQuestion('按回车继续...');
        await showMenu(paths);
    }
    else if (choice === '6') {
        await managePluginLocalization();
        await showMenu(paths);
    }
    else if (choice.toLowerCase() === 'q') rl.close();
    else await showMenu(paths);
}

async function manageShielding() {
    // 先选择要管理哪个目标的屏蔽规则
    let entityKey = '_cursor_';
    let entityName = 'Cursor 主窗口';

    console.clear();
    const allPlugins = getPluginPaths();
    console.log('\n==== 管理屏蔽规则 —— 请选择目标 ====');
    console.log(' 0. Cursor 主窗口 (默认)');
    allPlugins.forEach((p, i) => console.log(` ${i + 1}. ${p.name} (${p.pluginKey})`));
    console.log(' Q. 返回');

    const sel = (await askQuestion('\n请输入编号: ')).trim();
    if (sel.toUpperCase() === 'Q') return;
    if (sel !== '0') {
        const idx = parseInt(sel) - 1;
        if (idx >= 0 && idx < allPlugins.length) {
            entityKey = allPlugins[idx].pluginKey;
            entityName = allPlugins[idx].name;
        } else {
            console.log('❌ 序号无效，默认管理 Cursor 主窗口规则。');
        }
    }

    while (true) {
        console.clear();
        const config = loadConfig();
        const skip = getEntitySkip(config, entityKey);

        console.log(`\n==== 汉化屏蔽规则管理 [目标: ${entityName}] ====`);
        console.log('您可以指定不需要翻译的区域，修改后需重新运行"一键汉化"生效。\n');

        console.log('[当前规则预览]');
        console.log(` 1. 选择器 (Selectors): ${skip.selectors.length > 0 ? skip.selectors.join(', ') : '(无)'}`);
        console.log(` 2. 窗口标题 (Titles):    ${skip.titles.length > 0 ? skip.titles.join(', ') : '(无)'}`);
        console.log(` 3. URL 关键词 (URLs):     ${skip.urls.length > 0 ? skip.urls.join(', ') : '(无)'}`);

        console.log('\n[操作指令]');
        console.log(' A. 添加选择器 (推荐，如 .sidebar)');
        console.log(' B. 添加标题库 (如 Output)');
        console.log(' C. 添加 URL 库 (如 settings)');
        console.log(' D. 移除现有规则');
        console.log(` R. 重置规则${entityKey === '_cursor_' ? ' (恢复默认推荐值)' : ' (清空自定义规则)'}`);
        console.log(' Q. 返回上一级');

        const choice = (await askQuestion('\n请选择操作: ')).toUpperCase();
        if (choice === 'Q') {
            console.log('\n\x1b[33m[重要提示]\x1b[0m 屏蔽规则已保存。请务必返回主菜单执行 \x1b[1m"1. 一键汉化"\x1b[0m 并 \x1b[1m重启/刷新窗口\x1b[0m 后生效。');
            await askQuestion('按回车返回...');
            break;
        }

        if (choice === 'R') {
            const confirm = await askQuestion('\n确定要重置该目标的屏蔽规则吗? (Y/N): ');
            if (confirm.toUpperCase() === 'Y') {
                config.skip[entityKey] = entityKey === '_cursor_' ? DEFAULT_ENTITY_SKIP() : { titles: [], urls: [], selectors: [] };
                saveConfig(config);
                console.log('✓ 已重置屏蔽配置。');
                await askQuestion('按回车继续...');
            }
            continue;
        }

        if (choice === 'A' || choice === 'B' || choice === 'C') {
            const typeMap = { 'A': 'selectors', 'B': 'titles', 'C': 'urls' };
            const typeName = { 'A': '选择器', 'B': '标题关键词', 'C': 'URL 关键词' };
            const target = typeMap[choice];
            console.log(`\n请输入要增加的${typeName[choice]}`);
            console.log(`\x1b[32m[提示]\x1b[0m 推荐直接粘贴开发者工具中复制的类名或 HTML 片段，系统将自动识别格式。`);
            const input = await askQuestion('> ');
            let items = input.split(',').map(s => s.trim()).filter(s => s.length > 0);

            if (choice === 'A') {
                items = items.map(item => {
                    if (item.startsWith('<')) {
                        const classMatch = item.match(/class=["'](.*?)["']/);
                        const idMatch = item.match(/id=["'](.*?)["']/);
                        if (classMatch) return '.' + classMatch[1].split(' ').filter(c => c).join('.');
                        if (idMatch) return '#' + idMatch[1];
                    }
                    if (/^[a-zA-Z0-9_-]+$/.test(item)) return '.' + item;
                    if (item.includes(' ') && !item.startsWith('.') && !item.startsWith('#')) {
                        return '.' + item.split(' ').filter(c => c).join('.');
                    }
                    return item;
                });
            }

            if (items.length > 0) {
                skip[target] = [...new Set([...skip[target], ...items])];
                saveConfig(config);
                console.log('✅ 已添加成功！');
            }
        }
        else if (choice === 'D') {
            const allItems = [];
            let count = 1;
            ['selectors', 'titles', 'urls'].forEach(key => {
                skip[key].forEach(val => allItems.push({ key, val, id: count++ }));
            });

            if (allItems.length === 0) {
                console.log('\n目前没有任何自定义规则。');
                await askQuestion('按回车继续...');
                continue;
            }

            console.log('\n[请选择要移除的规则编号]:');
            allItems.forEach(item => console.log(` ${item.id}. [${item.key}] ${item.val}`));
            console.log(' B. 取消');

            const delIdx = await askQuestion('\n请输入编号: ');
            const targetItem = allItems.find(it => it.id === parseInt(delIdx));
            if (targetItem) {
                skip[targetItem.key] = skip[targetItem.key].filter(v => v !== targetItem.val);
                saveConfig(config);
                console.log('🗑️ 已成功移除。');
            }
        }
    }
}

async function testModel(activeId, engines) {
    const target = engines[activeId];
    if (!target || !target.apiKey) return { ok: false, msg: '未配置 API Key' };

    console.log(`  ⏳ 正在验证 ${activeId} 连通性...`);
    try {
        if (activeId !== 'deepl') {
            const res = await fetch(target.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${target.apiKey}` },
                body: JSON.stringify({ model: target.model, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 })
            });
            if (res.ok) return { ok: true };
            const err = await res.json();
            return { ok: false, msg: err.error?.message || res.statusText };
        } else {
            const params = new URLSearchParams();
            params.append('auth_key', target.apiKey);
            params.append('text', 'Hi');
            params.append('target_lang', 'ZH');
            const res = await fetch(target.endpoint, { method: 'POST', body: params });
            if (res.ok) return { ok: true };
            return { ok: false, msg: `HTTP ${res.status}` };
        }
    } catch (e) {
        return { ok: false, msg: e.message };
    }
}

async function configureAI() {
    console.clear();
    const config = loadConfig();
    console.log('\n==== AI 翻译配置中心 ====');
    console.log(` 持久化目录: ${CONFIG_DIR}\n`);

    const engineList = [
        { id: 'openai', name: 'OpenAI (国际版)' },
        { id: 'deepseek', name: 'DeepSeek (国产推荐)' },
        { id: 'qwen', name: '通义千问 (Qwen)' },
        { id: 'kimi', name: 'Kimi (Moonshot)' },
        { id: 'deepl', name: 'DeepL 原生态' }
    ];

    engineList.forEach((en, i) => {
        const stored = config.engines[en.id];
        const status = (stored && stored.apiKey) ? ' (已配置)' : ' (未配置)';
        const active = (config.activeId === en.id) ? ' [当前激活]' : '';
        console.log(`${i + 1}. ${en.name}${status}${active}`);
    });
    console.log(`${engineList.length + 1}. 关闭 AI (回归离线模式)`);
    console.log('B. 返回主菜单');

    const choice = await askQuestion('\n请选择要切换或配置的模型: ');
    if (choice.toLowerCase() === 'b') return;

    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < engineList.length) {
        const targetId = engineList[idx].id;
        const targetName = engineList[idx].name;

        if (!config.engines[targetId]) {
            config.engines[targetId] = { endpoint: '', apiKey: '', model: '' };
        }
        const targetConfig = config.engines[targetId];

        if (targetConfig.apiKey) {
            console.log(`\n检测到 ${targetName} 已有保存的配置。`);
            console.log('1. 直接激活并测试');
            console.log('2. 修改/重新配置');
            console.log('3. 取消');
            const sub = await askQuestion('请选择操作: ');
            if (sub === '1') {
                config.activeId = targetId;
                const test = await testModel(targetId, config.engines);
                if (test.ok) {
                    console.log('✅ 验证完成！已切换当前模型。');
                    saveConfig(config);
                } else {
                    console.log(`❌ 验证失败: ${test.msg}`);
                    if ((await askQuestion('仍要切换此配置吗？(y/n): ')).toLowerCase() !== 'y') return;
                    saveConfig(config);
                }
                return;
            } else if (sub === '3') return;
        }

        // 配置录入逻辑
        config.activeId = targetId;
        const helpText = {
            openai: ' (官网: platform.openai.com)',
            deepseek: ' (官网: platform.deepseek.com)',
            qwen: ' (阿里云 DashScope)',
            kimi: ' (Moonshot AI)',
            deepl: ' (DeepL Developer Portal)'
        }[targetId] || '';

        console.log(`\n--- 正在配置 ${targetName}${helpText} ---`);

        if (targetId !== 'deepl') {
            const defaults = {
                openai: { e: 'https://api.openai.com/v1/chat/completions', m: 'gpt-4o-mini' },
                deepseek: { e: 'https://api.deepseek.com/chat/completions', m: 'deepseek-chat' },
                qwen: { e: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', m: 'qwen-turbo' },
                kimi: { e: 'https://api.moonshot.cn/v1/chat/completions', m: 'moonshot-v1-8k' }
            }[targetId];

            targetConfig.endpoint = await askQuestion(`接口地址 (API Endpoint) [${targetConfig.endpoint || defaults.e}]: `) || targetConfig.endpoint || defaults.e;
            targetConfig.model = await askQuestion(`模型名称 (Model ID) [${targetConfig.model || defaults.m}]: `) || targetConfig.model || defaults.m;
            targetConfig.apiKey = await askQuestion(`请输入 API Key (输入后回车): `) || targetConfig.apiKey;
        } else {
            targetConfig.endpoint = await askQuestion(`接口地址 (API Endpoint) [${targetConfig.endpoint || 'https://api-free.deepl.com/v2/translate'}]: `) || targetConfig.endpoint || 'https://api-free.deepl.com/v2/translate';
            targetConfig.apiKey = await askQuestion(`请输入 Auth Key (DeepL 专用令牌): `) || targetConfig.apiKey;
        }

        const test = await testModel(targetId, config.engines);
        if (test.ok) {
            console.log('✅ 测试连通成功！配置已保存。');
            saveConfig(config);
        } else {
            console.log(`❌ 测试失败: ${test.msg}`);
            if ((await askQuestion('仍要保存吗？(y/n): ')).toLowerCase() === 'y') saveConfig(config);
        }
    } else if (idx === engineList.length) {
        config.activeId = 'none';
        saveConfig(config);
        console.log('✅ 已回归离线字典模式。');
    }
}

/**
 * 执行全自动汉化流程 (V2.1 PRO)
 * 核心逻辑：创建物理隔离备份 -> 组装运行时挂载代码 -> 植入系统白名单 (Trusted Injection) -> 重构并闭合全局签名安全链
 * @param {object} paths - 当前被探测出来的各项 Cursor 核心目录路径组合
 */
async function runLocalization(paths) {
    const config = loadConfig();

    // AI 配置引导拦截
    if (config.activeId === 'none') {
        console.log('\n[💡 建议] 您当前未配置或未激活 AI 翻译引擎。');
        console.log('离线字典能处理大部分 UI，但某些动态长句（如 AI 问答框）需 AI 引擎才能实现“信达雅”。');
        const goConfig = await askQuestion('是否先去配置一个 AI 模型？(输入 y 前往配置 / 直接回车跳过): ');
        if (goConfig.toLowerCase() === 'y') {
            await configureAI();
            return showMenu(paths);
        }
    }

    const product = JSON.parse(fs.readFileSync(paths.productJson, 'utf8'));
    const currentVersion = product.version;

    console.log('\n--- 开始全自动汉化流程 (V2 模式) ---');
    console.log(`当前 Cursor 版本: ${currentVersion}`);

    if (currentVersion !== BASE_CURSOR_VERSION) {
        console.log(`\x1b[33m⚠️ 警告: 当前版本 (${currentVersion}) 与预期版本 (${BASE_CURSOR_VERSION}) 不一致，但 V2 具有极强的前后兼容性。\x1b[0m`);
    }

    console.log('\n[1/4] 备份原始环境 (物理版离线隔离)...');
    const versionedBakJs = path.join(paths.workbenchDir, `workbench.js.${currentVersion}.bak`);
    const versionedBakHtml = path.join(paths.workbenchDir, `workbench.html.${currentVersion}.bak`);

    const jsContent = fs.readFileSync(paths.workbenchJs, 'utf8');
    const isAlreadyLocalized = jsContent.includes('// === 安装期编译内联组装 ===');

    if (!fs.existsSync(versionedBakJs)) {
        if (!isAlreadyLocalized) {
            fs.copyFileSync(paths.workbenchJs, versionedBakJs);
            console.log(`  ✓ 已锁定 v${currentVersion} 核心引导程序的原生备份`);
        }
    }

    // 始终尝试备份 HTML (如果目前不是已汉化状态)
    const htmlContent = fs.readFileSync(paths.workbenchHtml, 'utf8');
    if (!fs.existsSync(versionedBakHtml) && !htmlContent.includes('cursor-i18n.js')) {
        fs.copyFileSync(paths.workbenchHtml, versionedBakHtml);
        console.log(`  ✓ 已同步 v${currentVersion} HTML 骨架备份`);
    }

    // 清理跨版本文件
    const allFiles = fs.readdirSync(paths.workbenchDir);
    allFiles.forEach(f => {
        if (f.endsWith('.bak') && !f.includes(currentVersion)) {
            fs.unlinkSync(path.join(paths.workbenchDir, f));
            console.log(`  ✓ 已清理跨代幽灵备份: ${f}`);
        }
    });

    console.log('\n[2/4] 编译运行时代码并挂载至引导链 (Trusted Injection)...');
    const runtimePath = path.join(__dirname, 'cursor-i18n-runtime.js');
    if (!fs.existsSync(runtimePath)) {
        console.error('❌ 找不到运行时引擎 (cursor-i18n-runtime.js)');
        rl.once('line', () => showMenu(paths));
        return;
    }

    const activeEngine = config.engines[config.activeId];
    const runtimeConfig = {
        apiType: (config.activeId === 'none') ? 'none' : (config.activeId === 'deepl' ? 'deepl' : 'openai'),
        engineId: config.activeId,
        openai: (config.activeId !== 'none' && config.activeId !== 'deepl') ? activeEngine : null,
        deepl: (config.activeId === 'deepl') ? activeEngine : null,
        skip: config.skip._cursor_ || DEFAULT_ENTITY_SKIP(),
        resetCache: !!config.resetCache
    };

    let runtimeCode = fs.readFileSync(runtimePath, 'utf8');
    const injectCode = `\n\n// === 安装期编译内联组装 ===\n(function(){\nwindow.__CURSOR_TERMS__ = Object.assign(window.__CURSOR_TERMS__ || {}, ${JSON.stringify(I18N_DICT)});\nwindow.__I18N_CONFIG__ = ${JSON.stringify(runtimeConfig)};\n\n${runtimeCode}\n})();\n`;

    // 如果已经汉化，我们需要先用备份还原基础 JS 再注入，或者直接判定已就绪
    if (isAlreadyLocalized) {
        fs.copyFileSync(versionedBakJs, paths.workbenchJs);
    }
    fs.appendFileSync(paths.workbenchJs, injectCode, 'utf8');
    console.log('  ✓ 核心引导挂载成功 (V2.1 架构)');

    console.log('\n[3/4] 净化 HTML 环境与安全映射...');
    let htmlContentSync = fs.readFileSync(paths.workbenchHtml, 'utf8');

    // 1. 清理旧版注入 (V2.0 -> V2.1 迁移自愈)
    if (htmlContentSync.includes('cursor-i18n.js')) {
        htmlContentSync = htmlContentSync.replace(/[\s\r\n]*<!-- cursor-i18n:[\s\S]*?--\>[\s\r\n]*<script src="\.\/cursor-i18n\.js"><\/script>[\s\r\n]*/g, '');
        fs.writeFileSync(paths.workbenchHtml, htmlContentSync, 'utf8');
        console.log('  ✓ 已清理 V2.0 旧版 HTML 注入挂钩');
    } else {
        console.log('  ✓ HTML 环境纯净');
    }

    // 清理过时的外部文件
    if (fs.existsSync(paths.cursorI18nJs)) {
        fs.unlinkSync(paths.cursorI18nJs);
    }

    console.log('\n[4/4] 覆盖核心哈希校验与数字签名...');
    // 计算 JS 和 HTML 的最新哈希
    const jsHash = crypto.createHash('sha256').update(fs.readFileSync(paths.workbenchJs)).digest('base64').replace(/=+$/, '');
    const htmlHash = crypto.createHash('sha256').update(fs.readFileSync(paths.workbenchHtml)).digest('base64').replace(/=+$/, '');

    product.checksums['vs/code/electron-sandbox/workbench/workbench.js'] = jsHash;
    product.checksums['vs/code/electron-sandbox/workbench/workbench.html'] = htmlHash;

    fs.writeFileSync(paths.productJson, JSON.stringify(product, null, '\t'), 'utf8');
    console.log('  ✓ Checksum 双哈希同步完成');

    if (process.platform === 'darwin') {
        const { execSync } = require('child_process');
        const appBundle = paths.root.replace('/Contents/Resources/app', '');
        try {
            execSync(`xattr -cr "${appBundle}"`);
            execSync(`codesign --force --deep --sign - "${appBundle}"`);
            console.log('  ✓ macOS 签名防御系统已重校');
        } catch (e) {
            console.log('  ⚠️ macOS 签名自动重校失败，请在终端手动执行授权命令。');
        }
    }

    if (config.resetCache) {
        config.resetCache = false;
        saveConfig(config);
    }

    const isMac = process.platform === 'darwin';
    console.log(`\n✨ V2.5.0 汉化顺利完成！请彻底重启 Cursor 以拉起底层的翻译网络。`);
    console.log(`\n💡 温馨提示：`);
    console.log(`   - 调试高亮: ${isMac ? 'Cmd+Opt+Shift+B' : 'Ctrl+Alt+Shift+B'}`);
    console.log(`   - 溯源原文: 按住 ${isMac ? 'Option' : 'Alt'} 键并悬停在中文上`);

    // 自动追加插件汉化询问
    const webviewPlugins = getPluginPaths();
    if (webviewPlugins.length > 0) {
        const patchPlugins = await askQuestion('\n是否同时汉化 Webview 插件 (如 Claude Code)？(Y/n): ');
        if (patchPlugins.toLowerCase() !== 'n') {
            await managePluginLocalization(paths);
        }
    }

    await askQuestion('\n全部操作已完成，按 Enter 键返回主菜单...');
    await showMenu(paths);
}

/**
 * 执行官方原版还原流程
 * 核心逻辑：读取历史版本备份 -> 物理替换遭受注入的受灾文件 -> 回滚 Checksum 与证书 -> 恢复原厂运行状态
 * @param {object} paths - 当前被探测出来的各项 Cursor 核心目录路径组合
 */
async function restoreOfficial(paths) {
    console.log('\n--- 开始恢复官方还原流程 ---');
    const product = JSON.parse(fs.readFileSync(paths.productJson, 'utf8'));
    const currentVersion = product.version;
    const versionedBakJs = path.join(paths.workbenchDir, `workbench.js.${currentVersion}.bak`);
    const versionedBakHtml = path.join(paths.workbenchDir, `workbench.html.${currentVersion}.bak`);

    // 恢复 JS 引导脚本
    if (fs.existsSync(versionedBakJs)) {
        fs.copyFileSync(versionedBakJs, paths.workbenchJs);
        console.log(`  ✓ 已归位 v${currentVersion} 原生引导脚本`);
    }

    // 恢复 HTML 结构 (清除潜在的 V2.0 注入)
    if (fs.existsSync(versionedBakHtml)) {
        fs.copyFileSync(versionedBakHtml, paths.workbenchHtml);
        console.log(`  ✓ 已归位 v${currentVersion} HTML 基础骨架`);
    } else {
        let html = fs.readFileSync(paths.workbenchHtml, 'utf8');
        if (html.includes('cursor-i18n.js')) {
            html = html.replace(/[\s\r\n]*<!-- cursor-i18n:[\s\S]*?--\>[\s\r\n]*<script src="\.\/cursor-i18n\.js"><\/script>[\s\r\n]*/g, '');
            fs.writeFileSync(paths.workbenchHtml, html, 'utf8');
            console.log('  ✓ 已手动擦除 HTML 中的脏代码注入');
        }
    }

    // 清理所有版本备份
    const allFiles = fs.readdirSync(paths.workbenchDir);
    allFiles.forEach(f => {
        if (f.endsWith('.bak')) {
            fs.unlinkSync(path.join(paths.workbenchDir, f));
            console.log(`  ✓ 已清理备份文件: ${f}`);
        }
    });

    if (fs.existsSync(paths.cursorI18nJs)) {
        fs.unlinkSync(paths.cursorI18nJs);
    }

    console.log('\n[!] 正在锁定官方原版哈希...');
    const jsHash = crypto.createHash('sha256').update(fs.readFileSync(paths.workbenchJs)).digest('base64').replace(/=+$/, '');
    const htmlHash = crypto.createHash('sha256').update(fs.readFileSync(paths.workbenchHtml)).digest('base64').replace(/=+$/, '');

    product.checksums['vs/code/electron-sandbox/workbench/workbench.js'] = jsHash;
    product.checksums['vs/code/electron-sandbox/workbench/workbench.html'] = htmlHash;

    fs.writeFileSync(paths.productJson, JSON.stringify(product, null, '\t'), 'utf8');
    console.log('  ✓ 官方原生态 Checksum 已闭合');

    // 顺手恢复可能损坏的老版备胎
    if (fs.existsSync(paths.backupMainJs)) {
        fs.copyFileSync(paths.backupMainJs, paths.mainJs);
        fs.unlinkSync(paths.backupMainJs);
    }

    if (fs.existsSync(paths.cursorI18nJs)) {
        fs.unlinkSync(paths.cursorI18nJs);
        console.log('  ✓ 已移除汉化运行时核心');
    }

    if (fs.existsSync(paths.workbenchHtml)) {
        const buffer = fs.readFileSync(paths.workbenchHtml);
        const hash = crypto.createHash('sha256').update(buffer).digest('base64').replace(/=+$/, '');
        product.checksums['vs/code/electron-sandbox/workbench/workbench.html'] = hash;
        fs.writeFileSync(paths.productJson, JSON.stringify(product, null, '\t'), 'utf8');
        console.log('  ✓ Checksum 哈希验证码还原本源');
    }

    // 顺手恢复可能损坏的老版备胎
    if (fs.existsSync(paths.backupMainJs)) {
        fs.copyFileSync(paths.backupMainJs, paths.mainJs);
        fs.unlinkSync(paths.backupMainJs);
    }
    if (fs.existsSync(paths.backupNlsJson)) {
        fs.copyFileSync(paths.backupNlsJson, paths.nlsJson);
        fs.unlinkSync(paths.backupNlsJson);
    }

    if (process.platform === 'darwin') {
        try {
            console.log('  ⏳ 正在归位 macOS 签名...');
            const { execSync } = require('child_process');
            const appBundle = paths.root.replace('/Contents/Resources/app', '');
            execSync(`xattr -cr "${appBundle}"`);
            execSync(`codesign --force --deep --sign - "${appBundle}"`);
            console.log('  ✓ 重新闭合并认证 macOS 原生态签名');
        } catch (e) { }
    }

    console.log('\n✅ 恢复官方成功！一切内容已还原本源。');

    // 插件汉化联动恢复
    const pluginsWithBak = getPluginPaths().filter(p => getExistingBak(p));
    if (pluginsWithBak.length > 0) {
        console.log(`\n💡 检测到 ${pluginsWithBak.length} 个已汉化的 Webview 插件。`);
        const ans = await askQuestion(`是否一并恢复这些插件至原版？(Y/n): `);
        if (ans.toLowerCase() !== 'n') {
            pluginsWithBak.forEach(p => restorePlugin(p));
        }
    }

    // [V2.5.2 彻底卸载引导]
    const cleanCfg = await askQuestion('\n是否同时清除插件的本地配置文件 (包含 AI Key 与屏蔽规则)？(y/N): ');
    if (cleanCfg.toLowerCase() === 'y') {
        try {
            if (fs.existsSync(CONFIG_DIR)) {
                // 使用递归删除整个配置目录
                fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
                console.log(`  ✓ 已彻底抹除本地配置目录: ${CONFIG_DIR}`);
            }
        } catch (e) {
            console.error(`  ❌ 清除配置失败: ${e.message}`);
        }
    } else {
        console.log('  💡 已保留本地配置，方便您下次快速重新启动。');
    }

    await askQuestion('\n按 Enter 键返回菜单...');
    await showMenu(paths);
}

async function start() {
    try {
        await main();
    } catch (err) {
        console.error('\n❌ 发生严重错误:', err);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.once('data', () => process.exit(1));
    }
}

start();
