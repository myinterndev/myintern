# Feature: JWT Token Refresh

**Jira:** AUTH-100
**Type:** feature
**Priority:** medium

## Description

Implement token refresh endpoint to allow users to get new JWT tokens without re-authenticating.
Use refresh tokens for enhanced security.

## Acceptance Criteria

- POST /api/auth/refresh endpoint
- Accept refresh token in request body
- Validate refresh token hasn't expired (7 days)
- Generate new access token (24 hours expiry)
- Return new access token and refresh token
- Return 401 Unauthorized for invalid/expired refresh tokens
- Unit tests with MockMvc

## Files Likely Affected

- src/main/java/com/example/controller/AuthController.java
- src/main/java/com/example/service/AuthService.java
- src/main/java/com/example/service/JwtService.java
- src/main/java/com/example/dto/RefreshTokenRequest.java
- src/main/java/com/example/dto/RefreshTokenResponse.java
- src/main/java/com/example/repository/RefreshTokenRepository.java

## Notes

This spec completes the AUTH-100 feature set.
Related specs: spec-login.md (creates refresh tokens), spec-logout.md (invalidates tokens).

The agent should:
- Use the same JwtService from spec-login.md
- Integrate with TokenBlacklistService from spec-logout.md
- Ensure refresh tokens are one-time use (rotate on each refresh)

Store refresh tokens in database (not Redis).
Refresh token expiry: 7 days
Access token expiry: 24 hours (consistent with login spec)
