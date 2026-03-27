import { CloudWatchMonitor } from '../CloudWatchMonitor';
import { CloudWatchConfig } from '../types';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudwatch-logs', () => ({
  CloudWatchLogsClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  FilterLogEventsCommand: jest.fn(),
}));

import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';

describe('CloudWatchMonitor', () => {
  const mockConfig: CloudWatchConfig = {
    enabled: true,
    region: 'us-east-1',
    logGroups: ['/aws/lambda/prod-api', '/aws/lambda/prod-worker'],
    pollInterval: 60,
    errorPatterns: [
      { pattern: 'Exception', severity: 'high' },
      { pattern: 'Error', severity: 'medium' },
    ],
  };

  let monitor: CloudWatchMonitor;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend = jest.fn();
    (CloudWatchLogsClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
    monitor = new CloudWatchMonitor(mockConfig);
  });

  describe('initialization', () => {
    it('should create CloudWatch client with region', () => {
      expect(CloudWatchLogsClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    });

    it('should initialize with default poll time', () => {
      const monitor = new CloudWatchMonitor(mockConfig);
      // Last poll time should be ~60s ago (poll interval)
      expect((monitor as any).lastPollTime).toBeLessThanOrEqual(Date.now());
    });

    it('should resume from provided poll time', () => {
      const lastPollTime = Date.now() - 30000; // 30s ago
      const monitor = new CloudWatchMonitor(mockConfig, lastPollTime);
      expect((monitor as any).lastPollTime).toBe(lastPollTime);
    });
  });

  describe('pollLogs', () => {
    it('should poll all log groups', async () => {
      mockSend.mockResolvedValue({
        events: [
          {
            message: 'java.lang.NullPointerException',
            timestamp: Date.now(),
            logStreamName: 'stream-1',
          },
        ],
      });

      await monitor.pollLogs();

      expect(mockSend).toHaveBeenCalledTimes(2); // Two log groups
    });

    it('should filter events by error patterns', async () => {
      mockSend
        .mockResolvedValueOnce({
          events: [
            {
              message: 'NullPointerException occurred',
              timestamp: Date.now(),
              logStreamName: 'stream-1',
            },
            {
              message: 'INFO: Request processed successfully',
              timestamp: Date.now(),
              logStreamName: 'stream-2',
            },
          ],
        })
        .mockResolvedValueOnce({ events: [] }); // Second log group returns empty

      const events = await monitor.pollLogs();

      expect(events).toHaveLength(1);
      expect(events[0].message).toContain('Exception');
    });

    it('should return events matching error patterns', async () => {
      mockSend
        .mockResolvedValueOnce({
          events: [
            {
              message: 'Fatal Error occurred',
              timestamp: 1709722800000,
              logStreamName: 'stream-1',
            },
          ],
        })
        .mockResolvedValueOnce({ events: [] }); // Second log group returns empty

      const events = await monitor.pollLogs();

      expect(events).toHaveLength(1);
      expect(events[0].logGroup).toBe('/aws/lambda/prod-api');
      expect(events[0].logStream).toBe('stream-1');
      expect(events[0].timestamp).toBe(1709722800000);
      expect(events[0].message).toContain('Error');
    });

    it('should handle errors in individual log groups', async () => {
      mockSend
        .mockResolvedValueOnce({ events: [] }) // First group succeeds
        .mockRejectedValueOnce(new Error('Access denied')); // Second group fails

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const events = await monitor.pollLogs();

      expect(events).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to poll log group'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });

    it('should update last poll time after polling', async () => {
      mockSend.mockResolvedValue({ events: [] });

      const beforePoll = (monitor as any).lastPollTime;
      await monitor.pollLogs();
      const afterPoll = (monitor as any).lastPollTime;

      expect(afterPoll).toBeGreaterThan(beforePoll);
    });
  });

  describe('error pattern matching', () => {
    it('should match case-insensitively', async () => {
      mockSend
        .mockResolvedValueOnce({
          events: [
            {
              message: 'EXCEPTION occurred',
              timestamp: Date.now(),
              logStreamName: 'stream-1',
            },
          ],
        })
        .mockResolvedValueOnce({ events: [] }); // Second log group returns empty

      const events = await monitor.pollLogs();

      expect(events).toHaveLength(1);
    });

    it('should match partial strings', async () => {
      mockSend
        .mockResolvedValueOnce({
          events: [
            {
              message: 'NullPointerException in method',
              timestamp: Date.now(),
              logStreamName: 'stream-1',
            },
          ],
        })
        .mockResolvedValueOnce({ events: [] }); // Second log group returns empty

      const events = await monitor.pollLogs();

      expect(events).toHaveLength(1);
    });

    it('should not match non-error messages', async () => {
      mockSend.mockResolvedValue({
        events: [
          {
            message: 'INFO: Processing request',
            timestamp: Date.now(),
            logStreamName: 'stream-1',
          },
        ],
      });

      const events = await monitor.pollLogs();

      expect(events).toHaveLength(0);
    });
  });

  describe('pagination handling', () => {
    it('should warn when pagination is needed', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockSend.mockResolvedValue({
        events: Array(1000).fill({
          message: 'Exception occurred',
          timestamp: Date.now(),
          logStreamName: 'stream-1',
        }),
        nextToken: 'next-page-token',
      });

      await monitor.pollLogs();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('more than 1000 events')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('FilterLogEventsCommand parameters', () => {
    it('should use correct time range', async () => {
      mockSend.mockResolvedValue({ events: [] });

      const before = Date.now();
      await monitor.pollLogs();
      const after = Date.now();

      expect(FilterLogEventsCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          logGroupName: expect.any(String),
          startTime: expect.any(Number),
          endTime: expect.any(Number),
          limit: 1000,
        })
      );

      const mockCall = (FilterLogEventsCommand as any).mock;
      if (mockCall && mockCall.calls && mockCall.calls[0]) {
        const call = mockCall.calls[0][0];
        expect(call.endTime).toBeGreaterThanOrEqual(before);
        expect(call.endTime).toBeLessThanOrEqual(after);
      }
    });
  });
});
