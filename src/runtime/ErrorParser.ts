import { LogEvent, ParsedError, Language, StackFrame } from './types';

/**
 * Parse raw CloudWatch log messages into structured errors.
 *
 * Supports Java, Python, TypeScript stack traces.
 */
export class ErrorParser {
  /**
   * Parse log event into structured error
   * Returns null if not a recognizable error
   */
  parse(event: LogEvent): ParsedError | null {
    const errorType = this.extractErrorType(event.message);
    if (!errorType) {
      return null;
    }

    const stackTrace = this.extractStackTrace(event.message);
    if (stackTrace.length === 0) {
      return null;
    }

    const primaryFrame = stackTrace[0];
    const language = this.detectLanguage(event.message);

    return {
      errorType,
      filePath: primaryFrame.filePath,
      fileName: this.extractFileName(primaryFrame.filePath),
      lineNumber: primaryFrame.lineNumber,
      methodName: primaryFrame.methodName,
      stackTrace,
      timestamp: new Date(event.timestamp),
      logGroup: event.logGroup,
      logStream: event.logStream,
      language,
      rawMessage: event.message,
    };
  }

  /**
   * Extract error type from message
   *
   * Examples:
   * - "java.lang.NullPointerException: ..." → "NullPointerException"
   * - "SQLException: Connection refused" → "SQLException"
   */
  private extractErrorType(message: string): string | null {
    // Java: java.lang.NullPointerException (must have at least one dot + Exception/Error suffix)
    // This prevents false positives like "Handling Exception in controller"
    const javaMatch = message.match(/\b([\w]+\.[\w.]+(?:Exception|Error))\b/);
    if (javaMatch) {
      const fullType = javaMatch[1];
      // Get last component (strip package)
      return fullType.split('.').pop() || fullType;
    }

    // Python: TypeError, ValueError, etc. (must be at line start)
    const pythonMatch = message.match(/^(\w+Error):/m);
    if (pythonMatch) {
      return pythonMatch[1];
    }

    // TypeScript/Node.js: Error at start of line
    const tsMatch = message.match(/^(\w+Error):/m);
    if (tsMatch) {
      return tsMatch[1];
    }

    return null;
  }

  /**
   * Extract stack trace frames
   * Returns first 5 frames
   */
  private extractStackTrace(message: string): StackFrame[] {
    const frames: StackFrame[] = [];

    // Try Java format first
    const javaFrames = this.parseJavaStackTrace(message);
    if (javaFrames.length > 0) {
      return javaFrames.slice(0, 5);
    }

    // Try Python format
    const pythonFrames = this.parsePythonStackTrace(message);
    if (pythonFrames.length > 0) {
      return pythonFrames.slice(0, 5);
    }

    // Try TypeScript/Node.js format
    const tsFrames = this.parseTypeScriptStackTrace(message);
    if (tsFrames.length > 0) {
      return tsFrames.slice(0, 5);
    }

    return frames;
  }

  /**
   * Parse Java stack trace
   *
   * Format: at com.example.UserService.findById(UserService.java:42)
   */
  private parseJavaStackTrace(message: string): StackFrame[] {
    const frames: StackFrame[] = [];
    const regex = /at\s+([\w.$]+)\.([\w<>]+)\(([^:]+):(\d+)\)/g;

    let match;
    while ((match = regex.exec(message)) !== null) {
      frames.push({
        className: match[1],
        methodName: match[2],
        filePath: match[3],
        lineNumber: parseInt(match[4], 10),
      });
    }

    return frames;
  }

  /**
   * Parse Python stack trace
   *
   * Format: File "user_service.py", line 42, in find_by_id
   */
  private parsePythonStackTrace(message: string): StackFrame[] {
    const frames: StackFrame[] = [];
    const regex = /File "([^"]+)", line (\d+), in (\w+)/g;

    let match;
    while ((match = regex.exec(message)) !== null) {
      frames.push({
        filePath: match[1],
        lineNumber: parseInt(match[2], 10),
        methodName: match[3],
      });
    }

    return frames;
  }

  /**
   * Parse TypeScript/Node.js stack trace
   *
   * Format: at UserService.findById (/app/src/services/UserService.ts:42:15)
   */
  private parseTypeScriptStackTrace(message: string): StackFrame[] {
    const frames: StackFrame[] = [];
    const regex = /at\s+(?:([\w.]+)\s+)?\(([^:]+):(\d+):\d+\)/g;

    let match;
    while ((match = regex.exec(message)) !== null) {
      frames.push({
        methodName: match[1] || 'anonymous',
        filePath: match[2],
        lineNumber: parseInt(match[3], 10),
      });
    }

    return frames;
  }

  /**
   * Detect language from stack trace format
   */
  private detectLanguage(message: string): Language {
    if (/\.java:\d+\)/.test(message)) {
      return 'java';
    }
    if (/File ".*\.py", line \d+/.test(message)) {
      return 'python';
    }
    if (/\.ts:\d+:\d+\)/.test(message) || /\.js:\d+:\d+\)/.test(message)) {
      return 'typescript';
    }
    return 'java'; // Default to Java
  }

  /**
   * Extract filename from file path
   */
  private extractFileName(filePath: string): string {
    const parts = filePath.split('/');
    return parts[parts.length - 1] || filePath;
  }
}
