# Guardrails Demo

This example demonstrates MyIntern's sensitive data protection features.

## Quick Start

```bash
# 1. Create a Spring Boot project with sensitive data
cd examples/guardrails-demo

# 2. Run MyIntern - it will detect and block sensitive data
myintern run "Add user registration endpoint"

# Expected output:
# 🚫 Guardrails: Execution blocked (2 violations)
#    🔴 2 critical violations
#    - CREDENTIAL: 2
```

## Example Files

### ❌ Bad: Hardcoded Credentials (BLOCKED)

**File:** `src/main/java/com/example/BadConfig.java`

```java
package com.example;

public class BadConfig {
    // ❌ CRITICAL: AWS Access Key detected
    private static final String AWS_KEY = "AKIAIOSFODNN7EXAMPLE";

    // ❌ CRITICAL: Hardcoded password detected
    private static final String DB_PASSWORD = "SuperSecret123!";

    // ❌ BLOCK: Credit card in test data
    private static final String TEST_CARD = "4532-1234-5678-9010";
}
```

**Guardrails Output:**
```
🚫 Guardrails: Execution blocked (3 violations)
   🔴 2 critical violations require immediate attention
   - CREDENTIAL: 2
   - PII: 1

📄 src/main/java/com/example/BadConfig.java
  🔴 Line 5: AWS Access Key (credential)
  🔴 Line 8: Password in Code (credential)
  🚫 Line 11: Credit Card (pii)

❌ Cannot proceed. Remove sensitive data or use environment variables.
```

### ✅ Good: Environment Variables (ALLOWED)

**File:** `src/main/java/com/example/GoodConfig.java`

```java
package com.example;

public class GoodConfig {
    // ✅ Safe: Uses environment variable
    private static final String AWS_KEY = System.getenv("AWS_ACCESS_KEY_ID");

    // ✅ Safe: External configuration
    private static final String DB_PASSWORD = System.getenv("DB_PASSWORD");

    // ✅ Safe: Dummy test data in test file (whitelisted)
    // See agent.yml whitelist: ["**/*.test.java"]
}
```

**Guardrails Output:**
```
✅ Guardrails: No sensitive data detected
🤖 Processing spec with Code Agent...
```

### ⚠️ Warning: Redacted Data (ALLOWED WITH REDACTION)

**File:** `src/main/java/com/example/Contact.java`

```java
package com.example;

public class Contact {
    // ⚠️  WARN: Email address (informational only)
    private String email = "user@example.com";

    // ⚠️  WARN: Phone number (redacted before LLM)
    private String phone = "(555) 123-4567";
}
```

**Guardrails Output:**
```
⚠️  Guardrails: 2 violations detected (redacted)
   - PII: 2

📄 src/main/java/com/example/Contact.java
  ℹ️  Line 5: Email Address (pii)
  ⚠️  Line 8: Phone Number (pii)

✅ Files sanitized. Safe to send to LLM.
```

**Redacted version sent to LLM:**
```java
public class Contact {
    private String email = "***REDACTED***";
    private String phone = "***REDACTED***";
}
```

## Configuration

**File:** `.myintern/agent.yml`

```yaml
version: "1.1"

guardrails:
  enabled: true
  mode: mask                     # mask | hash | skip | none
  stopOnCritical: true

  categories:
    pii: true                    # SSN, credit cards, emails
    phi: true                    # Medical records (HIPAA)
    credentials: true            # API keys, passwords
    custom: false

  # Whitelist test files (they often have dummy data)
  whitelist:
    - "**/*.test.java"
    - "**/test-data/**"
```

## Override False Positives

If Guardrails incorrectly flags safe content:

```bash
myintern guardrails override \
  --file "src/test/TestData.java" \
  --pattern "Credit Card" \
  --reason "Test fixture with dummy card 4111-1111-1111-1111" \
  --expires "2026-12-31"
```

## Healthcare Example (PHI Protection)

**File:** `src/main/java/com/example/PatientService.java`

```java
package com.example;

public class PatientService {
    // 🔴 CRITICAL: Medical Record Number
    private String getMRN() {
        return "MRN: 1234567";  // BLOCKED!
    }

    // 🔴 CRITICAL: Patient ID
    private Long patientId = 12345L;  // BLOCKED!

    // ✅ Safe: Use environment variables
    private String getMRNSafe() {
        return System.getenv("PATIENT_MRN");
    }
}
```

**Guardrails Output:**
```
🚫 Guardrails: Execution blocked (2 violations)
   🔴 2 critical violations (HIPAA PHI detected)
   - PHI: 2

📄 src/main/java/com/example/PatientService.java
  🔴 Line 5: Medical Record Number (phi)
  🔴 Line 10: Patient ID (phi)

❌ Cannot proceed. PHI must not be hardcoded.
```

## Custom Patterns

Add organization-specific patterns:

```yaml
guardrails:
  categories:
    custom: true

  customPatterns:
    - name: "Employee ID"
      regex: "\\bEMP-\\d{6}\\b"
      level: warn
      category: custom
      description: "Internal employee identifier"

    - name: "Trade Secret"
      regex: "PROPRIETARY_[A-Z0-9]+"
      level: critical
      category: custom
```

**Example:**
```java
// 🔴 CRITICAL: Trade secret detected
String algorithm = "PROPRIETARY_ALGO_V2";  // BLOCKED!
```

## Testing Guardrails

```bash
# Scan a single file
myintern guardrails scan src/main/java/BadConfig.java

# Scan entire project
myintern guardrails scan --all

# View audit log
myintern guardrails logs --tail 20
```

## Compliance Audit

```bash
# Show all violations in last 30 days
grep "BLOCKED" .myintern/logs/guardrails.log | tail -30

# Count critical violations
grep "critical" .myintern/logs/guardrails.log | wc -l

# PHI violations (HIPAA audit)
grep "phi" .myintern/logs/guardrails.log
```

## Summary

| Violation Level | Behavior | Example |
|----------------|----------|---------|
| ℹ️  INFO | Log only | Email addresses |
| ⚠️  WARN | Redact before LLM | Phone numbers |
| 🚫 BLOCK | Block file | SSN, credit cards |
| 🔴 CRITICAL | Stop execution | API keys, medical records |

**Best Practice:** Always use environment variables for sensitive data!

```bash
# ❌ NEVER
String apiKey = "sk-ant-api03-xxxxx";

# ✅ ALWAYS
String apiKey = System.getenv("ANTHROPIC_API_KEY");
```

## Next Steps

1. Enable guardrails in your project: `myintern init`
2. Review violations: `myintern guardrails scan --all`
3. Fix hardcoded secrets: Use `${ENV_VAR}` references
4. Add overrides for false positives: `myintern guardrails override`
5. Monitor compliance: `myintern guardrails logs`

For full documentation, see [GUARDRAILS.md](../../docs/GUARDRAILS.md)
