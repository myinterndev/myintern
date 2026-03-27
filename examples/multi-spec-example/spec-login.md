# Feature: User Login Endpoint

**Jira:** AUTH-100
**Type:** feature
**Priority:** high

## Description

Implement user login endpoint with email/password authentication.
Support JWT token generation and session management.

## Acceptance Criteria

- POST /api/auth/login endpoint
- Email validation (format check)
- Password verification using BCrypt
- Generate JWT token on successful authentication
- Return 401 Unauthorized for invalid credentials
- Return 400 Bad Request for malformed input
- Unit tests with MockMvc

## Files Likely Affected

- src/main/java/com/example/controller/AuthController.java
- src/main/java/com/example/service/AuthService.java
- src/main/java/com/example/service/JwtService.java
- src/main/java/com/example/repository/UserRepository.java
- src/main/java/com/example/dto/LoginRequest.java
- src/main/java/com/example/dto/LoginResponse.java

## Notes

This is the first spec in the AUTH-100 feature set.
Related specs: spec-logout.md, spec-token-refresh.md

Follow Controller → Service → Repository pattern.
Use Spring Security for password verification.
JWT tokens should expire after 24 hours.
