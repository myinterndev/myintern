#!/bin/bash
# Test MyIntern with real Spring Boot project

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Spring Boot Integration Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_PROJECT="/tmp/myintern-spring-test"
rm -rf "$TEST_PROJECT"
mkdir -p "$TEST_PROJECT"

# Create minimal Spring Boot project structure
cd "$TEST_PROJECT"
mkdir -p src/main/java/com/example/demo
mkdir -p src/test/java/com/example/demo
mkdir -p .myintern/specs

# Create pom.xml
cat > pom.xml <<EOF
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>demo</artifactId>
  <version>1.0.0</version>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
  </parent>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>
EOF

# Create spec for health endpoint
cat > .myintern/specs/HEALTH.md <<EOF
# FEATURE: Health Check Endpoint

**Type:** feature
**Priority:** high

## Description
REST endpoint for health checks

## Acceptance Criteria
- GET /api/health returns {"status": "UP"}
- Returns 200 status code

## Files Likely Affected
- src/main/java/com/example/demo/HealthController.java
EOF

# Initialize MyIntern
node "$(pwd)/../../dist/cli/index.js" init --force

echo -e "\n✅ Spring Boot test project created at: $TEST_PROJECT"
echo "Run: cd $TEST_PROJECT && myintern start"
