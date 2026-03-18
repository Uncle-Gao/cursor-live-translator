const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

/**
 * Cursor 汉化 Pro 版
 * 功能：一键汉化 + 全平台适配 + 自动修复校验 (Checksum)
 * 适配版本：2.6.19
 */

const BASE_CURSOR_VERSION = '2.6.19';

// === 1. 环境与路径检测 ===
function getPaths() {
    const platform = process.platform;
    let appRoot = '';
    
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

async function main() {
    const paths = getPaths();
    if (!paths) {
        console.error('❌ 找不到 Cursor 安装目录。请确保已安装 Cursor。');
        process.exit(1);
    }

    console.log(`\n==== Cursor 汉化 Pro 工具 ====`);
    console.log(`适配 Cursor 版本: ${BASE_CURSOR_VERSION}`);
    console.log(`检测到平台: ${process.platform}`);
    console.log(`安装路径: ${paths.root}`);

    showMenu(paths);
}

function showMenu(paths) {
    console.log(`\n1. 一键汉化 (自动处理备份与校验修复)\n2. 恢复官方原版\nQ. 退出`);
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
                        const backup = fullPath + '.bak';
                        targets.push({ path: fullPath, backup, type: 'json' });
                    }
                } catch(e) {}
            }
        };
        scanNls(extDir);
    }

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
                regex = new RegExp(`(["'\`>])(${escapedEn})(["'\`<])`, 'g');
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
