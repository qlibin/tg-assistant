import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '../dist');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules') {
        walk(fullPath);
      }
    } else if (file.endsWith('.js')) {
      fixImports(fullPath);
    }
  }
}

function fixImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace: import ... from './relative/path';
  // With: import ... from './relative/path.js';
  // Matches relative imports (starting with ./) that don't already have an extension
  
  const regex = /(import\s+.*?\s+from\s+['"])(\.\.?\/.*?)(['"])/g;
  
  let changed = false;
  const newContent = content.replace(regex, (match, p1, p2, p3) => {
    if (!p2.endsWith('.js') && !p2.endsWith('.mjs') && !p2.endsWith('.json')) {
      changed = true;
      return `${p1}${p2}.js${p3}`;
    }
    return match;
  });

  if (changed) {
    console.log(`Fixed imports in ${path.relative(distDir, filePath)}`);
    fs.writeFileSync(filePath, newContent, 'utf8');
  }
}

console.log('Fixing ESM imports in dist...');
walk(distDir);
console.log('Done.');
