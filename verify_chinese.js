const fs = require('fs');
const path = require('path');

const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
const TARGET_FILE = path.join(localAppData, 'Programs', 'cursor', 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js');

const checkStrings = [
    "在终端中显示",
    "由 Cursor 创作"
];

if (!fs.existsSync(TARGET_FILE)) {
    process.exit(1);
}

const content = fs.readFileSync(TARGET_FILE, 'utf8');

checkStrings.forEach(s => {
    const index = content.indexOf(s);
    if (index !== -1) {
        console.log(`VERIFIED: "${s}" found at ${index}`);
        console.log(`CONTEXT: [${content.substring(index - 10, index + s.length + 30)}]`);
    } else {
        console.log(`NOT FOUND: "${s}"`);
    }
});
