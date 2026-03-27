# Jira MCP Integration - Quick Reference

> **Version:** v1.3
> **Status:** ✅ Implemented

## Overview

MyIntern now supports Jira integration via MCP (Model Context Protocol) servers. Fetch Jira tickets and automatically convert them to MyIntern spec files.

---

## Setup (3 Steps)

### 1. Set up MCP Server

You need a Jira MCP server running separately. Options:

- **Local development:** Run MCP server on `localhost:3000`
- **Remote server:** Deploy MCP server at `jira.company.com:3000`
- **Reference:** See [Model Context Protocol](https://github.com/modelcontextprotocol) for server implementations

### 2. Configure agent.yml

Add MCP configuration to `.myintern/agent.yml`:

```yaml
mcp:
  servers:
    jira:
      enabled: true
      host: localhost                    # MCP server host
      port: 3000                         # Optional (default: 3000)
      access_token: ${JIRA_ACCESS_TOKEN} # Jira API token (env var)
      project_key: PROJ                  # Optional: default project
      issue_type: Story                  # Optional: filter by type
```

### 3. Set Environment Variable

```bash
export JIRA_ACCESS_TOKEN=your-jira-api-token
```

---

## Usage

### Fetch Single Ticket

```bash
myintern start --jira PROJ-123
```

**What happens:**

1. ✓ Tests MCP server connection (5s timeout)
2. ✓ Fetches Jira issue `PROJ-123`
3. ✓ Creates spec: `.myintern/specs/PROJ-123.md`
4. ✓ Watches for changes and generates code

### Console Output

```
🚀 Starting MyIntern Agent

📋 Fetching Jira ticket: PROJ-123

⋯ Testing MCP server connection...
✓ Connected to MCP server
⋯ Fetching issue PROJ-123...
✓ Fetched: Add user authentication endpoint
⋯ Creating spec file...
✓ Spec created: .myintern/specs/PROJ-123.md
  Type: Story
  Priority: High
  Status: To Do

ℹ Watching for changes...
```

---

## Generated Spec Format

When you run `myintern start --jira PROJ-123`, it creates:

```markdown
# STORY: Add user authentication endpoint

**Jira:** PROJ-123
**Type:** story
**Priority:** high
**Labels:** backend, security

## Description
[Jira description with cleaned markdown]

## Acceptance Criteria
- Implement functionality as described
- Add unit tests with 80%+ coverage
- Ensure backward compatibility

## Files Likely Affected
- src/main/java/...

## Notes
Synced from Jira ticket PROJ-123.
See practices/java.md for coding standards.
```

---

## Configuration Reference

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `enabled` | ✅ | `false` | Enable Jira MCP integration |
| `host` | ✅ | - | MCP server hostname |
| `access_token` | ✅ | - | Jira API token (use env var) |
| `port` | ❌ | `3000` | MCP server port |
| `project_key` | ❌ | - | Default project filter |
| `issue_type` | ❌ | - | Issue type filter (Story, Task, Bug) |
| `auto_sync` | ❌ | `false` | Auto-sync tickets (future) |
| `sync_labels` | ❌ | - | Label filter for sync (future) |

---

## MCP Protocol Details

MyIntern uses JSON-RPC 2.0 over TCP sockets.

### Request: Get Issue

```json
{
  "jsonrpc": "2.0",
  "id": 1234567890,
  "method": "jira.getIssue",
  "params": {
    "issueKey": "PROJ-123",
    "accessToken": "your-token"
  }
}
```

### Response: Issue Data

```json
{
  "jsonrpc": "2.0",
  "id": 1234567890,
  "result": {
    "key": "PROJ-123",
    "summary": "Add user authentication",
    "description": "Implement OAuth2...",
    "issueType": "Story",
    "status": "To Do",
    "priority": "High",
    "assignee": "john.doe",
    "labels": ["backend", "security"],
    "projectKey": "PROJ"
  }
}
```

---

## Error Handling

### Connection Timeout

```
✗ Cannot connect to Jira MCP server: Connection timeout after 5000ms
ℹ Check host: localhost:3000
```

**Fix:** Ensure MCP server is running at the configured host/port.

### Spec Already Exists

```
⚠ Spec already exists: .myintern/specs/PROJ-123.md
ℹ Watching for changes...
```

**Fix:** Delete existing spec or use a different ticket key.

### MCP Not Enabled

```
✗ Jira MCP not enabled in agent.yml
ℹ Add mcp.servers.jira configuration to agent.yml
```

**Fix:** Add MCP configuration and set `enabled: true`.

### Ticket Not Found

```
✗ Failed to fetch Jira issue PROJ-123: Issue not found
```

**Fix:** Check ticket key spelling and Jira permissions.

---

## Implementation Files

| File | Purpose |
|------|---------|
| [src/integrations/mcp/JiraMCPClient.ts](../src/integrations/mcp/JiraMCPClient.ts) | MCP client with connection testing |
| [src/integrations/mcp/JiraSpecConverter.ts](../src/integrations/mcp/JiraSpecConverter.ts) | Converts Jira issues to spec files |
| [src/cli/commands/start.ts](../src/cli/commands/start.ts) | CLI command with `--jira` flag |
| [src/utils/ConsoleLogger.ts](../src/utils/ConsoleLogger.ts) | Concise logging utility |
| [src/core/ConfigManager.ts](../src/core/ConfigManager.ts) | Config schema with MCP validation |

---

## Future Enhancements

- [ ] **Auto-sync:** Periodically fetch tickets matching labels
- [ ] **Batch fetch:** `myintern start --jira PROJ-123,PROJ-124,PROJ-125`
- [ ] **JQL queries:** `myintern start --jql "project = PROJ AND status = 'To Do'"`
- [ ] **Bidirectional sync:** Update Jira status when spec completes
- [ ] **Comment sync:** Post code review comments back to Jira
- [ ] **Webhook support:** Real-time ticket updates

---

## Troubleshooting

### MCP Server Not Responding

```bash
# Test connection manually
telnet localhost 3000

# Check if server is running
lsof -i :3000
```

### Invalid Access Token

```bash
# Verify token is set
echo $JIRA_ACCESS_TOKEN

# Test Jira API directly
curl -H "Authorization: Bearer $JIRA_ACCESS_TOKEN" \
  https://yourcompany.atlassian.net/rest/api/3/issue/PROJ-123
```

### Verbose Logging

```bash
# Enable verbose output
myintern start --jira PROJ-123 --verbose
```

---

## Example Workflow

```bash
# 1. Start MCP server (separate terminal)
jira-mcp-server --port 3000

# 2. Export Jira token
export JIRA_ACCESS_TOKEN=your-token

# 3. Fetch ticket and start watching
myintern start --jira PROJ-123

# 4. MyIntern creates spec and watches for changes
# Edit .myintern/specs/PROJ-123.md if needed

# 5. Code Agent generates code automatically
# Build Agent compiles and tests

# 6. Review and commit
git diff
git add .
git commit -m "feat: PROJ-123 - Add user authentication"
```

---

**Questions?** Check [CLAUDE.md](../.claude/CLAUDE.md) for full documentation.
