import { LanguageDetector } from '../LanguageDetector';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('LanguageDetector', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-detector-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('detectPrimary', () => {
    it('should detect Maven Java project with Spring Boot', () => {
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), `<?xml version="1.0"?>
<project>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>`);

      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.language).toBe('java');
      expect(result.buildTool).toBe('maven');
      expect(result.framework).toBe('Spring Boot');
    });

    it('should detect Maven Java project without Spring Boot', () => {
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), `<?xml version="1.0"?>
<project>
  <dependencies>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
    </dependency>
  </dependencies>
</project>`);

      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.language).toBe('java');
      expect(result.buildTool).toBe('maven');
      expect(result.framework).toBeUndefined();
    });

    it('should detect Gradle Java project with Spring Boot', () => {
      fs.writeFileSync(path.join(tempDir, 'build.gradle'), `
plugins {
    id 'org.springframework.boot' version '3.2.0'
    id 'java'
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
}
`);

      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.language).toBe('java');
      expect(result.buildTool).toBe('gradle');
      expect(result.framework).toBe('Spring Boot');
    });

    it('should detect Gradle Kotlin project', () => {
      fs.writeFileSync(path.join(tempDir, 'build.gradle'), `
plugins {
    id 'org.jetbrains.kotlin.jvm' version '1.9.22'
}
`);

      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.language).toBe('java');
      expect(result.buildTool).toBe('gradle');
      expect(result.framework).toBe('Kotlin');
    });

    it('should detect Node.js Express project', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'test-app',
        dependencies: { express: '^4.18.0' }
      }));

      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.language).toBe('node');
      expect(result.framework).toBe('Express');
      expect(result.packageManager).toBe('npm');
    });

    it('should detect Node.js TypeScript project', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'test-app',
        devDependencies: { typescript: '^5.0.0' }
      }));

      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.language).toBe('node');
      expect(result.buildTool).toBe('typescript');
    });

    it('should detect Python Django project', () => {
      fs.writeFileSync(path.join(tempDir, 'requirements.txt'), 'Django==4.2\ncelery==5.3\n');
      fs.writeFileSync(path.join(tempDir, 'manage.py'), '#!/usr/bin/env python\n');

      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.language).toBe('python');
      expect(result.framework).toBe('Django');
    });

    it('should detect Python FastAPI with pyproject.toml', () => {
      fs.writeFileSync(path.join(tempDir, 'pyproject.toml'), `
[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.109.0"
`);

      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.language).toBe('python');
      expect(result.buildTool).toBe('poetry');
      expect(result.framework).toBe('FastAPI');
    });

    it('should return unknown for empty project', () => {
      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.language).toBe('unknown');
      expect(result.buildTool).toBe('manual');
    });
  });

  describe('detectAll', () => {
    it('should detect multiple project types in polyrepo', () => {
      // Java + Node.js
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), `<?xml version="1.0"?>
<project><dependencies></dependencies></project>`);
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'frontend',
        dependencies: { react: '^18.0.0' }
      }));

      const detector = new LanguageDetector(tempDir);
      const results = detector.detectAll();

      expect(results.length).toBe(2);
      expect(results.map(r => r.language)).toContain('java');
      expect(results.map(r => r.language)).toContain('node');
    });

    it('should return default for empty project', () => {
      const detector = new LanguageDetector(tempDir);
      const results = detector.detectAll();

      expect(results.length).toBe(1);
      expect(results[0].language).toBe('unknown');
    });
  });

  describe('package manager detection', () => {
    it('should detect yarn from yarn.lock', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'test-app',
        dependencies: {}
      }));
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '# yarn lockfile v1\n');

      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.packageManager).toBe('yarn');
    });

    it('should detect pnpm from pnpm-lock.yaml', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'test-app',
        dependencies: {}
      }));
      fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 6.0\n');

      const detector = new LanguageDetector(tempDir);
      const result = detector.detectPrimary();

      expect(result.packageManager).toBe('pnpm');
    });
  });

  describe('getBuildCommands', () => {
    it('should return Maven commands for Java/Maven', () => {
      const detector = new LanguageDetector(tempDir);
      const commands = detector.getBuildCommands({ language: 'java', buildTool: 'maven' });

      expect(commands.compile).toBe('mvn compile');
      expect(commands.test).toBe('mvn test');
      expect(commands.package).toBe('mvn package -DskipTests');
    });

    it('should return Gradle commands for Java/Gradle', () => {
      const detector = new LanguageDetector(tempDir);
      const commands = detector.getBuildCommands({ language: 'java', buildTool: 'gradle' });

      expect(commands.compile).toBe('./gradlew compileJava');
      expect(commands.test).toBe('./gradlew test');
    });

    it('should return npm commands for Node.js', () => {
      const detector = new LanguageDetector(tempDir);
      const commands = detector.getBuildCommands({ language: 'node', buildTool: 'typescript', packageManager: 'npm' });

      expect(commands.test).toBe('npm test');
    });

    it('should return poetry commands for Python/Poetry', () => {
      const detector = new LanguageDetector(tempDir);
      const commands = detector.getBuildCommands({ language: 'python', buildTool: 'poetry' });

      expect(commands.test).toBe('poetry run pytest');
    });
  });

  describe('getTestFramework', () => {
    it('should return JUnit for Java', () => {
      const detector = new LanguageDetector(tempDir);
      expect(detector.getTestFramework({ language: 'java', buildTool: 'maven' })).toBe('JUnit');
    });

    it('should return Jest for Node.js', () => {
      const detector = new LanguageDetector(tempDir);
      expect(detector.getTestFramework({ language: 'node', buildTool: 'typescript' })).toBe('Jest');
    });

    it('should return pytest for Python', () => {
      const detector = new LanguageDetector(tempDir);
      expect(detector.getTestFramework({ language: 'python', buildTool: 'pip' })).toBe('pytest');
    });

    it('should return unknown for unrecognized language', () => {
      const detector = new LanguageDetector(tempDir);
      expect(detector.getTestFramework({ language: 'unknown', buildTool: 'manual' })).toBe('unknown');
    });
  });
});
