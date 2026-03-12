const fs = require('fs');
const pngToIco = require('png-to-ico');
const { rcedit } = require('rcedit');

async function run() {
    console.log('--- 开始本地图标集成流程 ---');

    try {
        // 1. 转换 PNG 为 ICO
        const icoPath = 'hacker_icon.ico';
        if (!fs.existsSync(icoPath)) {
            console.log('1. 正在将 PNG 转换为 ICO 格式...');
            const buffer = await pngToIco('hacker_icon.png');
            fs.writeFileSync(icoPath, buffer);
            console.log('✓ hacker_icon.ico 已生成。');
        } else {
            console.log('✓ hacker_icon.ico 已存在，跳过转换。');
        }

        // 2. 注入图标到 EXE
        const exePath = 'dist/cursor-zh-pro-win.exe';
        if (fs.existsSync(exePath)) {
            console.log(`2. 正在将图标注入到 ${exePath}...`);
            await rcedit(exePath, { icon: icoPath });
            console.log('✓ 注入成功！您的 .exe 已经拥有黑客外观。');
            console.log('✨ 图标集成大功告成！您可以去查看 dist 文件夹下的 .exe 了。');
        } else {
            console.log('⚠️ 找不到 dist/cursor-zh-pro-win.exe，请先运行命令打包项目。');
        }

    } catch (err) {
        console.error('❌ 执行失败:', err.message);
        process.exit(1);
    }
}

run();
