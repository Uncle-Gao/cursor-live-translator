const fs = require('fs');
const path = require('path');

const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
const TARGET_FILE = path.join(localAppData, 'Programs', 'cursor', 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js');

const queryStrings = [
    "Accept the next word of a suggestion via",
    "Automatically import necessary modules for TypeScript"
];

if (!fs.existsSync(TARGET_FILE)) {
    console.error("File not found: " + TARGET_FILE);
    process.exit(1);
}

console.log("Reading file...");
const content = fs.readFileSync(TARGET_FILE, 'utf8');

queryStrings.forEach(q => {
    const index = content.indexOf(q);
    if (index !== -1) {
        console.log(`FOUND: "${q}" at index ${index}`);
        const context = content.substring(index - 10, index + q.length + 50);
        console.log(`CONTEXT ESCAPED: ${JSON.stringify(context)}`);
    } else {
        console.log(`NOT FOUND: "${q}"`);
    }
});
