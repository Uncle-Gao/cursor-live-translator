const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getPaths() {
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
    const appPath = path.join(localAppData, 'Programs', 'cursor', 'resources', 'app');
    return {
        product: path.join(appPath, 'product.json'),
        mainJs: path.join(appPath, 'out', 'vs', 'workbench', 'workbench.desktop.main.js')
    };
}

function fixChecksum() {
    const paths = getPaths();
    
    if (!fs.existsSync(paths.product) || !fs.existsSync(paths.mainJs)) {
        console.error('错误: 找不到相关的配置文件或主程序文件。');
        return;
    }

    console.log('读取文件中...');
    const mainJsContent = fs.readFileSync(paths.mainJs);
    const productContent = JSON.parse(fs.readFileSync(paths.product, 'utf8'));

    // 计算 SHA-256 哈希值 (Base64 编码，且 VS Code 习惯去除末尾的 =)
    const newHash = crypto.createHash('sha256')
        .update(mainJsContent)
        .digest('base64')
        .replace(/=+$/, '');

    const oldHash = productContent.checksums['vs/workbench/workbench.desktop.main.js'];
    
    console.log(`旧哈希值: ${oldHash}`);
    console.log(`新哈希值: ${newHash}`);

    if (oldHash === newHash) {
        console.log('哈希值已同步，无需修复。');
        return;
    }

    // 更新 product.json
    productContent.checksums['vs/workbench/workbench.desktop.main.js'] = newHash;
    
    try {
        fs.writeFileSync(paths.product, JSON.stringify(productContent, null, '\t'), 'utf8');
        console.log('\n--- 修复成功！ ---');
        console.log('Cursor 的文件校验值已更新，提示警告应当消失。');
        console.log('请完全关闭并重新启动 Cursor。');
    } catch (err) {
        console.error('写入 product.json 失败:', err.message);
    }
}

fixChecksum();
