# Multi-Spec Example: User Authentication (AUTH-100)

This example demonstrates MyIntern's multi-spec support with three related specifications that share the same Jira ticket.

## Scenario

Implementing a complete authentication system with:
1. Login (create tokens)
2. Logout (invalidate tokens)
3. Token refresh (renew tokens)

## Specs

All three specs share **Jira: AUTH-100**:

1. **spec-login.md** - User login with JWT token generation
2. **spec-logout.md** - User logout with token blacklisting
3. **spec-token-refresh.md** - Refresh expired JWT tokens

## How It Works

### Processing Order

When you add these specs to `.myintern/specs/`:

```bash
# First spec processed
.myintern/specs/spec-login.md

Agent:
- Creates global context for AUTH-100
- Stores: "User authentication with JWT tokens"
- Implements login endpoint
```

```bash
# Second spec processed
.myintern/specs/spec-logout.md

Agent:
- Loads AUTH-100 context
- Sees: spec-login.md already processed
- Understands: JWT token structure from login
- Implements logout with same token format
- Updates context: "...and token blacklisting"
```

```bash
# Third spec processed
.myintern/specs/spec-token-refresh.md

Agent:
- Loads AUTH-100 context
- Sees: spec-login.md, spec-logout.md
- Understands: JwtService, TokenBlacklistService exist
- Reuses existing services
- Completes the authentication system
```

## Expected Global Context

After processing all three specs, `.myintern/.context/global-context.json`:

```json
{
  "AUTH-100": {
    "jiraTicket": "AUTH-100",
    "summary": "User authentication system\nJWT token-based login, logout, and refresh\nAC: POST /api/auth/login, DELETE /api/auth/logout, POST /api/auth/refresh",
    "context": "spec-login.md:\nFeature: User Login Endpoint\nImplement user login endpoint with email/password authentication...\n\nspec-logout.md:\nFeature: User Logout Endpoint\nImplement user logout endpoint to invalidate JWT tokens...\n\nspec-token-refresh.md:\nFeature: JWT Token Refresh\nImplement token refresh endpoint to allow users to get new JWT tokens...",
    "specs": [
      "spec-login.md",
      "spec-logout.md",
      "spec-token-refresh.md"
    ],
    "lastUpdated": "2026-02-22T11:00:00Z",
    "status": "in_progress"
  }
}
```

## Benefits Demonstrated

### 1. Code Coherence
- All three specs use the **same JwtService**
- Token format is **consistent** across endpoints
- Expiry times are **coordinated** (24h access, 7d refresh)

### 2. Service Reuse
- `spec-logout.md` reuses `JwtService` from `spec-login.md`
- `spec-token-refresh.md` integrates with both previous services

### 3. Architectural Consistency
- All specs follow Controller → Service → Repository pattern
- DTOs are consistent (LoginRequest/Response, RefreshTokenRequest/Response)

### 4. No Redundancy
- You don't need to re-explain JWT structure in each spec
- The agent "remembers" decisions from previous specs

## Testing the Feature

### Setup

1. Copy these specs to your test project:
   ```bash
   cp examples/multi-spec-example/*.md /path/to/your/spring-boot-project/.myintern/specs/
   ```

2. Start MyIntern:
   ```bash
   cd /path/to/your/spring-boot-project
   myintern start
   ```

### Expected Output

```
📋 Detected spec file: spec-login.md
   Title: Feature: User Login Endpoint
   Type: feature | Priority: high
   Jira: AUTH-100
   🔍 Building context...
   ✓ Context built: 5 files, 12,500 tokens
   🤖 Generating code...
   ✓ Generated 6 files

📋 Detected spec file: spec-logout.md
   Title: Feature: User Logout Endpoint
   Type: feature | Priority: high
   Jira: AUTH-100
   📎 Related specs: spec-login.md, spec-logout.md
   🔍 Building context...
   ✓ Context built: 8 files, 15,200 tokens (includes global context)
   🤖 Generating code...
   ✓ Generated 4 files

📋 Detected spec file: spec-token-refresh.md
   Title: Feature: JWT Token Refresh
   Type: feature | Priority: medium
   Jira: AUTH-100
   📎 Related specs: spec-login.md, spec-logout.md, spec-token-refresh.md
   🔍 Building context...
   ✓ Context built: 10 files, 18,700 tokens (includes global context)
   🤖 Generating code...
   ✓ Generated 6 files
```

Notice the **"📎 Related specs"** line - this shows the agent is aware of related work.

## Alternative: Single Spec Approach

Without multi-spec support, you would need one massive spec:

```markdown
# Feature: Complete Authentication System

## Acceptance Criteria
- Login endpoint
- Logout endpoint
- Token refresh endpoint
- JWT service
- Token blacklist
- Refresh token storage
- ...50 more lines...
```

**Problems:**
- Too large for a single spec (cognitive overload)
- Hard to review
- All-or-nothing implementation
- Can't iterate incrementally

**With multi-spec:**
- Three focused specs
- Easy to review individually
- Incremental implementation
- Agent maintains coherence automatically

## Key Takeaway

**Multi-spec support enables incremental development without losing architectural coherence.**

The agent "remembers" decisions across specs via global context, ensuring your codebase stays consistent.
