import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

// יצירת תיקיית .user אם אינה קיימת
const userDir = '.user';
if (!fs.existsSync(userDir)) {
  fs.mkdirSync(userDir, { recursive: true });
}

const outputFile = path.join(userDir, `codebase-${timestamp}.txt`);

// סדר הקבצים לפי חשיבות:
const filesOrder = [
  'public/manifest.json',
  'package.json',
  'src/types.ts',
  'src/background.ts',
  'src/content.ts',
  'src/panel.ts',
  'src/url-utils.ts',
  'src/panel.html',
  'src/panel.css',
  'tsconfig.json',
  'esbuild.config.mjs'
];

// --- 1. חילוץ מידע על הפרויקט ו-Git ---
let pkgInfo = '';
if (fs.existsSync('package.json')) {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    pkgInfo = `Project:     ${pkg.name || 'project'} v${pkg.version || '0.1.0'}\n`;
    if (pkg.description) {
      pkgInfo += `Description: ${pkg.description}\n`;
    }
  } catch {}
}

let gitInfo = '';
try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  gitInfo = `Git State:   Branch '${branch}' (commit ${commit})\n`;
} catch {}

// --- 2. בניית עץ תיקיות ויזואלי ---
function generateTree(filePaths) {
  const tree = {};
  for (const fp of filePaths) {
    const parts = fp.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = null;
      } else {
        current[part] = current[part] || {};
        current = current[part];
      }
    }
  }

  function render(node, prefix = '') {
    const keys = Object.keys(node);
    let output = '';
    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const isDir = node[key] !== null;
      output += `${prefix}${connector}${key}${isDir ? '/' : ''}\n`;
      if (isDir) {
        output += render(node[key], prefix + (isLast ? '    ' : '│   '));
      }
    });
    return output;
  }

  return render(tree).trimEnd();
}

// --- 3. איסוף נתונים ועיבוד הקבצים ---
const existingFiles = filesOrder.filter(f => fs.existsSync(f));
const filesStats = [];
let totalLines = 0;
let totalBytes = 0;

let filesSection = '';

for (const filePath of existingFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const size = Buffer.byteLength(content, 'utf-8');
  const lines = content.split(/\r?\n/);
  const lineCount = lines.length;

  totalLines += lineCount;
  totalBytes += size;

  filesStats.push({ path: filePath, lineCount, size });

  const maxDigits = Math.max(String(lineCount).length, 2);
  filesSection += `================================================================\n`;
  filesSection += `File: ${filePath}\n`;
  filesSection += `================================================================\n`;

  lines.forEach((line, idx) => {
    const lineNum = String(idx + 1).padStart(maxDigits, ' ');
    filesSection += `${lineNum}: ${line}\n`;
  });

  filesSection += '\n';
}

// --- 4. בניית טבלת סיכום ---
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

let summaryTable = ' #  | File Path             | Lines | Size\n';
summaryTable += '----+-----------------------+-------+----------\n';
filesStats.forEach((f, idx) => {
  const num = String(idx + 1).padStart(2, ' ');
  const p = f.path.padEnd(21, ' ');
  const l = String(f.lineCount).padStart(5, ' ');
  const s = formatBytes(f.size).padStart(8, ' ');
  summaryTable += `${num} | ${p} | ${l} | ${s}\n`;
});
summaryTable += '----+-----------------------+-------+----------\n';
summaryTable += `TOTAL: ${filesStats.length} files, ${totalLines} lines, ${formatBytes(totalBytes)}\n`;

// --- 5. הרכבת הקובץ המלא ---
const outputContent = `================================================================
CODEBASE BUNDLE
================================================================
${pkgInfo}${gitInfo}Generated:   ${now.toLocaleString()}
Total Files: ${existingFiles.length} (${totalLines} lines, ${formatBytes(totalBytes)})

Note: This file contains an aggregated representation of the project
source code. Each file starts with a header banner and has line numbers.

================================================================
DIRECTORY STRUCTURE
================================================================
${generateTree(existingFiles)}

================================================================
FILES SUMMARY
================================================================
${summaryTable}
================================================================
SOURCE CODE
================================================================

${filesSection}`;

fs.writeFileSync(outputFile, outputContent, 'utf-8');
console.log(`✔ Packed ${existingFiles.length} files (${totalLines} lines) to ${outputFile}`);
