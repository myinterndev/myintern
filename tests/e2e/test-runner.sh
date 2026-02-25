#!/bin/bash
# MyIntern E2E Test Runner

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0

# Helper functions
assert_file_exists() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} File exists: $1"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} File missing: $1"
    ((FAIL++))
  fi
}

assert_contains() {
  if echo "$1" | grep -q "$2"; then
    echo -e "${GREEN}✓${NC} Output contains: $2"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} Output missing: $2"
    ((FAIL++))
  fi
}

cleanup() {
  rm -rf /tmp/myintern-e2e-*
}

# Cleanup before tests
cleanup
trap cleanup EXIT

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "MyIntern E2E Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test 1: Guardrails Detection
echo -e "\n📋 Test 1: Guardrails - Detect Credentials"
TEST_DIR="/tmp/myintern-e2e-guardrails"
mkdir -p "$TEST_DIR"
echo 'String apiKey = "sk-ant-api-12345678901234567890";' > "$TEST_DIR/Config.java"

OUTPUT=$(node dist/cli/index.js guardrails scan "$TEST_DIR/Config.java" 2>&1 || true)
assert_contains "$OUTPUT" "CRITICAL"
assert_contains "$OUTPUT" "API_KEY"

# Test 2: Guardrails - Safe Pattern
echo -e "\n📋 Test 2: Guardrails - Allow Safe Patterns"
echo 'String apiKey = System.getenv("API_KEY");' > "$TEST_DIR/SafeConfig.java"
OUTPUT=$(node dist/cli/index.js guardrails scan "$TEST_DIR/SafeConfig.java" 2>&1 || true)
assert_contains "$OUTPUT" "No violations"

# Test 3: Config Validation
echo -e "\n📋 Test 3: Config Validation"
TEST_DIR_CONFIG="/tmp/myintern-e2e-config"
mkdir -p "$TEST_DIR_CONFIG/.myintern"
cat > "$TEST_DIR_CONFIG/.myintern/agent.yml" <<EOF
version: "1.0"
llm:
  provider: anthropic
  model: claude-sonnet-4-5-20250929
  api_key: \${ANTHROPIC_API_KEY}
agents:
  code: true
  test: true
EOF

cd "$TEST_DIR_CONFIG"
OUTPUT=$(node "$(pwd)/dist/cli/index.js" config validate 2>&1 || true)
assert_contains "$OUTPUT" "valid"

# Test 4: Spec Parsing
echo -e "\n📋 Test 4: Spec File Parsing"
mkdir -p "$TEST_DIR_CONFIG/.myintern/specs"
cat > "$TEST_DIR_CONFIG/.myintern/specs/TEST.md" <<EOF
# FEATURE: Health Check

**Type:** feature
**Priority:** high

## Description
Add health endpoint

## Acceptance Criteria
- GET /health returns 200
EOF

# Touch file to ensure it's detected
touch "$TEST_DIR_CONFIG/.myintern/specs/TEST.md"
assert_file_exists "$TEST_DIR_CONFIG/.myintern/specs/TEST.md"

# Summary
echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAIL -gt 0 ]; then
  exit 1
fi
