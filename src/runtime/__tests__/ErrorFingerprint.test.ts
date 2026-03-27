import { ErrorFingerprint } from '../ErrorFingerprint';
import { ParsedError } from '../types';

describe('ErrorFingerprint', () => {
  const mockError: ParsedError = {
    errorType: 'NullPointerException',
    filePath: 'com/example/UserService.java',
    fileName: 'UserService.java',
    lineNumber: 42,
    methodName: 'findById',
    stackTrace: [],
    timestamp: new Date('2026-03-06T10:00:00Z'),
    logGroup: '/aws/lambda/prod-api',
    logStream: 'stream-1',
    language: 'java',
    rawMessage: 'test error',
  };

  describe('generate', () => {
    it('should generate 64-character SHA256 hash', () => {
      const fingerprint = ErrorFingerprint.generate(mockError);
      expect(fingerprint).toHaveLength(64);
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate consistent fingerprints for same error', () => {
      const fp1 = ErrorFingerprint.generate(mockError);
      const fp2 = ErrorFingerprint.generate(mockError);
      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprints for different error types', () => {
      const error2 = { ...mockError, errorType: 'SQLException' };
      const fp1 = ErrorFingerprint.generate(mockError);
      const fp2 = ErrorFingerprint.generate(error2);
      expect(fp1).not.toBe(fp2);
    });

    it('should generate different fingerprints for different methods', () => {
      const error2 = { ...mockError, methodName: 'deleteById' };
      const fp1 = ErrorFingerprint.generate(mockError);
      const fp2 = ErrorFingerprint.generate(error2);
      expect(fp1).not.toBe(fp2);
    });

    it('should normalize file paths before hashing', () => {
      const error1 = { ...mockError, filePath: 'com/example/UserService.java' };
      const error2 = { ...mockError, filePath: '/app/src/com/example/UserService.java' };
      const fp1 = ErrorFingerprint.generate(error1);
      const fp2 = ErrorFingerprint.generate(error2);
      // Both should hash to same value since normalized path is UserService.java
      expect(fp1).toBe(fp2);
    });
  });

  describe('generateShort', () => {
    it('should generate 8-character fingerprint', () => {
      const fingerprint = ErrorFingerprint.generateShort(mockError);
      expect(fingerprint).toHaveLength(8);
      expect(fingerprint).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should match first 8 chars of full fingerprint', () => {
      const full = ErrorFingerprint.generate(mockError);
      const short = ErrorFingerprint.generateShort(mockError);
      expect(short).toBe(full.substring(0, 8));
    });
  });

  describe('generateBoth', () => {
    it('should return both full and short fingerprints', () => {
      const result = ErrorFingerprint.generateBoth(mockError);
      expect(result).toHaveProperty('full');
      expect(result).toHaveProperty('short');
      expect(result.full).toHaveLength(64);
      expect(result.short).toHaveLength(8);
      expect(result.short).toBe(result.full.substring(0, 8));
    });
  });
});
