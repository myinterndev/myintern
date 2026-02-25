package com.example;

/**
 * ❌ BAD EXAMPLE - This file will be BLOCKED by Guardrails
 *
 * Contains hardcoded credentials and sensitive data.
 * Guardrails will detect and prevent this from being sent to LLM.
 */
public class BadConfig {

    // 🔴 CRITICAL: AWS Access Key detected
    private static final String AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";

    // 🔴 CRITICAL: AWS Secret Key detected
    private static final String AWS_SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

    // 🔴 CRITICAL: Hardcoded password
    private static final String DATABASE_PASSWORD = "SuperSecret123!";

    // 🔴 CRITICAL: Anthropic API Key
    private static final String ANTHROPIC_KEY = "sk-ant-api03-" + "x".repeat(92);

    // 🚫 BLOCK: Credit card number
    private static final String TEST_CARD = "4532-1234-5678-9010";

    // 🚫 BLOCK: Social Security Number
    private static final String SSN = "123-45-6789";

    // ⚠️  WARN: Phone number
    private static final String SUPPORT_PHONE = "(555) 123-4567";

    // 🔴 CRITICAL: Private key header
    private static final String PRIVATE_KEY =
        "-----BEGIN RSA PRIVATE KEY-----\n" +
        "MIIEpAIBAAKCAQEA...\n" +
        "-----END RSA PRIVATE KEY-----";

    // 🔴 CRITICAL: JWT token
    private static final String JWT_TOKEN =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0." +
        "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

    // 🔴 CRITICAL: Database connection with credentials
    private static final String DB_URL =
        "jdbc:postgresql://localhost:5432/mydb?user=admin&password=secret123";

    /**
     * Expected Guardrails output:
     *
     * 🚫 Guardrails: Execution blocked (10 violations)
     *    🔴 8 critical violations require immediate attention
     *    - CREDENTIAL: 8
     *    - PII: 2
     *
     * 📄 src/main/java/com/example/BadConfig.java
     *   🔴 Line 12: AWS Access Key (credential)
     *   🔴 Line 15: AWS Secret Key (credential)
     *   🔴 Line 18: Password in Code (credential)
     *   🔴 Line 21: Anthropic API Key (credential)
     *   🚫 Line 24: Credit Card (pii)
     *   🚫 Line 27: SSN (pii)
     *   ⚠️  Line 30: Phone Number (pii)
     *   🔴 Line 33: Private Key (credential)
     *   🔴 Line 39: JWT Token (credential)
     *   🔴 Line 44: Database Connection String (credential)
     *
     * ❌ Cannot proceed. Remove sensitive data or use environment variables.
     */
}
