import { CodeAgent } from '../../agents/CodeAgent';
import { ConfigManager } from '../../core/ConfigManager';
import { JiraMCPClient } from '../../integrations/mcp/JiraMCPClient';
import { JiraSpecConverter } from '../../integrations/mcp/JiraSpecConverter';
import { ConsoleLogger } from '../../utils/ConsoleLogger';

export async function startCommand(options?: {
  agent?: string;
  foreground?: boolean;
  verbose?: boolean;
  jira?: string; // Jira ticket key (e.g., "PROJ-123")
}) {
  const logger = new ConsoleLogger(options?.verbose);

  logger.section('🚀 Starting MyIntern Agent');

  // Check if initialized
  const configManager = new ConfigManager();
  if (!configManager.exists()) {
    logger.error('MyIntern not initialized');
    logger.info('Run: myintern init');
    logger.blank();
    return;
  }

  try {
    const config = configManager.load();

    // Handle --jira flag: fetch ticket and create spec
    if (options?.jira) {
      await handleJiraTicket(options.jira, config, logger);
      // Don't return - continue to watch mode
    }

    // Start Code Agent
    const codeAgent = new CodeAgent({ verbose: options?.verbose });
    await codeAgent.start();

    logger.info('Press Ctrl+C to stop');
    logger.blank();

    // Keep process alive and handle shutdown
    process.on('SIGINT', async () => {
      logger.blank();
      logger.warn('Stopping MyIntern agents...');
      await codeAgent.stop();
      logger.success('Agents stopped');
      logger.blank();
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});

  } catch (error: any) {
    logger.error(`Failed to start: ${error.message}`);
    logger.blank();
    process.exit(1);
  }
}

/**
 * Handle --jira flag: fetch ticket and create spec
 */
async function handleJiraTicket(ticketKey: string, config: any, logger: ConsoleLogger): Promise<void> {
  logger.section(`📋 Fetching Jira ticket: ${ticketKey}`);

  // Check if Jira MCP is configured
  if (!config.mcp?.servers?.jira?.enabled) {
    logger.error('Jira MCP not enabled in agent.yml');
    logger.info('Add mcp.servers.jira configuration to agent.yml');
    logger.blank();
    process.exit(1);
  }

  const jiraConfig = config.mcp.servers.jira;

  try {
    // Test connection first
    logger.progress('Testing MCP server connection...');
    const client = new JiraMCPClient(jiraConfig);
    const connectionTest = await client.testConnection();

    if (!connectionTest.success) {
      logger.error(`Cannot connect to Jira MCP server: ${connectionTest.error}`);
      logger.info(`Check host: ${jiraConfig.host}:${jiraConfig.port || 3000}`);
      logger.blank();
      process.exit(1);
    }

    logger.success('Connected to MCP server');

    // Fetch Jira issue
    logger.progress(`Fetching issue ${ticketKey}...`);
    const issue = await client.fetchIssue(ticketKey);
    logger.success(`Fetched: ${issue.summary}`);

    // Convert to spec
    const converter = new JiraSpecConverter();

    if (converter.specExists(ticketKey)) {
      logger.warn(`Spec already exists: ${converter.getSpecPath(ticketKey)}`);
      logger.info('Watching for changes...');
      logger.blank();
      return;
    }

    logger.progress('Creating spec file...');
    const specPath = await converter.saveSpec(issue);
    logger.success(`Spec created: ${specPath}`);

    logger.kv('Type', issue.issueType);
    logger.kv('Priority', issue.priority);
    logger.kv('Status', issue.status);

    logger.blank();
    logger.info('Watching for changes...');
    logger.blank();

  } catch (error: any) {
    logger.error(`Failed to process Jira ticket: ${error.message}`);
    logger.blank();
    process.exit(1);
  }
}
