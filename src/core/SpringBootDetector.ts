import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';
import chalk from 'chalk';

/**
 * SpringBootDetector - Intelligent Spring Boot version detection
 * Auto-detects 2.x vs 3.x and adjusts imports (javax.* vs jakarta.*)
 */
export class SpringBootDetector {
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  /**
   * Detect Spring Boot version from pom.xml or build.gradle
   */
  async detect(): Promise<{
    version: string;
    majorVersion: number;
    useJakarta: boolean; // true for 3.x (jakarta.*), false for 2.x (javax.*)
    javaVersion: string;
    dependencies: string[];
    springCloudVersion?: string;
  }> {
    // Try pom.xml first
    const pomPath = path.join(this.repoPath, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      return this.detectFromPom(pomPath);
    }

    // Try build.gradle
    const gradlePath = path.join(this.repoPath, 'build.gradle');
    if (fs.existsSync(gradlePath)) {
      return this.detectFromGradle(gradlePath);
    }

    // Fallback: analyze imports in existing code
    return this.detectFromCode();
  }

  /**
   * Detect from pom.xml
   */
  private async detectFromPom(pomPath: string): Promise<any> {
    const pomContent = fs.readFileSync(pomPath, 'utf-8');
    const parser = new xml2js.Parser();

    try {
      const pom = await parser.parseStringPromise(pomContent);
      const project = pom.project;

      // Extract Spring Boot version
      let springBootVersion = '';

      // Check parent
      if (project.parent && project.parent[0]) {
        const parent = project.parent[0];
        if (parent.artifactId && parent.artifactId[0] === 'spring-boot-starter-parent') {
          springBootVersion = parent.version[0];
        }
      }

      // Check properties
      if (!springBootVersion && project.properties && project.properties[0]) {
        const props = project.properties[0];
        springBootVersion = props['spring-boot.version']?.[0] ||
                           props['spring.boot.version']?.[0] ||
                           props['springboot.version']?.[0] ||
                           '';
      }

      // Check dependencies for spring-boot-starter
      if (!springBootVersion && project.dependencies && project.dependencies[0]) {
        const deps = project.dependencies[0].dependency || [];
        for (const dep of deps) {
          if (dep.artifactId && dep.artifactId[0].startsWith('spring-boot-starter')) {
            springBootVersion = dep.version?.[0] || '';
            break;
          }
        }
      }

      // Extract Java version
      let javaVersion = '17'; // default
      if (project.properties && project.properties[0]) {
        const props = project.properties[0];
        javaVersion = props['java.version']?.[0] ||
                     props['maven.compiler.source']?.[0] ||
                     props['maven.compiler.target']?.[0] ||
                     '17';
      }

      // Extract dependencies
      const dependencies: string[] = [];
      if (project.dependencies && project.dependencies[0]) {
        const deps = project.dependencies[0].dependency || [];
        deps.forEach((dep: any) => {
          if (dep.artifactId && dep.artifactId[0]) {
            dependencies.push(dep.artifactId[0]);
          }
        });
      }

      // Extract Spring Cloud version
      let springCloudVersion = '';
      if (project.properties && project.properties[0]) {
        const props = project.properties[0];
        springCloudVersion = props['spring-cloud.version']?.[0] || '';
      }

      const majorVersion = this.getMajorVersion(springBootVersion);

      return {
        version: springBootVersion || 'unknown',
        majorVersion,
        useJakarta: majorVersion >= 3,
        javaVersion,
        dependencies,
        springCloudVersion
      };
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Error parsing pom.xml: ${error}`));
      return this.detectFromCode();
    }
  }

  /**
   * Detect from build.gradle
   */
  private async detectFromGradle(gradlePath: string): Promise<any> {
    const gradleContent = fs.readFileSync(gradlePath, 'utf-8');

    // Parse Spring Boot plugin version
    const pluginMatch = gradleContent.match(/id\s+['"]org\.springframework\.boot['"]\s+version\s+['"]([^'"]+)['"]/);
    const springBootVersion = pluginMatch ? pluginMatch[1] : '';

    // Parse Java version
    const javaMatch = gradleContent.match(/sourceCompatibility\s*=\s*['"]?(\d+)['"]?/) ||
                     gradleContent.match(/JavaVersion\.VERSION_(\d+)/);
    const javaVersion = javaMatch ? javaMatch[1] : '17';

    // Parse dependencies
    const dependencies: string[] = [];
    const depMatches = gradleContent.matchAll(/implementation\s+['"]org\.springframework\.boot:([^:'"]+)/g);
    for (const match of depMatches) {
      dependencies.push(match[1]);
    }

    // Parse Spring Cloud version
    const cloudMatch = gradleContent.match(/springCloudVersion\s*=\s*['"]([^'"]+)['"]/);
    const springCloudVersion = cloudMatch ? cloudMatch[1] : '';

    const majorVersion = this.getMajorVersion(springBootVersion);

    return {
      version: springBootVersion || 'unknown',
      majorVersion,
      useJakarta: majorVersion >= 3,
      javaVersion,
      dependencies,
      springCloudVersion
    };
  }

  /**
   * Detect from existing code (fallback)
   */
  private async detectFromCode(): Promise<any> {
    // Scan Java files for imports
    const javaFiles = this.findJavaFiles();

    let hasJakarta = false;
    let hasJavax = false;

    for (const file of javaFiles.slice(0, 50)) { // Check first 50 files
      const content = fs.readFileSync(file, 'utf-8');

      if (content.includes('import jakarta.')) {
        hasJakarta = true;
      }
      if (content.includes('import javax.')) {
        hasJavax = true;
      }

      if (hasJakarta && hasJavax) {
        break;
      }
    }

    // Determine version based on imports
    const useJakarta = hasJakarta || !hasJavax; // Default to jakarta if unclear
    const majorVersion = useJakarta ? 3 : 2;

    return {
      version: useJakarta ? '3.x' : '2.x',
      majorVersion,
      useJakarta,
      javaVersion: '17',
      dependencies: [],
      springCloudVersion: ''
    };
  }

  /**
   * Get import namespace based on version
   */
  getImportNamespace(packageName: string, versionInfo: any): string {
    const namespace = versionInfo.useJakarta ? 'jakarta' : 'javax';

    const mapping: Record<string, string> = {
      'persistence': `${namespace}.persistence`,
      'validation': `${namespace}.validation`,
      'servlet': `${namespace}.servlet`,
      'annotation': `${namespace}.annotation`,
      'transaction': `${namespace}.transaction`,
      'jms': `${namespace}.jms`,
      'mail': `${namespace}.mail`,
      'ws': `${namespace}.ws`,
      'xml': `${namespace}.xml`,
      'inject': `${namespace}.inject`
    };

    return mapping[packageName] || packageName;
  }

  /**
   * Convert imports between javax and jakarta
   */
  convertImports(code: string, toJakarta: boolean): string {
    if (toJakarta) {
      // Convert javax.* to jakarta.*
      return code.replace(/import\s+javax\.(persistence|validation|servlet|annotation|transaction|jms|mail|ws|xml|inject)/g,
        'import jakarta.$1');
    } else {
      // Convert jakarta.* to javax.*
      return code.replace(/import\s+jakarta\.(persistence|validation|servlet|annotation|transaction|jms|mail|ws|xml|inject)/g,
        'import javax.$1');
    }
  }

  /**
   * Get recommended dependencies for version
   */
  getRecommendedDependencies(versionInfo: any): {
    starters: string[];
    testing: string[];
    utilities: string[];
  } {
    const base = {
      starters: [
        'spring-boot-starter-web',
        'spring-boot-starter-data-jpa',
        'spring-boot-starter-validation'
      ],
      testing: [
        'spring-boot-starter-test'
      ],
      utilities: [
        'lombok'
      ]
    };

    if (versionInfo.majorVersion >= 3) {
      // Spring Boot 3.x specific
      base.utilities.push('jakarta.validation-api');
    } else {
      // Spring Boot 2.x specific
      base.utilities.push('javax.validation-api');
    }

    return base;
  }

  /**
   * Generate version-specific template context
   */
  getTemplateContext(versionInfo: any): Record<string, any> {
    return {
      springBootVersion: versionInfo.version,
      javaVersion: versionInfo.javaVersion,
      useJakarta: versionInfo.useJakarta,
      persistencePackage: versionInfo.useJakarta ? 'jakarta.persistence' : 'javax.persistence',
      validationPackage: versionInfo.useJakarta ? 'jakarta.validation' : 'javax.validation',
      servletPackage: versionInfo.useJakarta ? 'jakarta.servlet' : 'javax.servlet',
      annotationPackage: versionInfo.useJakarta ? 'jakarta.annotation' : 'javax.annotation'
    };
  }

  /**
   * Extract major version number
   */
  private getMajorVersion(version: string): number {
    const match = version.match(/^(\d+)\./);
    return match ? parseInt(match[1], 10) : 3; // Default to 3 if unknown
  }

  /**
   * Find Java files in repo
   */
  private findJavaFiles(): string[] {
    const files: string[] = [];

    const scan = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (['node_modules', 'target', 'build', '.git', '.myintern'].includes(entry.name)) {
            continue;
          }
          scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.java')) {
          files.push(fullPath);
        }
      }
    };

    scan(path.join(this.repoPath, 'src'));

    return files;
  }
}
