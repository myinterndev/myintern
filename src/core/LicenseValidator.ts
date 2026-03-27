/**
 * Feature flags for MyIntern
 * All features are free and open source.
 */
export enum Feature {
  BASIC_CODE_GENERATION = 'basic_code_generation',
  SPEC_WATCHING = 'spec_watching',
  GUARDRAILS_DETECTION = 'guardrails_detection',
  MULTI_LANGUAGE = 'multi_language',
  GUARDRAILS_BLOCKING = 'guardrails_blocking',
  REVIEW_AGENT = 'review_agent',
  BUILD_AUTO_FIX = 'build_auto_fix',
  GITHUB_MCP = 'github_mcp',
  JIRA_MCP = 'jira_mcp',
  CI_MODE = 'ci_mode',
  MULTI_REPO = 'multi_repo',
  GUARDRAILS_AUDIT = 'guardrails_audit',
  AGENT_PIPELINE = 'agent_pipeline'
}

/**
 * LicenseValidator - Stub that allows all features.
 * All features are free and open source.
 */
export class LicenseValidator {
  async canUseFeature(_feature: Feature): Promise<boolean> {
    return true;
  }

  async requireFeature(_feature: Feature): Promise<void> {
    // No-op: all features are available
  }

  clearCache(): void {
    // No-op
  }
}

/**
 * Global singleton instance
 */
export const licenseValidator = new LicenseValidator();

/**
 * No-op: all features are available.
 */
export async function requireProFeature(_feature: Feature): Promise<void> {
  // No-op: all features are free
}
