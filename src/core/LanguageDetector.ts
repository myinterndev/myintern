import * as fs from 'fs';
import * as path from 'path';

export type LanguageType = 'java' | 'node' | 'python' | 'unknown';

export interface ProjectInfo {
  language: LanguageType;
  buildTool: string;
  framework?: string;
  packageManager?: string;
  version?: string;
}

/**
 * Detects project language and build tools (Section 6: Multi-Language Support)
 *
 * Detection priority:
 * 1. pom.xml → Java/Maven
 * 2. build.gradle → Java/Gradle (Kotlin possible)
 * 3. package.json → Node.js/TypeScript
 * 4. requirements.txt / pyproject.toml → Python
 * 5. go.mod → Go (future)
 * 6. Cargo.toml → Rust (future)
 */
export class LanguageDetector {
  constructor(private repoPath: string) {}

  /**
   * Detect all languages/frameworks in the project
   * Returns array to support polyrepo scenarios
   */
  detectAll(): ProjectInfo[] {
    const projects: ProjectInfo[] = [];

    // Check for Java/Maven
    if (this.hasPomXml()) {
      projects.push(this.detectMaven());
    }

    // Check for Java/Gradle
    if (this.hasBuildGradle()) {
      projects.push(this.detectGradle());
    }

    // Check for Node.js
    if (this.hasPackageJson()) {
      projects.push(this.detectNode());
    }

    // Check for Python
    if (this.hasPython()) {
      projects.push(this.detectPython());
    }

    return projects.length > 0 ? projects : [this.defaultProject()];
  }

  /**
   * Detect primary language (first detected)
   */
  detectPrimary(): ProjectInfo {
    const all = this.detectAll();
    return all[0] || this.defaultProject();
  }

  /**
   * Check if Maven project
   */
  private hasPomXml(): boolean {
    return fs.existsSync(path.join(this.repoPath, 'pom.xml'));
  }

  /**
   * Check if Gradle project
   */
  private hasBuildGradle(): boolean {
    return (
      fs.existsSync(path.join(this.repoPath, 'build.gradle')) ||
      fs.existsSync(path.join(this.repoPath, 'build.gradle.kts'))
    );
  }

  /**
   * Check if Node project
   */
  private hasPackageJson(): boolean {
    return fs.existsSync(path.join(this.repoPath, 'package.json'));
  }

  /**
   * Check if Python project
   */
  private hasPython(): boolean {
    return (
      fs.existsSync(path.join(this.repoPath, 'requirements.txt')) ||
      fs.existsSync(path.join(this.repoPath, 'pyproject.toml')) ||
      fs.existsSync(path.join(this.repoPath, 'setup.py')) ||
      fs.existsSync(path.join(this.repoPath, 'Pipfile'))
    );
  }

  /**
   * Detect Maven project details
   */
  private detectMaven(): ProjectInfo {
    const pomPath = path.join(this.repoPath, 'pom.xml');
    const pomContent = fs.readFileSync(pomPath, 'utf-8');

    // Check if Spring Boot
    const isSpringBoot = pomContent.includes('spring-boot-starter');
    const framework = isSpringBoot ? 'Spring Boot' : undefined;

    // Extract version
    const versionMatch = pomContent.match(/<java\.version>(.*?)<\/java\.version>/);
    const javaVersion = versionMatch ? versionMatch[1] : undefined;

    return {
      language: 'java',
      buildTool: 'maven',
      framework,
      version: javaVersion
    };
  }

  /**
   * Detect Gradle project details
   */
  private detectGradle(): ProjectInfo {
    const gradlePath = fs.existsSync(path.join(this.repoPath, 'build.gradle'))
      ? path.join(this.repoPath, 'build.gradle')
      : path.join(this.repoPath, 'build.gradle.kts');

    const gradleContent = fs.readFileSync(gradlePath, 'utf-8');

    // Check if Spring Boot
    const isSpringBoot = gradleContent.includes('org.springframework.boot');
    const framework = isSpringBoot ? 'Spring Boot' : undefined;

    // Check if Kotlin
    const isKotlin = gradleContent.includes('org.jetbrains.kotlin');

    return {
      language: 'java',
      buildTool: 'gradle',
      framework: framework || (isKotlin ? 'Kotlin' : undefined)
    };
  }

  /**
   * Detect Node.js project details
   */
  private detectNode(): ProjectInfo {
    const packageJsonPath = path.join(this.repoPath, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    // Detect framework
    let framework: string | undefined;
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps['next']) framework = 'Next.js';
    else if (deps['react']) framework = 'React';
    else if (deps['express']) framework = 'Express';
    else if (deps['@nestjs/core']) framework = 'NestJS';
    else if (deps['vue']) framework = 'Vue';

    // Detect package manager
    let packageManager = 'npm';
    if (fs.existsSync(path.join(this.repoPath, 'yarn.lock'))) {
      packageManager = 'yarn';
    } else if (fs.existsSync(path.join(this.repoPath, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    }

    // Check if TypeScript
    const isTypeScript = deps['typescript'] || fs.existsSync(path.join(this.repoPath, 'tsconfig.json'));

    return {
      language: 'node',
      buildTool: isTypeScript ? 'typescript' : 'javascript',
      framework,
      packageManager,
      version: packageJson.engines?.node
    };
  }

  /**
   * Detect Python project details
   */
  private detectPython(): ProjectInfo {
    let framework: string | undefined;
    let packageManager = 'pip';

    // Check for Django
    if (fs.existsSync(path.join(this.repoPath, 'manage.py'))) {
      framework = 'Django';
    }

    // Check for Flask (look in requirements.txt or pyproject.toml)
    const requirementsPath = path.join(this.repoPath, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      const requirements = fs.readFileSync(requirementsPath, 'utf-8');
      if (requirements.includes('Flask')) framework = 'Flask';
      else if (requirements.includes('fastapi')) framework = 'FastAPI';
    }

    // Check for Poetry
    if (fs.existsSync(path.join(this.repoPath, 'pyproject.toml'))) {
      packageManager = 'poetry';

      const pyprojectContent = fs.readFileSync(
        path.join(this.repoPath, 'pyproject.toml'),
        'utf-8'
      );

      if (!framework) {
        if (pyprojectContent.includes('django')) framework = 'Django';
        else if (pyprojectContent.includes('flask')) framework = 'Flask';
        else if (pyprojectContent.includes('fastapi')) framework = 'FastAPI';
      }
    }

    // Check for Pipenv
    if (fs.existsSync(path.join(this.repoPath, 'Pipfile'))) {
      packageManager = 'pipenv';
    }

    return {
      language: 'python',
      buildTool: packageManager,
      framework
    };
  }

  /**
   * Default fallback
   */
  private defaultProject(): ProjectInfo {
    return {
      language: 'unknown',
      buildTool: 'manual'
    };
  }

  /**
   * Get build commands for detected language
   */
  getBuildCommands(info: ProjectInfo): { compile?: string; test: string; package?: string } {
    switch (info.language) {
      case 'java':
        if (info.buildTool === 'maven') {
          return {
            compile: 'mvn compile',
            test: 'mvn test',
            package: 'mvn package -DskipTests'
          };
        } else if (info.buildTool === 'gradle') {
          return {
            compile: './gradlew compileJava',
            test: './gradlew test',
            package: './gradlew build -x test'
          };
        }
        break;

      case 'node':
        const pkgManager = info.packageManager || 'npm';
        return {
          compile: info.buildTool === 'typescript' ? `${pkgManager} run build` : undefined,
          test: `${pkgManager} test`,
          package: `${pkgManager} run build`
        };

      case 'python':
        const buildTool = info.buildTool;
        if (buildTool === 'poetry') {
          return {
            test: 'poetry run pytest',
            package: 'poetry build'
          };
        } else if (buildTool === 'pipenv') {
          return {
            test: 'pipenv run pytest'
          };
        } else {
          return {
            test: 'pytest'
          };
        }
    }

    return { test: 'echo "No test command configured"' };
  }

  /**
   * Get test framework for language
   */
  getTestFramework(info: ProjectInfo): string {
    switch (info.language) {
      case 'java':
        return 'JUnit';
      case 'node':
        return 'Jest'; // Could also detect Mocha, Vitest, etc.
      case 'python':
        return 'pytest';
      default:
        return 'unknown';
    }
  }
}
