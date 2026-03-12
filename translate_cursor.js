const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 自动探测 Cursor 安装路径
function getTargetFilePath() {
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
    return path.join(localAppData, 'Programs', 'cursor', 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js');
}

const TARGET_FILE = getTargetFilePath();
const BACKUP_FILE = TARGET_FILE + '.bak';

// 翻译字典 - 遵循 translate-dictionary 技能规范进行分类
const dictionary = {
    // === 0. 侧边栏导航 ===
    'General': '常规',
    'Agents': '智能体',
    'Tab': 'Tab',
    'Models': '模型',
    'Cloud Agents': 'Cloud 智能体',
    'Plugins': '插件',
    'Rules, Skills, Subagents': '规则、技能、子智能体',
    'Tools & MCP': '工具与 MCP',
    'Hooks': '钩子',
    'Indexing & Docs': '索引与文档',
    'Network': '网络',
    'Beta': '公测',

    // === 1. “常规” (General) 页面 ===
    'Manage Account': '管理账户',
    'Manage your account and billing': '管理您的账户和账单',
    'Upgrade to Pro': '升级到 Pro',
    'Preferences': '偏好设置',
    'Sync layouts across windows': '在窗口间同步布局',
    'Editor Settings': '编辑器设置',
    'Keyboard Shortcuts': '键盘快捷键',
    'Import Settings from VS Code': '从 VS Code 导入设置',
    'Layout': '布局',
    'Notifications': '通知',
    'Privacy': '隐私',
    'Log Out': '注销登录',

    // === 2. “智能体” (Agents) 页面 ===
    'Auto-Run Mode': '自动运行模式',
    'Choose how Agent runs tools like command execution, MCP, and file writes.': '选择智能体运行工具（如命令执行、MCP 和文件写入）的方式。',
    'Command Allowlist': '命令白名单',
    'MCP Allowlist': 'MCP 白名单',
    'Fetch Domain Allowlist': '获取域名白名单',
    'Auto-Approved Mode Transitions': '自动批准模式切换',
    'Browser Protection': '浏览器保护',
    'MCP Tools Protection': 'MCP 工具保护',
    'File-Deletion Protection': '文件删除保护',
    'External-File Protection': '外部文件保护',
    'Default Location': '默认位置',
    'Text Size': '文本大小',
    'Auto-Clear Chat': '自动清除聊天',
    'Max Tab Count': '最大标签页数量',
    'Queue Messages': '消息排队',
    'Usage Summary': '用量摘要',
    'Agent Autocomplete': '智能体自动补全',
    'Agent Review': '智能体审查',
    'Default Approach': '默认方法',
    'Context': '上下文 (Context)',
    'Web Search Tool': '网页搜索工具',
    '自动接受网页搜索': '自动接受网页搜索',
    'Web Fetch Tool': '网页获取工具',
    '分级 Cursor 忽略': '分级 Cursor 忽略',
    '在 Cursor 忽略搜索中忽略符号链接': '在 Cursor 忽略搜索中忽略符号链接',
    'Applying Changes': '应用更改',
    'Inline Diffs': '内联差异 (Inline Diffs)',
    '接受时跳转到下一个差异': '接受时跳转到下一个差异',
    'Auto Format on Agent Finish': '智能体完成时自动格式化',
    'Inline Editing & Terminal': '内联编辑与终端',
    'Legacy Terminal Tool': '传统终端工具',
    '选中文本时显示工具栏': '选中文本时显示工具栏',
    '自动解析链接': '自动解析链接',
    'Themed Diff Backgrounds': '主题化差异背景',
    'Terminal Hint': '终端提示',
    'Preview Box for Terminal Ctrl+K': '终端 Ctrl+K 预览框',
    'Collapse Auto-Run Commands': '折叠自动运行命令',
    'Voice Mode': '语音模式',
    'Submit Keywords': '提交关键字',
    'Attribution': '属性归属',
    'Commit Attribution': '提交归属',
    'PR Attribution': '拉取请求 (PR) 归属',

    // === 3. “Tab” 页面 ===
    'Cursor Tab': 'Cursor Tab',
    'Context-aware, multi-line suggestions around your cursor based on recent edits': '基于最近编辑的、在光标周围提供上下文感知的多行建议',
    'Partial Accepts': '部分采纳',
    'Suggestions While Commenting': '注释时提供建议',
    'Whitespace-Only Suggestions': '仅空格建议',
    'Suggest edits like new lines and indentation that modify whitespace only': '仅建议修改空格（如换行和缩进）的编辑',
    'Imports': '导入',

    // === 4. “模型” (Models) 页面 ===
    'Add or search model': '添加或搜索模型',
    'API Keys': 'API 密钥',
    'Azure OpenAI': 'Azure OpenAI',
    'Test Model': '测试模型 (Test Model)',

    // === 12. 聊天界面与上下文菜单 (Chat UI & Context Menu) ===
    'New Chat': '新对话',
    'Type a message...': '输入消息...',
    'Search codebase': '搜索代码库',
    'Search files': '搜索文件',
    'Ask a question': '提个问题',
    'Chat': '聊天',
    'Composer': 'Composer',
    'Submit': '提交',
    'Cancel': '取消',
    'Toggle Chat Pane': '切换聊天面板',
    'Maximize Chat': '最大化聊天',
    'Close Tab': '关闭标签页',
    'Close Other Tabs': '关闭其他标签页',
    'Close All Tabs': '关闭所有标签页',
    'Open Tab as Editor': '在编辑器中打开标签页',
    'Export Transcript': '导出对话记录',
    'Copy Request ID': '复制请求 ID',
    'Agent Settings': '智能体设置'
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function translate() {
    console.log('\n--- 开始深度碎片化汉化过程 ---');

    if (!fs.existsSync(TARGET_FILE)) {
        console.error('错误: 找不到目标文件');
        return showMenu();
    }

    let content = fs.readFileSync(TARGET_FILE, 'utf8');

    // 智能备份
    const hasChinese = content.includes('管理账户');
    if (!hasChinese) {
        console.log('正在创建备份...');
        fs.copyFileSync(TARGET_FILE, BACKUP_FILE);
    }

    let count = 0;

    // 1. 标准引号/模板闭合匹配
    console.log('正在执行标准闭合匹配 (涵盖聊天菜单词条)...');
    const sortedKeys = Object.keys(dictionary).sort((a, b) => b.length - a.length);
    for (const english of sortedKeys) {
        const chinese = dictionary[english];
        const escapedEnglish = english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(["'\`])` + escapedEnglish + `\\1`, 'g');
        if (content.match(regex)) {
            content = content.replace(regex, `$1${chinese}$1`);
            count++;
        }
    }

    // 2. 深度碎片化明文替换
    console.log('正在执行碎片化明文补全...');
    const fragments = [
        // Agents
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

        // Tab
        { en: "Accept the next word of a suggestion via ", cn: "通过采纳建议中的下一个词： " },
        { en: "Automatically import necessary modules for ", cn: "自动导入必要的模块： " },

        // Chat UI
        { en: "Type a message...", cn: "输入消息..." }
    ];

    for (const item of fragments) {
        if (content.includes(item.en)) {
            content = content.split(item.en).join(item.cn);
            console.log(`补全汉化: "${item.en.substring(0, 30)}..."`);
            count++;
        }
    }

    try {
        fs.writeFileSync(TARGET_FILE, content, 'utf8');
        console.log(`汉化成功！共处理 ${count} 处。请重启 Cursor。`);
    } catch (err) {
        console.error('写入失败:', err.message);
    }
    showMenu();
}

function restore() {
    if (fs.existsSync(BACKUP_FILE)) {
        fs.copyFileSync(BACKUP_FILE, TARGET_FILE);
        console.log('恢复成功。');
    }
    showMenu();
}

function showMenu() {
    console.log('\n1. 执行汉化 (全覆盖版)\n2. 恢复备份\nQ. 退出');
    rl.question('选择: ', (a) => {
        if (a === '1') translate();
        else if (a === '2') restore();
        else if (a.toLowerCase() === 'q') rl.close();
        else showMenu();
    });
}

showMenu();
