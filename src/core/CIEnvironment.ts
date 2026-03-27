/**
 * CI Environment Detection and Management
 *
 * Detects CI/CD environments, manages output mode switching, and provides
 * structured exit codes for CI integration.
 */

export interface CIDetectionResult {
  isCI: boolean;
  platform?: 'github' | 'gitlab' | 'jenkins' | 'circle' | 'travis' | 'generic';
  shouldSuppressEmoji: boolean;
  shouldSuppressColor: boolean;
  shouldSuppressPrompts: boolean;
}

export interface CIExitCodes {
  SUCCESS: 0;
  FAILURE: 1;
  CONFIG_ERROR: 2;
  NO_SPECS: 3;
  TIMEOUT: 4;
  PARTIAL: 5;
}

export class CIEnvironment {
  private static readonly EXIT_CODES: CIExitCodes = {
    SUCCESS: 0,
    FAILURE: 1,
    CONFIG_ERROR: 2,
    NO_SPECS: 3,
    TIMEOUT: 4,
    PARTIAL: 5,
  };

  /**
   * Detect if running in a CI/CD environment
   */
  static detect(): CIDetectionResult {
    const env = process.env;

    // Check for common CI environment variables
    const isCI = !!(
      env.CI ||
      env.GITHUB_ACTIONS ||
      env.GITLAB_CI ||
      env.JENKINS_URL ||
      env.CIRCLECI ||
      env.TRAVIS ||
      env.BUILDKITE ||
      env.DRONE ||
      !process.stdout.isTTY
    );

    let platform: CIDetectionResult['platform'];
    if (env.GITHUB_ACTIONS) {
      platform = 'github';
    } else if (env.GITLAB_CI) {
      platform = 'gitlab';
    } else if (env.JENKINS_URL) {
      platform = 'jenkins';
    } else if (env.CIRCLECI) {
      platform = 'circle';
    } else if (env.TRAVIS) {
      platform = 'travis';
    } else if (isCI) {
      platform = 'generic';
    }

    return {
      isCI,
      platform,
      shouldSuppressEmoji: isCI,
      shouldSuppressColor: isCI || !!env.NO_COLOR,
      shouldSuppressPrompts: isCI,
    };
  }

  /**
   * Get structured exit code
   */
  static getExitCode(type: keyof CIExitCodes): number {
    return CIEnvironment.EXIT_CODES[type];
  }

  /**
   * Exit with structured exit code
   */
  static exit(type: keyof CIExitCodes, message?: string): never {
    if (message) {
      if (type === 'SUCCESS') {
        console.log(message);
      } else {
        console.error(message);
      }
    }

    process.exit(CIEnvironment.EXIT_CODES[type]);
  }

  /**
   * Format output for CI (strips ANSI codes if needed)
   */
  static formatOutput(text: string, suppressColor: boolean): string {
    if (!suppressColor) {
      return text;
    }

    // Strip ANSI color codes
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  }

  /**
   * Check if running in CI mode (explicit flag or auto-detected)
   */
  static isCIMode(options: { ci?: boolean }): boolean {
    if (options.ci === true) {
      return true;
    }

    const detection = CIEnvironment.detect();
    return detection.isCI;
  }

  /**
   * Get platform-specific information
   */
  static getPlatformInfo(): {
    platform?: string;
    buildId?: string;
    buildUrl?: string;
    branch?: string;
    commit?: string;
  } {
    const env = process.env;

    if (env.GITHUB_ACTIONS) {
      return {
        platform: 'GitHub Actions',
        buildId: env.GITHUB_RUN_ID,
        buildUrl: env.GITHUB_SERVER_URL
          ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
          : undefined,
        branch: env.GITHUB_REF_NAME,
        commit: env.GITHUB_SHA,
      };
    }

    if (env.GITLAB_CI) {
      return {
        platform: 'GitLab CI',
        buildId: env.CI_JOB_ID,
        buildUrl: env.CI_JOB_URL,
        branch: env.CI_COMMIT_REF_NAME,
        commit: env.CI_COMMIT_SHA,
      };
    }

    if (env.JENKINS_URL) {
      return {
        platform: 'Jenkins',
        buildId: env.BUILD_NUMBER,
        buildUrl: env.BUILD_URL,
        branch: env.GIT_BRANCH,
        commit: env.GIT_COMMIT,
      };
    }

    if (env.CIRCLECI) {
      return {
        platform: 'CircleCI',
        buildId: env.CIRCLE_BUILD_NUM,
        buildUrl: env.CIRCLE_BUILD_URL,
        branch: env.CIRCLE_BRANCH,
        commit: env.CIRCLE_SHA1,
      };
    }

    if (env.TRAVIS) {
      return {
        platform: 'Travis CI',
        buildId: env.TRAVIS_BUILD_NUMBER,
        buildUrl: env.TRAVIS_BUILD_WEB_URL,
        branch: env.TRAVIS_BRANCH,
        commit: env.TRAVIS_COMMIT,
      };
    }

    return {};
  }
}
