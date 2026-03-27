import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface BuildResult {
  success: boolean;
  output: string;
  error?: string;
}

export class MavenBuilder {
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  isMavenProject(): boolean {
    return fs.existsSync(path.join(this.projectRoot, 'pom.xml'));
  }

  async compile(): Promise<BuildResult> {
    if (!this.isMavenProject()) {
      return {
        success: false,
        output: '',
        error: 'Not a Maven project (pom.xml not found)'
      };
    }

    try {
      const output = execSync('mvn compile -q', {
        cwd: this.projectRoot,
        encoding: 'utf-8'
      });

      return {
        success: true,
        output
      };
    } catch (error: any) {
      return {
        success: false,
        output: error.stdout || '',
        error: error.message
      };
    }
  }

  async test(): Promise<BuildResult> {
    if (!this.isMavenProject()) {
      return {
        success: false,
        output: '',
        error: 'Not a Maven project (pom.xml not found)'
      };
    }

    try {
      const output = execSync('mvn test -q', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return {
        success: true,
        output
      };
    } catch (error: any) {
      return {
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message
      };
    }
  }

  async clean(): Promise<BuildResult> {
    if (!this.isMavenProject()) {
      return {
        success: false,
        output: '',
        error: 'Not a Maven project (pom.xml not found)'
      };
    }

    try {
      const output = execSync('mvn clean -q', {
        cwd: this.projectRoot,
        encoding: 'utf-8'
      });

      return {
        success: true,
        output
      };
    } catch (error: any) {
      return {
        success: false,
        output: error.stdout || '',
        error: error.message
      };
    }
  }
}
