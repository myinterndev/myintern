import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

/**
 * FeedbackLoop - Per-repo feedback collection and learning
 * Stores user feedback on generated code to improve future generations
 */
export class FeedbackLoop {
  private repoPath: string;
  private feedbackDir: string;
  private feedbackFile: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
    this.feedbackDir = path.join(repoPath, '.myintern', 'feedback');
    this.feedbackFile = path.join(this.feedbackDir, 'feedback.json');
  }

  /**
   * Record feedback for a specific change
   */
  recordFeedback(feedback: {
    changeId: string;
    spec: string;
    rating: 'positive' | 'negative' | 'neutral';
    comments?: string;
    issues?: Array<{
      type: 'bug' | 'style' | 'performance' | 'security' | 'other';
      description: string;
      file?: string;
      line?: number;
    }>;
    improvements?: string[];
  }): void {
    const feedbackEntry = {
      ...feedback,
      id: this.generateId(),
      timestamp: new Date().toISOString()
    };

    const allFeedback = this.loadFeedback();
    allFeedback.push(feedbackEntry);
    this.saveFeedback(allFeedback);

    console.log(chalk.green('✅ Feedback recorded successfully'));

    // Update patterns file for future learning
    this.updatePatterns(feedbackEntry);
  }

  /**
   * Get feedback for a specific change
   */
  getFeedback(changeId: string): any | null {
    const allFeedback = this.loadFeedback();
    return allFeedback.find(f => f.changeId === changeId) || null;
  }

  /**
   * Get all feedback
   */
  getAllFeedback(): Array<any> {
    return this.loadFeedback();
  }

  /**
   * Get feedback summary statistics
   */
  getSummary(): {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    commonIssues: Array<{ type: string; count: number }>;
    recentFeedback: Array<any>;
  } {
    const allFeedback = this.loadFeedback();

    const summary = {
      total: allFeedback.length,
      positive: allFeedback.filter(f => f.rating === 'positive').length,
      negative: allFeedback.filter(f => f.rating === 'negative').length,
      neutral: allFeedback.filter(f => f.rating === 'neutral').length,
      commonIssues: this.analyzeCommonIssues(allFeedback),
      recentFeedback: allFeedback.slice(-5).reverse()
    };

    return summary;
  }

  /**
   * Get learning patterns for prompt enhancement
   */
  getLearningPatterns(): {
    goodPatterns: string[];
    badPatterns: string[];
    commonMistakes: string[];
    recommendations: string[];
  } {
    const patternsFile = path.join(this.feedbackDir, 'patterns.json');

    if (!fs.existsSync(patternsFile)) {
      return {
        goodPatterns: [],
        badPatterns: [],
        commonMistakes: [],
        recommendations: []
      };
    }

    try {
      return JSON.parse(fs.readFileSync(patternsFile, 'utf-8'));
    } catch {
      return {
        goodPatterns: [],
        badPatterns: [],
        commonMistakes: [],
        recommendations: []
      };
    }
  }

  /**
   * Generate feedback context for LLM prompts
   */
  generateFeedbackContext(): string {
    const patterns = this.getLearningPatterns();
    const summary = this.getSummary();

    if (summary.total === 0) {
      return '';
    }

    let context = '\n## Previous Feedback & Learning Patterns\n\n';
    context += `This repo has ${summary.total} feedback entries (${summary.positive} positive, ${summary.negative} negative).\n\n`;

    if (patterns.goodPatterns.length > 0) {
      context += '### Patterns to Follow:\n';
      patterns.goodPatterns.forEach(p => {
        context += `- ✅ ${p}\n`;
      });
      context += '\n';
    }

    if (patterns.badPatterns.length > 0) {
      context += '### Patterns to Avoid:\n';
      patterns.badPatterns.forEach(p => {
        context += `- ❌ ${p}\n`;
      });
      context += '\n';
    }

    if (patterns.commonMistakes.length > 0) {
      context += '### Common Mistakes (avoid these):\n';
      patterns.commonMistakes.forEach(m => {
        context += `- ⚠️  ${m}\n`;
      });
      context += '\n';
    }

    if (patterns.recommendations.length > 0) {
      context += '### Recommendations:\n';
      patterns.recommendations.forEach(r => {
        context += `- 💡 ${r}\n`;
      });
      context += '\n';
    }

    return context;
  }

  /**
   * Update learning patterns based on new feedback
   */
  private updatePatterns(feedback: any): void {
    const patterns = this.getLearningPatterns();

    if (feedback.rating === 'positive' && feedback.improvements) {
      feedback.improvements.forEach((improvement: string) => {
        if (!patterns.goodPatterns.includes(improvement)) {
          patterns.goodPatterns.push(improvement);
        }
      });
    }

    if (feedback.rating === 'negative' && feedback.issues) {
      feedback.issues.forEach((issue: any) => {
        const mistake = `[${issue.type}] ${issue.description}`;
        if (!patterns.commonMistakes.includes(mistake)) {
          patterns.commonMistakes.push(mistake);
        }

        // Generate anti-pattern
        const antiPattern = `Avoid: ${issue.description}`;
        if (!patterns.badPatterns.includes(antiPattern)) {
          patterns.badPatterns.push(antiPattern);
        }
      });
    }

    // Save updated patterns
    const patternsFile = path.join(this.feedbackDir, 'patterns.json');
    if (!fs.existsSync(this.feedbackDir)) {
      fs.mkdirSync(this.feedbackDir, { recursive: true });
    }
    fs.writeFileSync(patternsFile, JSON.stringify(patterns, null, 2), 'utf-8');
  }

  /**
   * Analyze common issues across all feedback
   */
  private analyzeCommonIssues(allFeedback: Array<any>): Array<{ type: string; count: number }> {
    const issueCount: Record<string, number> = {};

    allFeedback.forEach(feedback => {
      if (feedback.issues) {
        feedback.issues.forEach((issue: any) => {
          issueCount[issue.type] = (issueCount[issue.type] || 0) + 1;
        });
      }
    });

    return Object.entries(issueCount)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Export feedback for analysis
   */
  exportFeedback(outputPath?: string): string {
    const allFeedback = this.loadFeedback();
    const summary = this.getSummary();
    const patterns = this.getLearningPatterns();

    const exportData = {
      summary,
      patterns,
      feedback: allFeedback
    };

    const exportFile = outputPath || path.join(this.feedbackDir, `export-${Date.now()}.json`);
    fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2), 'utf-8');

    return exportFile;
  }

  /**
   * Clear all feedback (with confirmation)
   */
  clearFeedback(): void {
    if (fs.existsSync(this.feedbackFile)) {
      fs.unlinkSync(this.feedbackFile);
    }

    const patternsFile = path.join(this.feedbackDir, 'patterns.json');
    if (fs.existsSync(patternsFile)) {
      fs.unlinkSync(patternsFile);
    }

    console.log(chalk.yellow('⚠️  All feedback cleared'));
  }

  /**
   * Load feedback from file
   */
  private loadFeedback(): Array<any> {
    if (!fs.existsSync(this.feedbackFile)) {
      return [];
    }

    try {
      return JSON.parse(fs.readFileSync(this.feedbackFile, 'utf-8'));
    } catch {
      return [];
    }
  }

  /**
   * Save feedback to file
   */
  private saveFeedback(feedback: Array<any>): void {
    if (!fs.existsSync(this.feedbackDir)) {
      fs.mkdirSync(this.feedbackDir, { recursive: true });
    }

    fs.writeFileSync(this.feedbackFile, JSON.stringify(feedback, null, 2), 'utf-8');
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `fb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
