# Guardrails CLI Reference

Complete command reference for MyIntern's sensitive data protection system.

---

## Quick Start

```bash
# Scan a single file
myintern guardrails scan src/main/Config.java

# Scan entire project
myintern guardrails scan --all

# Scan specific directory
myintern guardrails scan --path src/main/java/com/example/

# View recent violations
myintern guardrails logs --tail 20

# Add false positive override
myintern guardrails override \
  --file "src/test/TestData.java" \
  --pattern "SSN" \
  --reason "Test fixture data" \
  --expires "2026-12-31"

# Generate compliance audit report
myintern guardrails audit --since 30d --format html --output compliance-report.html
```

---

## Commands

### `myintern guardrails scan`

Scan files for sensitive data (PII, PHI, credentials).

**Usage:**
```bash
myintern guardrails scan [file]
myintern guardrails scan --all
myintern guardrails scan --path <directory>
```

**Options:**
- `[file]` - Path to specific file to scan
- `--all` - Scan all files in project (respects whitelist in agent.yml)
- `--path <path>` - Scan specific directory

**Examples:**
```bash
# Scan single file
myintern guardrails scan src/main/java/com/example/UserService.java

# Scan all Java files
myintern guardrails scan --all

# Scan specific package
myintern guardrails scan --path src/main/java/com/example/auth/
```

**Output:**
```
🔍 Scanning all files in project...

⚠️  Guardrails: 3 violations detected (redacted)
   - PII: 2
   - CREDENTIALS: 1

📋 Violations by File:

   src/main/Config.java:
      🔴 Line 42: CREDENTIALS - AWS Access Key
         "AKIAIOSFODNN7EXAMPLE..."
      ⚠️  Line 58: PII - Email
         "user@example.com..."

   src/test/TestData.java:
      ℹ️  Line 15: PII - Phone Number
         "555-1234..."
```

**Exit Codes:**
- `0` - No violations or violations redacted successfully
- `1` - Critical violations detected, execution blocked

---

### `myintern guardrails override`

Add false positive override for detected patterns.

**Usage:**
```bash
myintern guardrails override \
  --file <path> \
  --pattern <pattern> \
  --reason <reason> \
  [--expires <date>]
```

**Options:**
- `--file <path>` - File path (required)
- `--pattern <pattern>` - Pattern name to override (e.g., "SSN", "API_KEY") (required)
- `--reason <reason>` - Justification for override (required)
- `--expires <date>` - Expiration date in YYYY-MM-DD format (optional)

**Examples:**
```bash
# Permanent override for test data
myintern guardrails override \
  --file "src/test/fixtures/TestUsers.java" \
  --pattern "SSN" \
  --reason "Test fixture with fake SSNs"

# Temporary override (expires after 90 days)
myintern guardrails override \
  --file "src/main/Config.java" \
  --pattern "API_KEY" \
  --reason "Migration in progress" \
  --expires "2026-06-30"
```

**Stored in:**
`.myintern/logs/guardrails-overrides.json`

---

### `myintern guardrails remove-override`

Remove a previously added override.

**Usage:**
```bash
myintern guardrails remove-override \
  --file <path> \
  --pattern <pattern>
```

**Examples:**
```bash
myintern guardrails remove-override \
  --file "src/main/Config.java" \
  --pattern "API_KEY"
```

---

### `myintern guardrails logs`

View guardrails audit logs (all scans and violations).

**Usage:**
```bash
myintern guardrails logs [--tail <n>] [--json]
```

**Options:**
- `--tail <n>` - Show last N log entries (default: 20)
- `--json` - Output as JSON

**Examples:**
```bash
# Show last 20 entries (default)
myintern guardrails logs

# Show last 50 entries
myintern guardrails logs --tail 50

# Export as JSON
myintern guardrails logs --tail 100 --json > logs.json
```

**Output:**
```
📋 Recent Guardrails Logs:

2026-02-23 10:45:12 AM BLOCKED
  src/main/Config.java:
    🔴 Line 42: credentials - AWS Access Key
    🔴 Line 58: credentials - Anthropic API Key

2026-02-23 09:30:45 AM ALLOWED_WITH_REDACTION
  src/main/UserController.java:
    ⚠️  Line 120: pii - Email
```

---

### `myintern guardrails audit`

Generate compliance audit report.

**Usage:**
```bash
myintern guardrails audit \
  [--since <duration>] \
  [--format <format>] \
  [--output <file>]
```

**Options:**
- `--since <duration>` - Timeframe: `30d` (days), `24h` (hours), `60m` (minutes) (default: `30d`)
- `--format <format>` - Output format: `json`, `csv`, `html` (default: `json`)
- `--output <file>` - Save to file (default: stdout)

**Examples:**
```bash
# JSON report for last 30 days
myintern guardrails audit --since 30d --format json

# HTML report for last 7 days
myintern guardrails audit --since 7d --format html --output compliance-report.html

# CSV export for last 90 days
myintern guardrails audit --since 90d --format csv --output violations.csv
```

**JSON Output:**
```json
{
  "summary": {
    "totalScans": 42,
    "blockedCount": 5,
    "allowedCount": 37,
    "timeframe": {
      "start": "2026-01-24T10:00:00Z",
      "end": "2026-02-23T10:00:00Z"
    }
  },
  "violationsByCategory": {
    "pii": 15,
    "credentials": 8,
    "phi": 2
  },
  "violationsByLevel": {
    "critical": 8,
    "block": 2,
    "warn": 10,
    "info": 5
  },
  "entries": [...]
}
```

**CSV Output:**
```
Timestamp,Action,File,Category,Pattern,Level,Line
2026-02-23T10:45:12Z,BLOCKED,src/main/Config.java,credentials,AWS Access Key,critical,42
2026-02-23T09:30:45Z,ALLOWED_WITH_REDACTION,src/main/User.java,pii,Email,warn,120
...
```

**HTML Report:**
- Summary dashboard with metrics
- Violations by category table
- Recent events table with timestamps
- Color-coded severity levels

---

## Configuration

Guardrails are configured in `.myintern/agent.yml`:

```yaml
guardrails:
  enabled: true                      # Enable/disable guardrails
  mode: mask                         # mask | hash | skip | none
  stopOnCritical: true               # Stop execution on critical violations

  # Detection categories
  categories:
    pii: true                        # Personal data (SSN, credit cards, etc.)
    phi: true                        # Medical records (HIPAA)
    credentials: true                # API keys, passwords, tokens
    custom: false                    # User-defined patterns

  # Whitelist patterns (skip scanning)
  whitelist:
    - "**/*.test.java"               # Skip test files
    - "**/test-data/**"              # Skip test fixtures
    - "**/__mocks__/**"              # Skip mock data
```

---

## Detection Categories

### PII (Personal Identifiable Information)
- Social Security Numbers (SSN): `123-45-6789`
- Credit cards: Visa, Mastercard, Amex, Discover
- Phone numbers: US formats
- Email addresses

### PHI (Protected Health Information - HIPAA)
- Medical Record Numbers (MRN)
- Patient IDs
- ICD-10 diagnosis codes
- Date of Birth patterns

### Credentials
- AWS Access Keys: `AKIA...`
- AWS Secret Keys
- Anthropic API Keys: `sk-ant-...`
- OpenAI API Keys: `sk-...`
- GitHub Personal Access Tokens: `ghp_...`
- Private Keys: SSH, RSA, EC

### Custom Patterns
Define your own patterns in `agent.yml`:

```yaml
guardrails:
  categories:
    custom: true
  customPatterns:
    - name: "Employee ID"
      regex: "EMP-\\d{6}"
      level: warn
      category: custom
      description: "Internal employee identifier"
```

---

## Redaction Modes

| Mode | Behavior | Example |
|------|----------|---------|
| `mask` | Replace with `***REDACTED***` | `AKIAIOSFODNN7EXAMPLE` → `***REDACTED***` |
| `hash` | Replace with SHA256 hash prefix | `AKIAIOSFODNN7EXAMPLE` → `[HASH:a3f8c9d2...]` |
| `skip` | Skip entire file from LLM context | File not sent to LLM |
| `none` | Block without redaction | Execution stopped, no LLM call |

---

## Violation Levels

| Level | Behavior | Example Patterns |
|-------|----------|------------------|
| `INFO` | Log only, don't block | Email addresses |
| `WARN` | Warn, redact, allow | Phone numbers |
| `BLOCK` | Reject file from LLM | SSN, credit cards |
| `CRITICAL` | Stop execution immediately | API keys, passwords, medical records |

---

## Safe Patterns (Auto-Whitelisted)

These patterns are automatically recognized as safe and won't trigger violations:

### Environment Variables
```java
System.getenv("API_KEY")           // ✅ Safe
System.getenv("AWS_SECRET_KEY")    // ✅ Safe
```

### Spring Boot Properties
```java
@Value("${aws.access.key}")        // ✅ Safe
@Value("${anthropic.api.key}")     // ✅ Safe
```

### Configuration Lookups
```java
config.get("password")             // ✅ Safe
properties.getProperty("api_key")  // ✅ Safe
```

### Placeholders
```java
String key = "REPLACE_WITH_YOUR_KEY";     // ✅ Safe
String token = "YOUR_API_KEY_HERE";       // ✅ Safe
String secret = "sk-ant-PLACEHOLDER";     // ✅ Safe
```

---

## Compliance Support

### HIPAA (Health Insurance Portability and Accountability Act)
Guardrails detect all 18 PHI identifiers:
- Medical Record Numbers (MRN)
- Patient IDs
- ICD-10 diagnosis codes
- Dates of birth
- And 14 more HIPAA identifiers

**Audit Trail:**
All violations logged to `.myintern/logs/guardrails.log` with:
- Timestamp
- File path
- Pattern detected
- Action taken (BLOCKED / ALLOWED_WITH_REDACTION)

### PCI-DSS (Payment Card Industry Data Security Standard)
- Visa: 16-digit cards starting with 4
- Mastercard: 16-digit cards starting with 51-55
- Amex: 15-digit cards starting with 34/37
- Discover: 16-digit cards starting with 6011/65

---

## Troubleshooting

### "Guardrails are disabled in agent.yml"
**Solution:** Enable guardrails in `.myintern/agent.yml`:
```yaml
guardrails:
  enabled: true
```

### "No guardrails logs found"
**Cause:** No scans have been run yet.
**Solution:** Run `myintern guardrails scan --all` first.

### False Positive Detected
**Solution:** Add an override:
```bash
myintern guardrails override \
  --file "path/to/file.java" \
  --pattern "Pattern Name" \
  --reason "Justification"
```

### Expired Override Still Blocking
**Cause:** Override has expired.
**Solution:** Remove and re-add with new expiration:
```bash
myintern guardrails remove-override --file "file.java" --pattern "SSN"
myintern guardrails override --file "file.java" --pattern "SSN" --reason "..." --expires "2027-12-31"
```

---

## Integration with Code Agent

Guardrails run **automatically** when the Code Agent sends context to the LLM:

```
Code Agent Workflow:
1. Spec file detected
2. Context built (files, git diff, practices)
3. 🛡️ GUARDRAILS SCAN (automatic)
   ├─ PII detection
   ├─ PHI detection
   ├─ Credential detection
   └─ Custom pattern matching
4. If violations found:
   ├─ CRITICAL → Stop execution
   ├─ BLOCK → Skip file
   ├─ WARN → Redact and continue
   └─ INFO → Log only
5. Send sanitized context to LLM
6. Generate code
```

**No manual intervention required** - guardrails protect you automatically!

---

## Best Practices

### 1. Enable Guardrails in CI/CD
```bash
# In GitHub Actions / GitLab CI
myintern guardrails scan --all
if [ $? -ne 0 ]; then
  echo "❌ Sensitive data detected. Fix before deploying."
  exit 1
fi
```

### 2. Regular Audits
```bash
# Weekly compliance check
myintern guardrails audit --since 7d --format html --output weekly-report.html
```

### 3. Whitelist Test Files
```yaml
guardrails:
  whitelist:
    - "**/*.test.java"
    - "**/fixtures/**"
    - "**/__mocks__/**"
```

### 4. Use Expiring Overrides
Always set expiration dates for temporary overrides:
```bash
myintern guardrails override \
  --file "..." \
  --pattern "..." \
  --reason "Migration in progress - remove after Q2 2026" \
  --expires "2026-06-30"
```

### 5. Review Logs Monthly
```bash
myintern guardrails logs --tail 100 | grep BLOCKED
```

---

## Files Created by Guardrails

```
.myintern/
└── logs/
    ├── guardrails.log                # Audit trail (JSON)
    └── guardrails-overrides.json     # False positive overrides
```

**⚠️ NEVER commit these files to Git** - they may contain violation details!

Add to `.gitignore`:
```
.myintern/logs/
```

---

## Summary

| Command | Purpose | Use When |
|---------|---------|----------|
| `scan` | Detect sensitive data | Before committing, during code review |
| `override` | Mark false positives | Test data, placeholders |
| `remove-override` | Remove override | Override no longer needed |
| `logs` | View violation history | Debugging, audit trail |
| `audit` | Generate compliance report | Monthly review, compliance certification |

**🛡️ Guardrails protect your data automatically - zero configuration required!**
