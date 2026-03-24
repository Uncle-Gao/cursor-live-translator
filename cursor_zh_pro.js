const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

/**
 * Cursor 汉化 Pro 版
 * 功能：一键汉化 + 全平台适配 + 自动修复校验 (Checksum)
 * 适配版本：2.6.19
 */

const BASE_CURSOR_VERSION = '2.6.21';

// === 1. 环境与路径检测 ===
function getPaths(customRoot = null) {
    let appRoot = customRoot;
    
    if (!appRoot) {
        const platform = process.platform;
        if (platform === 'win32') {
            const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
            appRoot = path.join(localAppData, 'Programs', 'cursor', 'resources', 'app');
        } else if (platform === 'darwin') {
            appRoot = '/Applications/Cursor.app/Contents/Resources/app';
        } else {
            // Linux 常见路径
            const possibleLinuxPaths = [
                '/usr/lib/cursor/resources/app',
                '/opt/cursor/resources/app',
                path.join(process.env.HOME || '', '.local', 'lib', 'cursor', 'resources', 'app')
            ];
            appRoot = possibleLinuxPaths.find(p => fs.existsSync(p)) || '';
        }
    }

    if (!appRoot || !fs.existsSync(appRoot)) {
        return null;
    }

    return {
        root: appRoot,
        mainJs: path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
        nlsJson: path.join(appRoot, 'out', 'nls.messages.json'),
        productJson: path.join(appRoot, 'product.json'),
        backupMainJs: path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.js.bak'),
        backupNlsJson: path.join(appRoot, 'out', 'nls.messages.json.bak')
    };
}

// === 2. 加载翻译数据 ===
function loadI18n() {
    try {
        const dictPath = path.join(__dirname, 'i18n', 'dictionary.json');
        const fragPath = path.join(__dirname, 'i18n', 'fragments.json');
        
        // 递归展开嵌套字典的辅助函数
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

        let rawDictionary = {};
        let fragments = [];

        if (fs.existsSync(dictPath)) {
            rawDictionary = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
        }
        if (fs.existsSync(fragPath)) {
            fragments = JSON.parse(fs.readFileSync(fragPath, 'utf8'));
        }

        // 执行字典扁平化处理
        const dictionary = flattenDict(rawDictionary);

        // 如果读取失败或为空，抛出警告
        if (Object.keys(dictionary).length === 0) {
            console.warn('\x1b[33m⚠️ 警告: 字典文件为空或未找到，将使用内置极简词库。\x1b[0m');
            return { dictionary: { "General": "常规" }, fragments };
        }

        return { dictionary, fragments };
    } catch (err) {
        console.error('❌ 加载 i18n 数据失败:', err.message);
        return { dictionary: { "General": "常规" }, fragments: [] };
    }
}

// 代理原来的常量定义
const { dictionary, fragments } = loadI18n();

// === 3. 核心逻辑 ===
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
    let paths = getPaths();
    while (!paths) {
        console.warn('\n⚠️ 自动检测未发现 Cursor 默认安装目录。');
        let customPath = await askQuestion('请输入您的 Cursor 所在目录 (如果退出请输入 Q):\n> ');
        customPath = customPath.replace(/^["']|["']$/g, '').trim();
        
        if (customPath.toLowerCase() === 'q') {
            console.log('提前结束。');
            process.exit(0);
        }

        // 智能补全常见安装路径缺陷
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
    const dirsToScan = [
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
                    // 只针对汉化工具命名的特定文件清理，且排除掉当下版本的后缀
                    if (!file.includes(`.${paths.version}.bak`) && 
                        (file.includes('nls.json') || file.includes('nls.messages.json') || file.includes('workbench.desktop.main.js'))) {
                        fs.unlinkSync(fullPath);
                        deletedCount++;
                    }
                }
            } catch(e) {}
        }
    };

    dirsToScan.forEach(d => scanAndClean(d));
    return deletedCount;
}

function showMenu(paths) {
    console.clear();
    console.log(`\n==== Cursor 汉化 Pro Dashboard ====`);
    console.log(` 适配版本 : ${BASE_CURSOR_VERSION}`);
    console.log(` 运行平台 : ${process.platform}`);
    console.log(` 挂载路径 : ${paths.root}`);
    
    const orphanedCount = cleanOrphanedBackups(paths);
    if (orphanedCount > 0) {
        console.log(`\n 🧹 已为您静默清除了 ${orphanedCount} 个来自旧世代 Cursor 的遗留备份垃圾！`);
    }

    console.log(`\n============== 操作菜单 ==============`);
    console.log(` 1. 一键汉化 (自动处理防爆备份与重签)`);
    console.log(` 2. 恢复官方原版 (自动清除幽灵缓存)`);
    console.log(` Q. 退出`);
    console.log(`======================================\n`);
    rl.question('请选择操作: ', (choice) => {
        if (choice === '1') runLocalization(paths);
        else if (choice === '2') restoreOfficial(paths);
        else if (choice.toLowerCase() === 'q') rl.close();
        else showMenu(paths);
    });
}

function runLocalization(paths) {
    const product = JSON.parse(fs.readFileSync(paths.productJson, 'utf8'));
    const currentVersion = product.version;

    console.log('\n--- 开始全自动汉化流程 ---');
    console.log(`当前 Cursor 版本: ${currentVersion}`);

    if (currentVersion !== BASE_CURSOR_VERSION) {
        console.log(`\x1b[33m⚠️ 警告: 当前版本 (${currentVersion}) 与补丁适配版本 (${BASE_CURSOR_VERSION}) 不一致。\x1b[0m`);
    }
    
    // 1. 备份检测与目标文件列表
    const targets = [
        { path: paths.mainJs, backup: paths.backupMainJs, type: 'js' },
    ];
    /*
     * 🛡️ 架构级安全屏蔽墙 (Anti-Corruption Shield)
     * 在早期的版本中，脚本会扫描并替换以下两大类资源，目前出于极端稳定性考量已被深度屏蔽，原因如下：
     * 
     * 1. 屏蔽 `nls.messages.json`（VS Code 核心翻译语言包）：
     *    - 原因：这是一个结构严谨的巨型 JSON 字典。如果使用全局正则暴力替换，极容易将 JSON 的 "Key（键）" 误伤替换成中文（譬如将 `{"File": "File"}` 破坏为 `{"文件": "文件"}`）。
     *    - 后果：导致 VS Code 底层原生的多语言装载器因为找不到正确的英文代号映射而报错，从而彻底破坏顶部原生菜单栏、命令面板等 UI 渲染。
     * 
     * 2. 屏蔽 `extensions` 目录下所有的 `*.nls.json`（各内置运行扩展包）：
     *    - 原因：第三方扩展（如 Git 组件、TypeScript 语言高亮服务等）的启动逻辑非常脆弱，如果在不知情的情况下破坏了其 NLS Key 的声明匹配。
     *    - 后果：会导致依赖这些 Key 的扩展在后台激活阶段发生内部抛错。引发类似于“代码颜色高亮消失”、“版本控制模块无法加载”等幽灵级 Bug，极难排查。
     * 
     * 💡 结论：将汉化的火力只精确聚焦在 `workbench.desktop.main.js`（这里是 Cursor 自研的 AI 对话台、模型设置等定制界面的真正专属业务区），是保证全系统稳定不崩的最优解法。
     */
    /*
    // 原有的危险扫描代码区（已被隔离）：
    // Add nls.messages.json to targets if it exists
    if (fs.existsSync(paths.nlsJson)) {
        targets.push({ path: paths.nlsJson, backup: paths.backupNlsJson, type: 'json' });
    }

    // 扫描 extensions 目录下的 nls 文件
    const extDir = path.join(paths.root, 'extensions');
    if (fs.existsSync(extDir)) {
        const scanNls = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                try {
                    if (fs.statSync(fullPath).isDirectory()) {
                        scanNls(fullPath);
                    } else if (file.endsWith('.nls.json')) {
                        const backup = fullPath + `.${paths.version}.bak`;
                        targets.push({ path: fullPath, backup, type: 'json' });
                    }
                } catch(e) {}
            }
        };
        scanNls(extDir);
    }
    */

    targets.forEach(target => {
        if (fs.existsSync(target.path) && !fs.existsSync(target.backup)) {
            fs.copyFileSync(target.path, target.backup);
        }
    });

    let totalCount = 0;
    const finalMissed = new Set([...Object.keys(dictionary), ...fragments.map(f => f.en)]);
    const dictionaryEntries = Object.entries(dictionary);

    console.log(`\n扫描到 ${targets.length} 个汉化目标文件。`);

    targets.forEach(target => {
        if (!fs.existsSync(target.path)) return;
        
        let content = fs.readFileSync(target.path, 'utf8');
        let fileCount = 0;
        let changed = false;

        // 2. 执行标准字典替换
        for (const [en, cn] of dictionaryEntries) {
            const escapedEn = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let regex;
            
            if (target.type === 'js') {
                // 增加防呆断言：防止匹配对象属性(:)和赋值(=)以及文件路径
                regex = new RegExp(`(["'\`>])(${escapedEn})(["'\`<])(?=\\s*(?![:=]))(?!.*\\.(?:js|css|json|png|svg))`, 'g');
            } else {
                regex = new RegExp(`(")(${escapedEn})(")`, 'g');
            }
            
            if (content.match(regex)) {
                content = content.replace(regex, `$1${cn}$3`);
                fileCount++;
                totalCount++;
                finalMissed.delete(en);
                changed = true;
            }
        }

        // 3. 执行碎片化补全
        for (const item of fragments) {
            if (content.includes(item.en)) {
                content = content.split(item.en).join(item.cn);
                fileCount++;
                totalCount++;
                finalMissed.delete(item.en);
                changed = true;
            }
        }

        if (changed) {
            fs.writeFileSync(target.path, content, 'utf8');
            console.log(`  ✓ [${target.type.toUpperCase()}] ${path.relative(paths.root, target.path).substring(0, 60)} (${fileCount} 处)`);
        }
    });

    // 5. 自动修复校验 (Fix Checksum)
    console.log('\n正在自动修复文件校验值...');
    
    const fixChecksum = (filePath, key) => {
        if (!fs.existsSync(filePath)) return;
        const buffer = fs.readFileSync(filePath);
        const hash = crypto.createHash('sha256').update(buffer).digest('base64').replace(/=+$/, '');
        product.checksums[key] = hash;
        console.log(`  ✓ 校验值已更新: ${key}`);
    };

    fixChecksum(paths.mainJs, 'vs/workbench/workbench.desktop.main.js');
    if (fs.existsSync(paths.nlsJson)) {
        const nlsKey = Object.keys(product.checksums).find(k => k.endsWith('nls.messages.json')) || 'nls.messages.json';
        fixChecksum(paths.nlsJson, nlsKey);
    }

    fs.writeFileSync(paths.productJson, JSON.stringify(product, null, '\t'), 'utf8');

    // 6. macOS 代码签名修复
    if (process.platform === 'darwin') {
        console.log('\n正在修复 macOS 应用程序签名 (防黑屏致命崩溃)...');
        try {
            const { execSync } = require('child_process');
            const appBundle = paths.root.replace('/Contents/Resources/app', '');
            execSync(`xattr -cr "${appBundle}"`);
            execSync(`codesign --force --deep --sign - "${appBundle}"`);
            console.log('  ✓ macOS 签名修复成功');
        } catch (e) {
            console.log('  ❌ macOS 签名修复失败。如果一会儿启动白屏，请在终端手动执行完毕后再开 Cursor:');
            console.log(`  sudo xattr -cr "${paths.root.replace('/Contents/Resources/app', '')}"`);
            console.log(`  sudo codesign --force --deep --sign - "${paths.root.replace('/Contents/Resources/app', '')}"`);
        }
    }

    // 7. 清除 V8 引擎缓存 (防止新老文件偏移量不匹配引发白屏)
    const os = require('os');
    let cacheDirs = [];
    if (process.platform === 'darwin') {
        cacheDirs = [
            path.join(os.homedir(), 'Library/Application Support/Cursor/Cache'),
            path.join(os.homedir(), 'Library/Application Support/Cursor/CachedData'),
            path.join(os.homedir(), 'Library/Application Support/Cursor/Code Cache')
        ];
    } else if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        cacheDirs = [
            path.join(appData, 'Cursor', 'Cache'),
            path.join(appData, 'Cursor', 'CachedData'),
            path.join(appData, 'Cursor', 'Code Cache')
        ];
    } else {
        const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
        cacheDirs = [
            path.join(configDir, 'Cursor', 'Cache'),
            path.join(configDir, 'Cursor', 'CachedData'),
            path.join(configDir, 'Cursor', 'Code Cache')
        ];
    }
    process.stdout.write('\n正在静默清除 Cursor 的 V8 底层缓存防黑屏... ');
    cacheDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
        }
    });
    console.log('完成!');
    
    console.log('\n✅ 汉化流程全部完成！');
    if (finalMissed.size > 0) {
        console.log(`\x1b[33mℹ️  全量资源扫描后仍有 ${finalMissed.size} 条未匹配：\x1b[0m`);
        const missedList = Array.from(finalMissed).sort();
        missedList.forEach(term => console.log(`  - ${term}`));
        
        // 自动保存到本地日志文件
        fs.writeFileSync('missed_terms.log', missedList.join('\n'), 'utf8');
        console.log(`\n\x1b[32m📄 详细列表已保存至: ${path.join(process.cwd(), 'missed_terms.log')}\x1b[0m`);
    }
    console.log('\n✨ 汉化大功告成！请彻底重启 Cursor 以查看效果。');
    console.log('\n按 Enter 键返回菜单...');
    rl.once('line', () => {
        showMenu(paths);
    });
}

function restoreOfficial(paths) {
    console.log('\n--- 开始恢复官方原版流程 ---');
    const product = JSON.parse(fs.readFileSync(paths.productJson, 'utf8'));
    let restoredCount = 0;

    const restoreFile = (file, backup) => {
        if (fs.existsSync(backup)) {
            fs.copyFileSync(backup, file);
            fs.unlinkSync(backup); // 彻底删除冗余备份，防止污染下一次官方更新
            restoredCount++;
            return true;
        }
        return false;
    };

    // 1. 还原核心文件
    if (restoreFile(paths.mainJs, paths.backupMainJs)) {
        console.log('  ✓ 已恢复: workbench.desktop.main.js');
        const buffer = fs.readFileSync(paths.mainJs);
        const hash = crypto.createHash('sha256').update(buffer).digest('base64').replace(/=+$/, '');
        product.checksums['vs/workbench/workbench.desktop.main.js'] = hash;
    }

    if (restoreFile(paths.nlsJson, paths.backupNlsJson)) {
        console.log('  ✓ 已恢复: nls.messages.json');
        const nlsKey = Object.keys(product.checksums).find(k => k.endsWith('nls.messages.json')) || 'nls.messages.json';
        const buffer = fs.readFileSync(paths.nlsJson);
        const hash = crypto.createHash('sha256').update(buffer).digest('base64').replace(/=+$/, '');
        product.checksums[nlsKey] = hash;
    }

    // 2. 扫描并还原扩展目录
    const extDir = path.join(paths.root, 'extensions');
    if (fs.existsSync(extDir)) {
        const scanAndRestore = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                try {
                    if (fs.statSync(fullPath).isDirectory()) {
                        scanAndRestore(fullPath);
                    } else if (file.endsWith('.nls.json.bak')) {
                        const original = fullPath.replace('.bak', '');
                        fs.copyFileSync(fullPath, original);
                        fs.unlinkSync(fullPath); // 新增：删除残留在扩展目录的幽灵备份文件
                        restoredCount++;
                        console.log(`  ✓ 已恢复扩展资源: ${path.relative(extDir, original)}`);
                    }
                } catch(e) {}
            }
        };
        scanAndRestore(extDir);
    }

    if (restoredCount === 0) {
        console.log('❌ 找不到任何备份文件，无法恢复。');
    } else {
        fs.writeFileSync(paths.productJson, JSON.stringify(product, null, '\t'), 'utf8');
        console.log(`\n✅ 成功恢复 ${restoredCount} 个文件，校验值已回正。`);

        process.stdout.write('⏳ 正在执行底层安全重签与引擎缓存清理，请耐心等待 (约需 3-5 秒)... ');

        if (process.platform === 'darwin') {
            try {
                const { execSync } = require('child_process');
                const appBundle = paths.root.replace('/Contents/Resources/app', '');
                execSync(`xattr -cr "${appBundle}"`);
                execSync(`codesign --force --deep --sign - "${appBundle}"`);
            } catch (e) {}
        }
        
        const os = require('os');
        let cacheDirs = [];
        if (process.platform === 'darwin') {
            cacheDirs = [
                path.join(os.homedir(), 'Library/Application Support/Cursor/Cache'),
                path.join(os.homedir(), 'Library/Application Support/Cursor/CachedData'),
                path.join(os.homedir(), 'Library/Application Support/Cursor/Code Cache')
            ];
        } else if (process.platform === 'win32') {
            const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
            cacheDirs = [
                path.join(appData, 'Cursor', 'Cache'),
                path.join(appData, 'Cursor', 'CachedData'),
                path.join(appData, 'Cursor', 'Code Cache')
            ];
        } else {
            const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
            cacheDirs = [
                path.join(configDir, 'Cursor', 'Cache'),
                path.join(configDir, 'Cursor', 'CachedData'),
                path.join(configDir, 'Cursor', 'Code Cache')
            ];
        }
        cacheDirs.forEach(dir => {
            if (fs.existsSync(dir)) {
                try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
            }
        });
        
        console.log('完成！🎉');
    }
    
    console.log('\n按 Enter 键返回菜单...');
    rl.once('line', () => {
        showMenu(paths);
    });
}

async function start() {
    try {
        await main();
    } catch (err) {
        console.error('\n❌ 发生严重错误:');
        console.error(err);
        console.log('\n程序即将退出，请截图保留错误信息以便排查。');
        console.log('按任意键退出...');
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.once('data', () => {
            process.exit(1);
        });
    }
}

start();
