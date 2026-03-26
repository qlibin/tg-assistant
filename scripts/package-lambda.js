import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const packageName = process.argv[2];
if (!packageName) {
  console.error('Usage: node scripts/package-lambda.js <package-name>');
  process.exit(1);
}

const packageDir = path.join(rootDir, 'packages', packageName);
const commonDir = path.join(rootDir, 'packages', 'common');
const stagingDir = path.join(rootDir, '.lambda-staging');
const zipPath = path.join(rootDir, `lambda-${packageName}.zip`);

// Clean up
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true });
}
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}
fs.mkdirSync(stagingDir, { recursive: true });

// Copy ${packageName}dist to staging root
const packageDist = path.join(packageDir, 'dist');
if (!fs.existsSync(packageDist)) {
  console.error(`dist/ not found in packages/${packageName}. Run "npm run build" first.`);
  process.exit(1);
}
copyDirSync(packageDist, stagingDir);

// Copy common dist into node_modules/@tg-assistant/common/
const commonDest = path.join(stagingDir, 'node_modules', '@tg-assistant', 'common');
fs.mkdirSync(commonDest, { recursive: true });
copyDirSync(path.join(commonDir, 'dist'), commonDest);

// Create package.json for common in node_modules
const commonPkg = JSON.parse(fs.readFileSync(path.join(commonDir, 'package.json'), 'utf8'));
fs.writeFileSync(
  path.join(commonDest, 'package.json'),
  JSON.stringify({
    name: commonPkg.name,
    version: commonPkg.version,
    type: commonPkg.type,
    main: 'index.js',
    types: 'index.d.ts',
  }, null, 2),
  'utf8'
);

// Build merged package.json with production deps from common
const commonDeps = commonPkg.dependencies || {};
const stagingPkg = {
  name: 'lambda-staging',
  version: '1.0.0',
  private: true,
  type: 'module',
  dependencies: { ...commonDeps },
};
fs.writeFileSync(
  path.join(stagingDir, 'package.json'),
  JSON.stringify(stagingPkg, null, 2),
  'utf8'
);

// Install production deps
console.log('Installing production dependencies...');
execSync('npm install --omit=dev --ignore-scripts', {
  cwd: stagingDir,
  stdio: 'inherit',
});

// Ensure @tg-assistant/common is a real directory (not a symlink or missing)
const commonNmPath = path.join(stagingDir, 'node_modules', '@tg-assistant', 'common');
if (fs.existsSync(commonNmPath)) {
  const stat = fs.lstatSync(commonNmPath);
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(commonNmPath);
  } else {
    fs.rmSync(commonNmPath, { recursive: true });
  }
}
fs.mkdirSync(commonNmPath, { recursive: true });
copyDirSync(path.join(commonDir, 'dist'), commonNmPath);
fs.writeFileSync(
  path.join(commonNmPath, 'package.json'),
  JSON.stringify({
    name: commonPkg.name,
    version: commonPkg.version,
    type: commonPkg.type,
    main: 'index.js',
    types: 'index.d.ts',
  }, null, 2),
  'utf8'
);

// Zip
console.log('Creating lambda.zip...');
execSync(`zip -r ${zipPath} .`, {
  cwd: stagingDir,
  stdio: 'inherit',
});

// Clean up staging
fs.rmSync(stagingDir, { recursive: true });

console.log(`Lambda package created: lambda-${packageName}.zip`);

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
