import * as fs from 'fs';
import * as path from 'path';
import { SpecFile } from './SpecParser';

export interface ConflictReport {
  spec1: string;
  spec2: string;
  conflictType: 'method_signature' | 'class_definition' | 'file_overlap';
  details: string[];
  severity: 'high' | 'medium' | 'low';
}

/**
 * SemanticConflictDetector - Detects conflicts between specs at method/class level
 *
 * NEW in v1.2: Prevents merge conflicts by detecting overlapping changes
 *
 * Uses regex-based approach (fast, multi-language) vs AST-based (accurate, language-specific)
 */
export class SemanticConflictDetector {
  constructor(private repoPath: string) {}

  /**
   * Detect conflicts between multiple specs
   */
  async detectConflicts(specs: SpecFile[]): Promise<ConflictReport[]> {
    const conflicts: ConflictReport[] = [];

    // Compare each pair of specs
    for (let i = 0; i < specs.length; i++) {
      for (let j = i + 1; j < specs.length; j++) {
        const spec1 = specs[i];
        const spec2 = specs[j];

        // Check file overlap
        const fileOverlap = this.findFileOverlap(spec1, spec2);
        if (fileOverlap.length > 0) {
          // For overlapping files, check method-level conflicts
          const methodConflicts = await this.findMethodConflicts(spec1, spec2, fileOverlap);

          if (methodConflicts.length > 0) {
            conflicts.push({
              spec1: path.basename(spec1.filePath),
              spec2: path.basename(spec2.filePath),
              conflictType: 'method_signature',
              details: methodConflicts,
              severity: 'high'
            });
          } else {
            // File overlap but no method conflicts - still worth noting
            conflicts.push({
              spec1: path.basename(spec1.filePath),
              spec2: path.basename(spec2.filePath),
              conflictType: 'file_overlap',
              details: fileOverlap,
              severity: 'medium'
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Find files that both specs want to modify
   */
  private findFileOverlap(spec1: SpecFile, spec2: SpecFile): string[] {
    const files1 = this.extractFilePaths(spec1);
    const files2 = this.extractFilePaths(spec2);

    return files1.filter(f => files2.includes(f));
  }

  /**
   * Extract file paths from spec
   */
  private extractFilePaths(spec: SpecFile): string[] {
    const files: string[] = [];

    // Parse "Files Likely Affected" section
    const content = fs.readFileSync(spec.filePath, 'utf-8');
    const filesSection = content.match(/## Files Likely Affected\s*\n([\s\S]*?)(?=\n##|\n\n|$)/);

    if (filesSection) {
      const lines = filesSection[1].split('\n');
      for (const line of lines) {
        const match = line.match(/[-*]\s+(.+\.(?:java|ts|js|py|go|rs))/);
        if (match) {
          // Normalize path (remove repo prefix if present)
          let filePath = match[1].trim();
          // Handle multi-repo format: "repo-name/path/to/file"
          filePath = filePath.replace(/^[^/]+\//, '');
          files.push(filePath);
        }
      }
    }

    return files;
  }

  /**
   * Find method-level conflicts in overlapping files
   */
  private async findMethodConflicts(
    spec1: SpecFile,
    spec2: SpecFile,
    overlappingFiles: string[]
  ): Promise<string[]> {
    const conflicts: string[] = [];

    for (const file of overlappingFiles) {
      const methods1 = this.extractMethodsFromSpec(spec1, file);
      const methods2 = this.extractMethodsFromSpec(spec2, file);

      // Check for overlapping methods
      for (const method1 of methods1) {
        for (const method2 of methods2) {
          if (this.methodsConflict(method1, method2)) {
            conflicts.push(`${file}: ${method1.name}()`);
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Extract method names from spec content
   */
  private extractMethodsFromSpec(spec: SpecFile, targetFile: string): Array<{ name: string; signature: string }> {
    const methods: Array<{ name: string; signature: string }> = [];
    const content = fs.readFileSync(spec.filePath, 'utf-8');

    // Extract method signatures from spec description
    // Look for patterns like:
    // - "processOrder(Order order)"
    // - "public void processOrder(Order order, User user)"
    // - "processOrder method"

    const methodPatterns = [
      // Java/TypeScript: public void methodName(params)
      /(?:public|private|protected)?\s*(?:static)?\s*(?:\w+)\s+(\w+)\s*\(([^)]*)\)/g,
      // Simple: methodName(params)
      /(\w+)\s*\(([^)]*)\)/g,
      // "methodName method"
      /(\w+)\s+method/gi
    ];

    for (const pattern of methodPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        methods.push({
          name: match[1],
          signature: match[0]
        });
      }
    }

    return methods;
  }

  /**
   * Check if two methods conflict (same name or overlapping signature)
   */
  private methodsConflict(method1: { name: string; signature: string }, method2: { name: string; signature: string }): boolean {
    // Same method name is a conflict
    if (method1.name.toLowerCase() === method2.name.toLowerCase()) {
      return true;
    }

    // Check if signatures overlap (e.g., same params but different return type)
    const params1 = this.extractParams(method1.signature);
    const params2 = this.extractParams(method2.signature);

    if (params1.length === params2.length && params1.length > 0) {
      // If all param types match, it's likely the same method
      return params1.every((p, i) => p === params2[i]);
    }

    return false;
  }

  /**
   * Extract parameter types from method signature
   */
  private extractParams(signature: string): string[] {
    const match = signature.match(/\(([^)]*)\)/);
    if (!match || !match[1]) return [];

    return match[1]
      .split(',')
      .map(p => p.trim().split(/\s+/)[0]) // Extract type (first word)
      .filter(p => p.length > 0);
  }

  /**
   * Generate conflict report summary
   */
  summarizeConflicts(conflicts: ConflictReport[]): string {
    if (conflicts.length === 0) {
      return '✅ No semantic conflicts detected';
    }

    const lines = ['⚠️  Semantic conflicts detected:', ''];

    for (const conflict of conflicts) {
      lines.push(`   ${conflict.spec1} ⚔️  ${conflict.spec2}`);
      lines.push(`   Type: ${conflict.conflictType}`);
      lines.push(`   Severity: ${conflict.severity}`);

      if (conflict.details.length > 0) {
        lines.push('   Conflicts:');
        conflict.details.forEach(detail => {
          lines.push(`      - ${detail}`);
        });
      }

      lines.push('');
    }

    lines.push('   ⚠️  Running specs sequentially to avoid merge conflicts...');

    return lines.join('\n');
  }
}
