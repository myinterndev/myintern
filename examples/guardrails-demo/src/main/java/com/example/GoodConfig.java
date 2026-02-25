package com.example;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * ✅ GOOD EXAMPLE - This file passes Guardrails
 *
 * Uses environment variables instead of hardcoded secrets.
 * Safe to send to LLM for code generation.
 */
@Component
public class GoodConfig {

    // ✅ Safe: Uses environment variable
    @Value("${aws.access.key:#{environment.AWS_ACCESS_KEY_ID}}")
    private String awsAccessKey;

    // ✅ Safe: External configuration
    @Value("${aws.secret.key:#{environment.AWS_SECRET_ACCESS_KEY}}")
    private String awsSecretKey;

    // ✅ Safe: Spring Boot property
    @Value("${spring.datasource.password}")
    private String databasePassword;

    // ✅ Safe: Uses System.getenv
    private String getAnthropicKey() {
        return System.getenv("ANTHROPIC_API_KEY");
    }

    // ✅ Safe: No actual sensitive data
    private static final String SUPPORT_EMAIL = "support@example.com";

    // ✅ Safe: Example values only (clearly not real)
    private static final String EXAMPLE_PHONE = "1-800-EXAMPLE";

    /**
     * Expected Guardrails output:
     *
     * ✅ Guardrails: No sensitive data detected
     * 🤖 Processing spec with Code Agent...
     * ✅ Generated code successfully
     */

    /**
     * Best practices demonstrated:
     * 1. Use @Value for Spring Boot configuration
     * 2. Use System.getenv() for environment variables
     * 3. Reference ${ENV_VAR} in application.yml
     * 4. Never hardcode secrets, tokens, or keys
     * 5. Use clearly fake example values (1-800-EXAMPLE)
     */
}
