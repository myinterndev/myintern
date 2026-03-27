import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  FilteredLogEvent,
} from '@aws-sdk/client-cloudwatch-logs';
import { CloudWatchConfig, LogEvent } from './types';

/**
 * Poll AWS CloudWatch Logs for errors.
 */
export class CloudWatchMonitor {
  private client: CloudWatchLogsClient;
  private config: CloudWatchConfig;
  private lastPollTime: number;

  constructor(config: CloudWatchConfig, initialPollTime?: number) {
    this.config = config;
    const endpoint = process.env.AWS_ENDPOINT_URL;
    const useMockEndpoint = !!endpoint;

    this.client = new CloudWatchLogsClient({
      region: config.region,
      // When talking to mock CloudWatch, skip real AWS auth and use dummy credentials
      ...(useMockEndpoint ? { endpoint, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } } : {})
    });

    // If provided, resume from last poll time (daemon restart)
    // Otherwise, start from 60s ago (new daemon)
    this.lastPollTime = initialPollTime || Date.now() - (config.pollInterval * 1000);
  }

  /**
   * Poll logs for errors since last poll
   */
  async pollLogs(): Promise<LogEvent[]> {
    const now = Date.now();
    const startTime = this.lastPollTime;
    this.lastPollTime = now;

    const allEvents: LogEvent[] = [];

    // Poll each log group
    for (const logGroup of this.config.logGroups) {
      try {
        const events = await this.getLogEvents(logGroup, startTime, now);
        allEvents.push(...events);
      } catch (error: any) {
        console.error(`Failed to poll log group ${logGroup}:`, error.message);
        // Continue to next log group
      }
    }

    // Filter by error patterns
    return allEvents.filter(event => this.matchesErrorPattern(event.message));
  }

  /**
   * Get log events from specific log group
   */
  private async getLogEvents(
    logGroup: string,
    startTime: number,
    endTime: number
  ): Promise<LogEvent[]> {
    const command = new FilterLogEventsCommand({
      logGroupName: logGroup,
      startTime,
      endTime,
      limit: 1000, // Max events per query
    });

    const response = await this.client.send(command);
    const events: LogEvent[] = [];

    if (response.events) {
      for (const event of response.events) {
        if (event.message && event.timestamp && event.logStreamName) {
          events.push({
            logGroup,
            logStream: event.logStreamName,
            timestamp: event.timestamp,
            message: event.message,
          });
        }
      }
    }

    // Handle pagination (if more than 1000 events)
    if (response.nextToken) {
      console.warn(`Log group ${logGroup} has more than 1000 events, pagination needed`);
      // TODO: Implement pagination if needed
    }

    return events;
  }

  /**
   * Check if message matches any error pattern
   */
  private matchesErrorPattern(message: string): boolean {
    return this.config.errorPatterns.some(pattern => {
      // Simple string match (case-insensitive)
      return message.toLowerCase().includes(pattern.pattern.toLowerCase());
    });
  }
}
