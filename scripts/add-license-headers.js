#!/usr/bin/env node

/**
 * Add license headers to compiled JS files
 * Run this during build to add copyright notices
 */

const fs = require('fs');
const path = require('path');

const LICENSE_HEADER = `/**
 * MyIntern CLI v${require('../package.json').version}
 *
 * Copyright 2026 Prasols
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * All features are open source and free to use
 */

`;

const distDir = path.join(__dirname, '../dist');

function addHeaders(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      addHeaders(filePath);
    } else if (file.endsWith('.js') && !file.endsWith('.d.ts')) {
      const content = fs.readFileSync(filePath, 'utf8');

      // Only add if not already present
      if (!content.includes('Apache License')) {
        fs.writeFileSync(filePath, LICENSE_HEADER + content, 'utf8');
        console.log(`✅ Added header to ${path.relative(distDir, filePath)}`);
      }
    }
  });
}

if (!fs.existsSync(distDir)) {
  console.error('❌ dist/ not found. Run npm run build first.');
  process.exit(1);
}

console.log('📝 Adding license headers to compiled files...\n');
addHeaders(distDir);
console.log('\n✅ License headers added successfully!');
