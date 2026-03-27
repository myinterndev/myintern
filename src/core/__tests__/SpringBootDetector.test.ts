import { SpringBootDetector } from '../SpringBootDetector';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SpringBootDetector', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-detector-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('detect from pom.xml', () => {
    it('should detect Spring Boot 3.x from parent starter', async () => {
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.4</version>
  </parent>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>`);

      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.version).toBe('3.2.4');
      expect(result.majorVersion).toBe(3);
      expect(result.useJakarta).toBe(true);
    });

    it('should detect Spring Boot 2.x from parent starter', async () => {
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>2.7.18</version>
  </parent>
</project>`);

      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.version).toBe('2.7.18');
      expect(result.majorVersion).toBe(2);
      expect(result.useJakarta).toBe(false);
    });

    it('should detect version from properties', async () => {
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <properties>
    <spring-boot.version>3.1.0</spring-boot.version>
    <java.version>21</java.version>
  </properties>
</project>`);

      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.version).toBe('3.1.0');
      expect(result.majorVersion).toBe(3);
      expect(result.useJakarta).toBe(true);
    });

    it('should extract Java version from pom.xml', async () => {
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
  </parent>
  <properties>
    <java.version>21</java.version>
  </properties>
</project>`);

      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.javaVersion).toBe('21');
    });

    it('should extract dependencies from pom.xml', async () => {
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
  </parent>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
  </dependencies>
</project>`);

      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.dependencies).toContain('spring-boot-starter-web');
      expect(result.dependencies).toContain('spring-boot-starter-data-jpa');
    });

    it('should extract Spring Cloud version', async () => {
      fs.writeFileSync(path.join(tempDir, 'pom.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
  </parent>
  <properties>
    <spring-cloud.version>2023.0.0</spring-cloud.version>
  </properties>
</project>`);

      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.springCloudVersion).toBe('2023.0.0');
    });
  });

  describe('detect from build.gradle', () => {
    it('should detect Spring Boot version from plugin', async () => {
      fs.writeFileSync(path.join(tempDir, 'build.gradle'), `
plugins {
    id 'org.springframework.boot' version '3.2.0'
    id 'io.spring.dependency-management' version '1.1.4'
    id 'java'
}

sourceCompatibility = '17'

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
}
`);

      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.version).toBe('3.2.0');
      expect(result.majorVersion).toBe(3);
      expect(result.useJakarta).toBe(true);
    });

    it('should extract dependencies from build.gradle', async () => {
      fs.writeFileSync(path.join(tempDir, 'build.gradle'), `
plugins {
    id 'org.springframework.boot' version '3.2.0'
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
}
`);

      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.dependencies).toContain('spring-boot-starter-web');
      expect(result.dependencies).toContain('spring-boot-starter-data-jpa');
    });
  });

  describe('detect from code (fallback)', () => {
    it('should detect jakarta imports as Spring Boot 3.x', async () => {
      const srcDir = path.join(tempDir, 'src', 'main', 'java', 'com', 'example');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'User.java'), `
package com.example;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class User {
    @Id
    private Long id;
}
`);

      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.useJakarta).toBe(true);
      expect(result.majorVersion).toBe(3);
    });

    it('should detect javax imports as Spring Boot 2.x', async () => {
      const srcDir = path.join(tempDir, 'src', 'main', 'java', 'com', 'example');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'User.java'), `
package com.example;

import javax.persistence.Entity;
import javax.persistence.Id;

@Entity
public class User {
    @Id
    private Long id;
}
`);

      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.useJakarta).toBe(false);
      expect(result.majorVersion).toBe(2);
    });

    it('should default to jakarta when no build files or code found', async () => {
      const detector = new SpringBootDetector(tempDir);
      const result = await detector.detect();

      expect(result.useJakarta).toBe(true);
      expect(result.majorVersion).toBe(3);
    });
  });

  describe('convertImports', () => {
    it('should convert javax to jakarta', () => {
      const detector = new SpringBootDetector(tempDir);
      const input = `import javax.persistence.Entity;
import javax.validation.Valid;
import javax.servlet.http.HttpServletRequest;`;

      const result = detector.convertImports(input, true);

      expect(result).toContain('import jakarta.persistence.Entity');
      expect(result).toContain('import jakarta.validation.Valid');
      expect(result).toContain('import jakarta.servlet.http.HttpServletRequest');
      expect(result).not.toContain('javax.');
    });

    it('should convert jakarta to javax', () => {
      const detector = new SpringBootDetector(tempDir);
      const input = `import jakarta.persistence.Entity;
import jakarta.validation.constraints.NotNull;`;

      const result = detector.convertImports(input, false);

      expect(result).toContain('import javax.persistence.Entity');
      expect(result).toContain('import javax.validation.constraints.NotNull');
      expect(result).not.toContain('jakarta.');
    });

    it('should not convert non-EE javax imports', () => {
      const detector = new SpringBootDetector(tempDir);
      const input = `import javax.crypto.Cipher;
import javax.net.ssl.SSLContext;`;

      const result = detector.convertImports(input, true);

      // These are Java SE, not EE — should NOT be converted
      expect(result).toContain('javax.crypto.Cipher');
      expect(result).toContain('javax.net.ssl.SSLContext');
    });
  });

  describe('getTemplateContext', () => {
    it('should return correct package mapping for jakarta', () => {
      const detector = new SpringBootDetector(tempDir);
      const versionInfo = { useJakarta: true, version: '3.2.0', javaVersion: '17' };

      const context = detector.getTemplateContext(versionInfo);

      expect(context.persistencePackage).toBe('jakarta.persistence');
      expect(context.validationPackage).toBe('jakarta.validation');
      expect(context.servletPackage).toBe('jakarta.servlet');
      expect(context.annotationPackage).toBe('jakarta.annotation');
      expect(context.springBootVersion).toBe('3.2.0');
      expect(context.javaVersion).toBe('17');
    });

    it('should return correct package mapping for javax', () => {
      const detector = new SpringBootDetector(tempDir);
      const versionInfo = { useJakarta: false, version: '2.7.18', javaVersion: '11' };

      const context = detector.getTemplateContext(versionInfo);

      expect(context.persistencePackage).toBe('javax.persistence');
      expect(context.validationPackage).toBe('javax.validation');
      expect(context.servletPackage).toBe('javax.servlet');
      expect(context.annotationPackage).toBe('javax.annotation');
    });
  });

  describe('getImportNamespace', () => {
    it('should map persistence package for jakarta', () => {
      const detector = new SpringBootDetector(tempDir);
      const result = detector.getImportNamespace('persistence', { useJakarta: true });
      expect(result).toBe('jakarta.persistence');
    });

    it('should map validation package for javax', () => {
      const detector = new SpringBootDetector(tempDir);
      const result = detector.getImportNamespace('validation', { useJakarta: false });
      expect(result).toBe('javax.validation');
    });

    it('should return original for unknown package', () => {
      const detector = new SpringBootDetector(tempDir);
      const result = detector.getImportNamespace('unknown.package', { useJakarta: true });
      expect(result).toBe('unknown.package');
    });
  });

  describe('getRecommendedDependencies', () => {
    it('should recommend jakarta validation for 3.x', () => {
      const detector = new SpringBootDetector(tempDir);
      const deps = detector.getRecommendedDependencies({ majorVersion: 3 });

      expect(deps.utilities).toContain('jakarta.validation-api');
      expect(deps.utilities).not.toContain('javax.validation-api');
      expect(deps.starters).toContain('spring-boot-starter-web');
    });

    it('should recommend javax validation for 2.x', () => {
      const detector = new SpringBootDetector(tempDir);
      const deps = detector.getRecommendedDependencies({ majorVersion: 2 });

      expect(deps.utilities).toContain('javax.validation-api');
      expect(deps.utilities).not.toContain('jakarta.validation-api');
    });
  });
});
