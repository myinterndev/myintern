#!/usr/bin/env ts-node
/**
 * Use MyIntern's TestAgent to generate tests for uncovered modules
 */

import { TestAgent } from '../src/agents/TestAgent';
import { AnthropicProvider } from '../src/integrations/ai/AnthropicProvider';
import * as fs from 'fs';
import * as path from 'path';

const repoPath = path.join(__dirname, '..');

// Files that need test coverage
const sourceFiles = [
  'src/core/ConfigManager.ts',
  'src/core/MultiRepoContextBuilder.ts',
  'src/core/LanguageDetector.ts',
  'src/core/SpringBootDetector.ts',
  'src/agents/BuildAgent.ts',
];

async function main() {
  console.log('🧪 Generating tests using TestAgent...\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const aiProvider = new AnthropicProvider(
    'claude-sonnet-4-5-20250929',
    apiKey
  );

  const testAgent = new TestAgent(repoPath);
  await testAgent.start();

  // Generate tests
  const result = await testAgent.generateTests(sourceFiles, aiProvider);

  if (result.success) {
    console.log(`\n✅ Generated ${result.testsGenerated.length} test files`);
    result.testsGenerated.forEach(test => {
      console.log(`   - ${test.path} (${test.action})`);
    });
  } else {
    console.error(`\n❌ Test generation failed: ${result.error}`);
    process.exit(1);
  }

  await testAgent.stop();
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
