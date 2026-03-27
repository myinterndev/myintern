#!/usr/bin/env node

/**
 * Build Verification Script
 * Ensures dist/ is production-ready before npm publish
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../dist');
const requiredFiles = [
  'cli/index.js',
  'index.js',
  'agents/CodeAgent.js',
  'core/ConfigManager.js',
  'core/LicenseValidator.js'
];

console.log('🔍 Verifying build artifacts...\n');

let allGood = true;

// Check dist/ exists
if (!fs.existsSync(distDir)) {
  console.error('❌ dist/ directory not found. Run npm run build first.');
  process.exit(1);
}

// Check required files
for (const file of requiredFiles) {
  const filePath = path.join(distDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing required file: ${file}`);
    allGood = false;
  } else {
    console.log(`✅ ${file}`);
  }
}

// Check no source files leaked
const distFiles = getAllFiles(distDir);
const sourceFiles = distFiles.filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));

if (sourceFiles.length > 0) {
  console.error('\n❌ Source files found in dist/ (should only contain compiled JS):');
  sourceFiles.forEach(f => console.error(`   - ${f}`));
  allGood = false;
}

// Check file sizes (basic sanity check)
const mainFile = path.join(distDir, 'index.js');
const mainStat = fs.statSync(mainFile);
if (mainStat.size < 100) {
  console.error('\n❌ dist/index.js is suspiciously small (< 100 bytes)');
  allGood = false;
}

if (allGood) {
  console.log('\n✅ Build verification passed! Ready to publish.');
  process.exit(0);
} else {
  console.error('\n❌ Build verification failed. Fix errors before publishing.');
  process.exit(1);
}

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(path.relative(distDir, filePath));
    }
  });
  return fileList;
}
