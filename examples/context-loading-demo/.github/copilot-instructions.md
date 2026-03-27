# GitHub Copilot Instructions

## Spring Boot Development

### RESTful API Design
- Use proper HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Return appropriate status codes (200, 201, 204, 400, 404, 409, 500)
- Use plural nouns for endpoints (/users, not /user)
- Version APIs in URL: /api/v1/users

### Request/Response Handling
- Include error handling for all endpoints
- Use @Valid annotation for request validation
- Return consistent error response format
- Include timestamp, status, message, and path in error responses

### Security Best Practices
- Never log sensitive data (passwords, tokens, credit cards)
- Use BCrypt for password hashing
- Validate and sanitize all user inputs
- Implement rate limiting for public endpoints

### Database Operations
- Use transactions for multi-step operations
- Handle unique constraint violations gracefully
- Use database migrations (Flyway or Liquibase)
- Never expose raw SQL errors to API clients

### Testing Requirements
- Unit tests for service layer (business logic)
- Integration tests for repositories
- MockMvc tests for controllers (API contracts)
- Test both success and error scenarios

### Logging Standards
- Log method entry/exit for service layer (DEBUG level)
- Log errors with stack traces (ERROR level)
- Log important business events (INFO level)
- Include correlation IDs for request tracing

### Code Comments
- Explain complex business logic
- Document assumptions and constraints
- Include TODO comments for future improvements
- Reference related Jira tickets in comments

---

**GitHub Copilot Configuration** - These instructions help Copilot generate code that follows our standards.
