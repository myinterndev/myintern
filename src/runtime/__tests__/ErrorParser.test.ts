import { ErrorParser } from '../ErrorParser';
import { LogEvent } from '../types';

describe('ErrorParser', () => {
  const parser = new ErrorParser();

  describe('Java stack traces', () => {
    it('should parse Java NullPointerException', () => {
      const event: LogEvent = {
        logGroup: '/aws/lambda/prod-api',
        logStream: 'stream-1',
        timestamp: 1709722800000,
        message: `java.lang.NullPointerException: Cannot invoke "User.getId()" because "user" is null
  at com.example.UserService.findById(UserService.java:42)
  at com.example.UserController.getUser(UserController.java:28)
  at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)`,
      };

      const result = parser.parse(event);

      expect(result).not.toBeNull();
      expect(result?.errorType).toBe('NullPointerException');
      expect(result?.filePath).toBe('UserService.java');
      expect(result?.fileName).toBe('UserService.java');
      expect(result?.lineNumber).toBe(42);
      expect(result?.methodName).toBe('findById');
      expect(result?.language).toBe('java');
      expect(result?.stackTrace.length).toBeGreaterThanOrEqual(2);
      expect(result?.stackTrace[0].className).toBe('com.example.UserService');
    });

    it('should parse Java SQLException', () => {
      const event: LogEvent = {
        logGroup: '/aws/lambda/prod-api',
        logStream: 'stream-1',
        timestamp: 1709722800000,
        message: `java.sql.SQLException: Connection refused
  at com.example.db.ConnectionPool.getConnection(ConnectionPool.java:156)`,
      };

      const result = parser.parse(event);

      expect(result).not.toBeNull();
      expect(result?.errorType).toBe('SQLException');
      expect(result?.lineNumber).toBe(156);
    });

    it('should not match false positives like "Handling Exception in controller"', () => {
      const event: LogEvent = {
        logGroup: '/aws/lambda/prod-api',
        logStream: 'stream-1',
        timestamp: 1709722800000,
        message: 'INFO: Handling Exception in controller for user request',
      };

      const result = parser.parse(event);
      expect(result).toBeNull();
    });
  });

  describe('Python stack traces', () => {
    it('should parse Python TypeError', () => {
      const event: LogEvent = {
        logGroup: '/aws/lambda/prod-worker',
        logStream: 'stream-2',
        timestamp: 1709722800000,
        message: `TypeError: unsupported operand type(s) for +: 'int' and 'str'
  File "user_service.py", line 42, in find_by_id
  File "app.py", line 15, in main`,
      };

      const result = parser.parse(event);

      expect(result).not.toBeNull();
      expect(result?.errorType).toBe('TypeError');
      expect(result?.filePath).toBe('user_service.py');
      expect(result?.fileName).toBe('user_service.py');
      expect(result?.lineNumber).toBe(42);
      expect(result?.methodName).toBe('find_by_id');
      expect(result?.language).toBe('python');
    });

    it('should parse Python ValueError', () => {
      const event: LogEvent = {
        logGroup: '/aws/lambda/prod-worker',
        logStream: 'stream-2',
        timestamp: 1709722800000,
        message: `ValueError: invalid literal for int() with base 10: 'abc'
  File "parser.py", line 23, in parse_int`,
      };

      const result = parser.parse(event);

      expect(result).not.toBeNull();
      expect(result?.errorType).toBe('ValueError');
    });
  });

  describe('TypeScript/Node.js stack traces', () => {
    it('should parse TypeScript Error', () => {
      const event: LogEvent = {
        logGroup: '/ecs/production/backend',
        logStream: 'stream-3',
        timestamp: 1709722800000,
        message: `TypeError: Cannot read property 'id' of undefined
  at UserService.findById (/app/src/services/UserService.ts:42:15)
  at UserController.getUser (/app/src/controllers/UserController.ts:28:20)`,
      };

      const result = parser.parse(event);

      expect(result).not.toBeNull();
      expect(result?.errorType).toBe('TypeError');
      expect(result?.filePath).toBe('/app/src/services/UserService.ts');
      expect(result?.lineNumber).toBe(42);
      expect(result?.methodName).toBe('UserService.findById');
      expect(result?.language).toBe('typescript');
    });

    it('should handle anonymous functions', () => {
      const event: LogEvent = {
        logGroup: '/ecs/production/backend',
        logStream: 'stream-3',
        timestamp: 1709722800000,
        message: `TypeError: Something went wrong
  at (/app/src/index.js:10:5)`,
      };

      const result = parser.parse(event);

      expect(result).not.toBeNull();
      expect(result?.methodName).toBe('anonymous');
    });
  });

  describe('parse failures', () => {
    it('should return null for non-error messages', () => {
      const event: LogEvent = {
        logGroup: '/aws/lambda/prod-api',
        logStream: 'stream-1',
        timestamp: 1709722800000,
        message: 'INFO: Request processed successfully',
      };

      const result = parser.parse(event);
      expect(result).toBeNull();
    });

    it('should return null for errors without stack traces', () => {
      const event: LogEvent = {
        logGroup: '/aws/lambda/prod-api',
        logStream: 'stream-1',
        timestamp: 1709722800000,
        message: 'java.lang.NullPointerException: Something went wrong',
      };

      const result = parser.parse(event);
      expect(result).toBeNull();
    });
  });

  describe('stack trace limits', () => {
    it('should limit stack traces to 5 frames', () => {
      const event: LogEvent = {
        logGroup: '/aws/lambda/prod-api',
        logStream: 'stream-1',
        timestamp: 1709722800000,
        message: `java.lang.NullPointerException
  at com.example.A.method1(A.java:1)
  at com.example.B.method2(B.java:2)
  at com.example.C.method3(C.java:3)
  at com.example.D.method4(D.java:4)
  at com.example.E.method5(E.java:5)
  at com.example.F.method6(F.java:6)
  at com.example.G.method7(G.java:7)`,
      };

      const result = parser.parse(event);

      expect(result).not.toBeNull();
      expect(result?.stackTrace).toHaveLength(5);
      expect(result?.stackTrace[0].className).toBe('com.example.A');
      expect(result?.stackTrace[4].className).toBe('com.example.E');
    });
  });
});
