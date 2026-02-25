# FEATURE: Health Check Endpoint

## Type
feature

## Priority
medium

## Context
We need a health check endpoint for monitoring and load balancer integration. The endpoint should return the application's health status and basic system information.

## Acceptance Criteria
- GET /api/v1/admin/health returns HTTP 200 when application is healthy
- Response includes: status, timestamp, application version, Java version
- Response format: JSON
- Endpoint does NOT require authentication (public for monitoring)
- Add unit tests using MockMvc
- Follow Spring Boot best practices

## Files Likely Affected
- src/main/java/com/example/controller/AdminController.java
- src/main/java/com/example/model/dto/HealthResponse.java
- src/test/java/com/example/controller/AdminControllerTest.java

## Notes
This is a simple endpoint. Keep it lightweight - no database calls or heavy processing.
Reference the java.md practices file for coding standards.

## Expected Response Example
```json
{
  "status": "UP",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "javaVersion": "17.0.5"
}
```
