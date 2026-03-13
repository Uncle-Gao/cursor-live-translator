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
        productJson: path.join(appRoot, 'product.json'),
        backupJs: path.join(appRoot, 'out', 'vs', 'workbench', 'workbench.desktop.main.js.bak')
    };
}

// === 2. 翻译字典 ===
const dictionary = {
    // 导航
    'General': '常规', 'Agents': '智能体', 'Tab': 'Tab', 'Models': '模型',
    'Cloud Agents': 'Cloud 智能体', 'Rules, Skills, Subagents': '规则、技能、子智能体',
    'Tools & MCP': '工具与 MCP', 'Hooks': '钩子', 'Indexing & Docs': '索引与文档',
    'Beta': '公测',
    // 常规
    'Manage Account': '管理账户', 'Upgrade to Pro': '升级到 Pro', 'Preferences': '偏好设置',
    'Keyboard Shortcuts': '键盘快捷键', 'Privacy': '隐私', 'Log Out': '注销登录',
    // 智能体
    'Auto-Run Mode': '自动运行模式', 'Command Allowlist': '命令白名单', 'MCP Allowlist': 'MCP 白名单',
    'Browser Protection': '浏览器保护', 'File-Deletion Protection': '文件删除保护',
    'Default Approach': '默认方法', 'Web Search Tool': '网页搜索工具', 'Applying Changes': '应用更改',
    'Inline Editing & Terminal': '内联编辑与终端', 'Terminal Hint': '终端提示', 'Voice Mode': '语音模式',
    'Attribution': '属性归属',
    // Tab
    'Cursor Tab': 'Cursor Tab', 'Partial Accepts': '部分采纳', 'Imports': '导入',
    // 聊天界面
    'New Chat': '新对话', 'Type a message...': '输入消息...', 'Search codebase': '搜索代码库',
    'Search files': '搜索文件', 'Ask a question': '提个问题', 'Composer': 'Composer',
    'Toggle Chat Pane': '切换聊天面板', 'Maximize Chat': '最大化聊天', 'Close Tab': '关闭标签页',
    'Export Transcript': '导出对话记录'
};

const fragments = [
    { en: "Commands that can run automatically", cn: "可以自动运行的命令" },
    { en: "MCP tools that can run automatically. Format: 'server:tool'", cn: "可以自动运行的 MCP 工具。格式：'server:tool'" },
    { en: "Prevent Agent from automatically running Browser tools", cn: "防止智能体自动运行浏览器工具" },
    { en: "Prevent Agent from automatically running MCP tools", cn: "防止智能体自动运行 MCP 工具" },
    { en: "Prevent Agent from deleting files automatically", cn: "防止智能体自动删除文件" },
    { en: "Prevent Agent from creating or modifying files outside of the workspace automatically", cn: "防止智能体自动在工作区外创建或修改文件" },
    { en: "Submit with Ctrl + Enter", cn: "使用 Ctrl + Enter 提交" },
    { en: "When enabled, Ctrl + Enter submits chat and Enter inserts a newline", cn: "启用后，Ctrl + Enter 提交聊天，Enter 插入新行" },
    { en: "Automatically jump to the next diff when accepting changes with Ctrl+Y", cn: "使用 Ctrl+Y 接受更改时，自动跳转到下一个差异处" },
    { en: "Automatically parse links when pasted into Quick Edit (Ctrl+K) input", cn: "粘贴到快速编辑 (Ctrl+K) 输入框时自动解析链接" },
    { en: "Apply .cursorignore files to all subdirectories", cn: "将 .cursorignore 文件应用于所有子目录" },
    { en: "Use with caution. Skip symlinks during .cursorignore file discovery", cn: "谨慎使用。在发现 .cursorignore 文件时跳过符号链接" },
    { en: 'Show a hint for ', cn: '在终端中显示 ' },
    { en: 'K in the Terminal', cn: 'K 的提示' },
    { en: "Mark Agent commits as 'Made with Cursor'", cn: '将智能体生成的提交标记为“由 Cursor 创作”' },
    { en: 'Mark pull requests as made with Cursor', cn: '将拉取请求标记为“由 Cursor 创作”' },
    { en: "Accept the next word of a suggestion via ", cn: "通过采纳建议中的下一个词： " },
    { en: "Automatically import necessary modules for ", cn: "自动导入必要的模块： " },
    { en: "Type a message...", cn: "输入消息..." }
];

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
        console.log(`汉化可能会部分失效，建议继续前确保已自动备份。`);
    }
    
    // 1. 备份检测
    if (!fs.existsSync(paths.backupJs)) {
        console.log('正在创建原始文件备份...');
        fs.copyFileSync(paths.mainJs, paths.backupJs);
    }

    let content = fs.readFileSync(paths.mainJs, 'utf8');
    let count = 0;

    // 2. 执行翻译替换 (闭合引号匹配)
    const sortedKeys = Object.keys(dictionary).sort((a, b) => b.length - a.length);
    for (const en of sortedKeys) {
        const escapedEn = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(["'\`])` + escapedEn + `\\1`, 'g');
        if (content.match(regex)) {
            content = content.replace(regex, `$1${dictionary[en]}$1`);
            count++;
        }
    }

    // 3. 执行碎片化补全
    for (const item of fragments) {
        if (content.includes(item.en)) {
            content = content.split(item.en).join(item.cn);
            count++;
        }
    }

    // 4. 写回文件
    fs.writeFileSync(paths.mainJs, content, 'utf8');
    console.log(`✓ 翻译完成，共处理 ${count} 处词条。`);

    // 5. 自动修复校验 (Fix Checksum)
    console.log('正在自动修复文件校验值...');
    const mainJsBuffer = fs.readFileSync(paths.mainJs);
    const newHash = crypto.createHash('sha256').update(mainJsBuffer).digest('base64').replace(/=+$/, '');
    
    product.checksums['vs/workbench/workbench.desktop.main.js'] = newHash;
    fs.writeFileSync(paths.productJson, JSON.stringify(product, null, '\t'), 'utf8');
    
    console.log('✓ 校验值已同步，警告已消除。');
    console.log('\n✨ 汉化大功告成！请彻底重启 Cursor 以查看效果。');
    console.log('\n按任意键返回菜单...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        showMenu(paths);
    });
}

function restoreOfficial(paths) {
    if (!fs.existsSync(paths.backupJs)) {
        console.log('❌ 找不到备份文件，无法恢复。');
        return showMenu(paths);
    }

    console.log('正在恢复官方原版资源...');
    fs.copyFileSync(paths.backupJs, paths.mainJs);
    
    // 恢复原来的校验值 (从备份计算)
    const backupBuffer = fs.readFileSync(paths.backupJs);
    const originalHash = crypto.createHash('sha256').update(backupBuffer).digest('base64').replace(/=+$/, '');
    const product = JSON.parse(fs.readFileSync(paths.productJson, 'utf8'));
    product.checksums['vs/workbench/workbench.desktop.main.js'] = originalHash;
    fs.writeFileSync(paths.productJson, JSON.stringify(product, null, '\t'), 'utf8');

    console.log('✓ 已恢复官方原版，校验值已回正。');
    showMenu(paths);
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
