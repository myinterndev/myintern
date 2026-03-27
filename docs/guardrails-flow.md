# Guardrails Flow Diagram

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    MyIntern Guardrails                       │
│           Sensitive Data Protection System                   │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐
│ 1. Trigger   │  User runs: myintern run --spec FEATURE.md
└──────┬───────┘
       │
       ▼
┌───────────────────┐
│ 2. Spec Parser    │  Parse markdown spec
└─────────┬─────────┘
          │
          ▼
┌───────────────────────┐
│ 3. Context Builder    │  Gather relevant files:
│                       │  - Files mentioned in spec
│                       │  - Recently changed files (git diff)
│                       │  - Test files
│                       │  - Dependencies
└─────────┬─────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. GUARDRAILS PRE-FLIGHT CHECK                              │
│                                                             │
│  ┌────────────────────────────────────────────────┐        │
│  │ GuardrailsManager.validateFiles()             │        │
│  │                                                │        │
│  │  For each file:                                │        │
│  │  ┌─────────────────────────────────────────┐  │        │
│  │  │ SensitiveDataDetector.scan()            │  │        │
│  │  │                                         │  │        │
│  │  │  - Check whitelist (skip if matched)   │  │        │
│  │  │  - Scan each line with regex patterns  │  │        │
│  │  │  - Detect violations by category:      │  │        │
│  │  │    • PII (SSN, credit cards)           │  │        │
│  │  │    • PHI (medical records)             │  │        │
│  │  │    • Credentials (API keys)            │  │        │
│  │  │    • Custom (user patterns)            │  │        │
│  │  │  - Apply overrides (false positives)   │  │        │
│  │  │  - Return violations list              │  │        │
│  │  └─────────────────────────────────────────┘  │        │
│  └────────────────────────────────────────────────┘        │
│                                                             │
│  Results aggregated:                                        │
│  ┌────────────────────────────────────────────┐            │
│  │ DetectionResult[] {                        │            │
│  │   filePath: "Config.java"                  │            │
│  │   violations: [                            │            │
│  │     { pattern: "AWS Key", level: CRITICAL }│            │
│  │     { pattern: "Password", level: CRITICAL}│            │
│  │   ]                                        │            │
│  │   shouldBlock: true                        │            │
│  │ }                                          │            │
│  └────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
          │
          │
    ┌─────▼──────┐
    │ Decision   │
    └─────┬──────┘
          │
    ┌─────▼──────────────────────────────────────┐
    │                                            │
    │  Has CRITICAL violations?                  │
    │  (API keys, medical records, passwords)    │
    │                                            │
    └─────┬─────────────────────────────┬────────┘
          │                             │
         YES                           NO
          │                             │
          ▼                             │
    ┌─────────────────┐                │
    │ 🚫 BLOCK        │                │
    │                 │                │
    │ - Stop execution│                │
    │ - Show violations│                │
    │ - Suggest fixes │                │
    │ - Log to audit  │                │
    └─────────────────┘                │
                                       │
                    ┌──────────────────▼──────────────────┐
                    │ Has WARN/INFO violations?           │
                    │ (Emails, phone numbers)             │
                    └──────┬────────────────────┬─────────┘
                           │                    │
                          YES                  NO
                           │                    │
                           ▼                    │
                    ┌──────────────┐            │
                    │ ⚠️  REDACT   │            │
                    │              │            │
                    │ - Mask data  │            │
                    │ - Log action │            │
                    │ - Continue   │            │
                    └──────┬───────┘            │
                           │                    │
                           └────────┬───────────┘
                                    │
                                    ▼
                            ┌────────────────┐
                            │ ✅ ALLOW       │
                            │                │
                            │ - Safe content │
                            │ - Send to LLM  │
                            └────────┬───────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. Send to LLM                                               │
│                                                              │
│  Context sent to AI provider:                                │
│  - Spec content                                              │
│  - Safe file contents (redacted if needed)                   │
│  - Practices/coding standards                                │
│  - Git context                                               │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. Code Generation & Execution                               │
│                                                              │
│  - Generate code                                             │
│  - Run build                                                 │
│  - Run tests                                                 │
│  - Create PR                                                 │
└──────────────────────────────────────────────────────────────┘
```

## Detection Pattern Examples

### ✅ Clean File (Passes)

```java
// Config.java
String apiKey = System.getenv("API_KEY");  // ✅ Safe
String dbPassword = config.get("password"); // ✅ Safe
```

**Result:** No violations → Sent to LLM as-is

### ⚠️ Info/Warn File (Redacted)

```java
// Contact.java
String email = "user@example.com";     // ℹ️  INFO: Email
String phone = "(555) 123-4567";       // ⚠️  WARN: Phone
```

**Redacted version sent to LLM:**
```java
String email = "***REDACTED***";
String phone = "***REDACTED***";
```

### 🚫 Blocked File (Critical)

```java
// BadConfig.java
String key = "AKIAIOSFODNN7EXAMPLE";   // 🔴 CRITICAL: AWS Key
String mrn = "MRN: 1234567";           // 🔴 CRITICAL: Medical Record
```

**Result:** Execution STOPPED. File NOT sent to LLM.

## Override Flow (False Positives)

```
┌─────────────────┐
│ Violation found │
│ (False Positive)│
└────────┬────────┘
         │
         ▼
┌────────────────────┐
│ User adds override │  myintern guardrails override \
│                    │    --file "Test.java" \
│                    │    --pattern "SSN" \
│                    │    --reason "Dummy test data"
└────────┬───────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Saved to:                               │
│ .myintern/logs/guardrails-overrides.json│
│                                         │
│ {                                       │
│   "Test.java:SSN": [{                   │
│     "reason": "Dummy test data",        │
│     "expiresAt": "2026-12-31"           │
│   }]                                    │
│ }                                       │
└─────────────────────────────────────────┘
         │
         ▼
┌──────────────────────┐
│ Next scan:           │
│ Override applied →   │
│ Violation ignored    │
└──────────────────────┘
```

## Audit Logging

Every Guardrails action is logged for compliance:

```
┌──────────────────┐
│ Guardrails event │
└────────┬─────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ Written to:                            │
│ .myintern/logs/guardrails.log          │
│                                        │
│ {                                      │
│   "timestamp": "2026-02-22T10:15:30Z", │
│   "action": "BLOCKED",                 │
│   "violations": [                      │
│     {                                  │
│       "filePath": "Config.java",       │
│       "pattern": "AWS Access Key",     │
│       "line": 42,                      │
│       "level": "critical",             │
│       "category": "credential"         │
│     }                                  │
│   ]                                    │
│ }                                      │
└────────────────────────────────────────┘
         │
         ▼
┌──────────────────────┐
│ Queryable for:       │
│ - HIPAA audits       │
│ - SOC2 compliance    │
│ - Security reviews   │
└──────────────────────┘
```

## Configuration Impact

```yaml
# .myintern/agent.yml

guardrails:
  enabled: true            # ← Master switch
  mode: mask               # ← Redaction strategy
  stopOnCritical: true     # ← Block on CRITICAL violations

  categories:
    pii: true              # ← Enable PII detection
    phi: true              # ← Enable PHI detection (HIPAA)
    credentials: true      # ← Enable credential detection
    custom: false          # ← Disable custom patterns

  whitelist:
    - "**/*.test.java"     # ← Skip test files
```

**Impact:**
- `enabled: false` → Guardrails bypassed entirely (NOT RECOMMENDED)
- `mode: skip` → Entire file skipped if violation found
- `stopOnCritical: false` → Allow CRITICAL violations with redaction (DANGEROUS)
- `categories.phi: false` → Skip medical record detection

## Performance Characteristics

```
File Size      Scan Time    Memory
─────────────────────────────────────
100 lines      < 1ms        < 1MB
1,000 lines    ~1ms         ~2MB
10,000 lines   ~10ms        ~10MB
100,000 lines  ~100ms       ~50MB
```

**Optimization:**
- Compiled regex patterns (cached)
- Parallel file scanning
- Only scans files going to LLM (already filtered)

## Summary

**3-Layer Defense:**

1. **Prevention:** Block CRITICAL violations (API keys, medical records)
2. **Redaction:** Mask WARN violations (phone numbers, emails)
3. **Logging:** Audit all violations for compliance

**Zero Trust Model:**
- Every file scanned before LLM
- No exceptions unless explicitly whitelisted
- Complete audit trail

**Enterprise Ready:**
- Supports HIPAA workflows (PHI detection)
- Supports PCI-DSS workflows (credit card blocking)
- SOC 2 ready (audit logging)

---

**For detailed documentation, see:**
- [GUARDRAILS.md](./GUARDRAILS.md) - Complete guide
- [GUARDRAILS_SUMMARY.md](../GUARDRAILS_SUMMARY.md) - Implementation summary
