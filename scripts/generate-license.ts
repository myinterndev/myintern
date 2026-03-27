#!/usr/bin/env ts-node
/**
 * Admin script to generate MyIntern license keys
 *
 * Usage:
 *   ts-node scripts/generate-license.ts user@example.com pro monthly
 *   ts-node scripts/generate-license.ts user@example.com pro yearly
 *   ts-node scripts/generate-license.ts user@example.com pro lifetime
 */

import { LicenseValidator, LicenseTier } from '../src/core/LicenseValidator';

function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: ts-node scripts/generate-license.ts <email> <tier> <billing_period>');
    console.error('');
    console.error('Arguments:');
    console.error('  email:          Customer email address');
    console.error('  tier:           pro');
    console.error('  billing_period: monthly | yearly | lifetime');
    console.error('');
    console.error('Examples:');
    console.error('  ts-node scripts/generate-license.ts user@example.com pro monthly');
    console.error('  ts-node scripts/generate-license.ts user@example.com pro yearly');
    console.error('  ts-node scripts/generate-license.ts user@example.com pro lifetime');
    process.exit(1);
  }

  const [email, tierArg, billingPeriod] = args;

  // Validate tier
  const tier = tierArg.toLowerCase() as LicenseTier;
  if (tier !== LicenseTier.PRO) {
    console.error(`Error: Invalid tier "${tierArg}". Must be "pro"`);
    process.exit(1);
  }

  // Validate billing period
  if (!['monthly', 'yearly', 'lifetime'].includes(billingPeriod)) {
    console.error(`Error: Invalid billing_period "${billingPeriod}". Must be monthly, yearly, or lifetime`);
    process.exit(1);
  }

  // Calculate expiry
  let expires: string;
  if (billingPeriod === 'lifetime') {
    expires = 'never';
  } else {
    const now = new Date();
    if (billingPeriod === 'yearly') {
      now.setFullYear(now.getFullYear() + 1);
    } else {
      now.setMonth(now.getMonth() + 1);
    }
    expires = now.toISOString();
  }

  // Generate license key
  const licenseKey = LicenseValidator.generateLicenseKey({
    tier,
    email,
    expires,
    customerId: `manual_${Date.now()}` // Manual generation uses timestamp as customer ID
  });

  console.log('');
  console.log('✅ License key generated successfully!');
  console.log('');
  console.log(`Email:   ${email}`);
  console.log(`Tier:    ${tier.toUpperCase()}`);
  console.log(`Expires: ${expires === 'never' ? 'Never (Lifetime)' : expires}`);
  console.log('');
  console.log('License Key:');
  console.log(licenseKey);
  console.log('');
  console.log('Send this to the customer:');
  console.log('─'.repeat(80));
  console.log(`Thank you for purchasing MyIntern PRO!`);
  console.log('');
  console.log(`Your license key:`);
  console.log(licenseKey);
  console.log('');
  console.log(`To activate, run one of these commands:`);
  console.log('');
  console.log(`# Option 1: Set environment variable (temporary)`);
  console.log(`export MYINTERN_LICENSE_KEY=${licenseKey}`);
  console.log('');
  console.log(`# Option 2: Save to config (permanent)`);
  console.log(`echo "export MYINTERN_LICENSE_KEY=${licenseKey}" >> ~/.bashrc`);
  console.log(`source ~/.bashrc`);
  console.log('');
  console.log(`# Option 3: Save to file (automatic discovery)`);
  console.log(`mkdir -p ~/.myintern`);
  console.log(`echo "${licenseKey}" > ~/.myintern/license.key`);
  console.log('');
  console.log(`Verify it's working:`);
  console.log(`myintern run "Add a health endpoint" --dry-run`);
  console.log('');
  console.log(`Support: https://github.com/myinterndev/myintern/issues`);
  console.log('─'.repeat(80));
}

main();
