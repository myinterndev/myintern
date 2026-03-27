# Guardrails Quick Reference Card

**One-page cheat sheet for MyIntern Guardrails**

---

## 🎯 What is Guardrails?

Prevents sensitive data (PII, PHI, credentials) from being sent to LLM providers.

**Status Icons:**
- ✅ **Allowed** - No sensitive data, safe to send
- ⚠️ **Redacted** - Sensitive data masked, then sent
- 🚫 **Blocked** - Sensitive data found, NOT sent to LLM
- 🔴 **Critical** - Execution stopped immediately

---

## 📋 Detection Categories

| Category | What It Detects | Example |
|----------|----------------|---------|
| **PII** | Personal data | SSN: `123-45-6789` |
| **PHI** | Medical records (HIPAA) | MRN: `1234567` |
| **Credentials** | API keys, passwords | `AKIAIOSFODNN7EXAMPLE` |
| **Custom** | Your patterns | `EMP-123456` |

---

## 🔍 Common Patterns Detected

### ❌ Always Blocked (CRITICAL/BLOCK)

```java
// 🔴 AWS Keys
String key = "AKIAIOSFODNN7EXAMPLE";

// 🔴 API Keys
String key = "sk-ant-api03-xxxxx";

// 🔴 Passwords
String pwd = "SuperSecret123!";

// 🔴 Medical Records
String mrn = "MRN: 1234567";

// 🚫 SSN
String ssn = "123-45-6789";

// 🚫 Credit Cards
String card = "4532-1234-5678-9010";

// 🔴 Private Keys
String pem = "-----BEGIN PRIVATE KEY-----";
```

### ⚠️ Redacted (WARN)

```java
// ⚠️  Phone (redacted to ***)
String phone = "(555) 123-4567";
```

### ℹ️ Logged Only (INFO)

```java
// ℹ️  Email (logged, not blocked)
String email = "user@example.com";
```

---

## ✅ Safe Patterns (Always Pass)

```java
// ✅ Environment variables
String key = System.getenv("API_KEY");

// ✅ Spring Boot properties
@Value("${aws.access.key}")
private String awsKey;

// ✅ Configuration references
String pwd = config.get("password");

// ✅ Placeholder values
String example = "REPLACE_WITH_YOUR_KEY";
```

---

## ⚙️ Configuration

### Minimal Setup

```yaml
# .myintern/agent.yml
guardrails:
  enabled: true
  mode: mask
  stopOnCritical: true
  categories:
    pii: true
    phi: true
    credentials: true
    custom: false
```

### Redaction Modes

| Mode | Behavior |
|------|----------|
| `mask` | Replace with `***REDACTED***` |
| `hash` | Replace with `[HASH:a3f8c9d2...]` |
| `skip` | Skip entire file |
| `none` | Block without redaction |

### Whitelist (Skip Scanning)

```yaml
guardrails:
  whitelist:
    - "**/*.test.java"      # Test files
    - "**/test-data/**"     # Test fixtures
```

---

## 🛠️ CLI Commands

```bash
# Scan a file
myintern guardrails scan src/main/Config.java

# Scan all files
myintern guardrails scan --all

# Add override (false positive)
myintern guardrails override \
  --file "src/test/Test.java" \
  --pattern "SSN" \
  --reason "Test fixture" \
  --expires "2026-12-31"

# Remove override
myintern guardrails override --remove \
  --file "src/test/Test.java" \
  --pattern "SSN"

# View logs
myintern guardrails logs --tail 20

# Export audit report
myintern guardrails audit --since 30d
```

---

## 🚨 Example Outputs

### ✅ Clean Execution

```bash
$ myintern run --spec FEAT.md

✅ Guardrails: No sensitive data detected
🤖 Processing spec...
```

### ⚠️ Redacted

```bash
⚠️  Guardrails: 2 violations detected (redacted)
   - PII: 2

📄 Contact.java
  ℹ️  Line 10: Email Address (pii)
  ⚠️  Line 15: Phone Number (pii)

✅ Files sanitized. Safe to send to LLM.
```

### 🚫 Blocked

```bash
🚫 Guardrails: Execution blocked (2 violations)
   🔴 2 critical violations
   - CREDENTIAL: 2

📄 Config.java
  🔴 Line 8: AWS Access Key (credential)
  🔴 Line 11: Password in Code (credential)

❌ Cannot proceed.

Fix options:
1. Use environment variables: System.getenv("AWS_KEY")
2. Add override: myintern guardrails override ...
```

---

## 🔧 Troubleshooting

### "Execution blocked" but data looks safe

**Solution:** Add override

```bash
myintern guardrails override \
  --file "Test.java" \
  --pattern "SSN" \
  --reason "Test fixture with SSN format 000-00-0000"
```

### False positives in test files

**Solution:** Whitelist test files

```yaml
guardrails:
  whitelist:
    - "**/*.test.java"
    - "**/fixtures/**"
```

### Custom pattern not detected

**Solution:** Check regex syntax

```yaml
customPatterns:
  - name: "Employee ID"
    regex: "\\bEMP-\\d{6}\\b"  # ← Note double backslash
    level: warn
    category: custom
```

---

## 📊 Violation Levels

| Level | Icon | Behavior | Example |
|-------|------|----------|---------|
| `INFO` | ℹ️ | Log only | Email addresses |
| `WARN` | ⚠️ | Redact, then allow | Phone numbers |
| `BLOCK` | 🚫 | Block file | SSN, credit cards |
| `CRITICAL` | 🔴 | Stop execution | API keys, medical records |

---

## 🏥 HIPAA Compliance (Healthcare)

MyIntern detects all PHI identifiers:

```java
// 🔴 CRITICAL
String mrn = "MRN: 1234567";
Long patientId = 12345L;

// 🚫 BLOCK
String dob = "01/15/1980";

// ⚠️  WARN
String diagnosis = "ICD-10:E11.9";
```

**Audit Trail:** All violations logged to `.myintern/logs/guardrails.log`

---

## 💳 PCI-DSS Compliance (Finance)

Credit card patterns blocked:

```java
// 🚫 BLOCKED
String visa = "4532-1234-5678-9010";
String mastercard = "5425-2334-3010-9903";
```

---

## 🎓 Best Practices

### ❌ NEVER Do This

```java
String apiKey = "sk-ant-api03-xxxxx";        // CRITICAL
String password = "Secret123!";              // CRITICAL
String card = "4532-1234-5678-9010";        // BLOCKED
```

### ✅ ALWAYS Do This

```java
String apiKey = System.getenv("ANTHROPIC_API_KEY");
String password = config.getPassword();
String card = testData.getDummyCard();  // In whitelisted test file
```

---

## 📁 File Structure

```
.myintern/
├── agent.yml                        # Config with guardrails section
└── logs/
    ├── guardrails.log               # Audit trail (JSON)
    └── guardrails-overrides.json    # False positive overrides
```

---

## 🔗 Learn More

- **Full Guide:** [GUARDRAILS.md](./GUARDRAILS.md)
- **Implementation:** [GUARDRAILS_SUMMARY.md](../GUARDRAILS_SUMMARY.md)
- **Flow Diagram:** [guardrails-flow.md](./guardrails-flow.md)
- **Demo:** [examples/guardrails-demo/](../examples/guardrails-demo/)

---

## 🆘 Quick Help

```bash
# Check if guardrails enabled
myintern config get guardrails.enabled

# Enable guardrails
myintern config set guardrails.enabled true

# View current violations
myintern guardrails scan --all

# Test on one file
myintern guardrails scan path/to/file.java
```

---

**Remember:** Guardrails protect you from accidentally sending sensitive data to LLM providers. When in doubt, use environment variables!

**Default:** Guardrails are **enabled by default** in MyIntern v1.1+

---

_Last updated: 2026-02-22 | MyIntern v1.1_
