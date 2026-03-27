# Feature: User Logout Endpoint

**Jira:** AUTH-100
**Type:** feature
**Priority:** high

## Description

Implement user logout endpoint to invalidate JWT tokens.
Add token to blacklist for security.

## Acceptance Criteria

- DELETE /api/auth/logout endpoint
- Invalidate current JWT token
- Add token to blacklist/revocation list
- Return 204 No Content on success
- Return 401 Unauthorized if no valid token provided
- Unit tests with MockMvc

## Files Likely Affected

- src/main/java/com/example/controller/AuthController.java
- src/main/java/com/example/service/AuthService.java
- src/main/java/com/example/service/TokenBlacklistService.java
- src/main/java/com/example/repository/TokenBlacklistRepository.java

## Notes

This spec builds on spec-login.md.
The agent should understand the JWT token structure from the login spec.

Use Redis for token blacklist (in-memory cache).
Blacklisted tokens should expire automatically after 24 hours.
