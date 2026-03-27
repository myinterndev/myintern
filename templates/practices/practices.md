# Java

> **Instructions:** Edit the rules below to match your project standards. MyIntern will follow these rules exactly.

---

## Versions & Dependencies

1. Java version: 21 (use latest LTS features)
2. Spring Boot version: 3.4.x (always use latest stable)
3. Dependency management: Use latest stable versions from Maven Central
4. When adding dependencies: Always prefer latest non-SNAPSHOT versions
5. Update strategy: Check for updates before adding new features

---

## Architecture & Structure

1. Follow Controller → Service → Repository pattern (3-tier architecture)
2. Controllers handle HTTP only, no business logic
3. Services contain business logic and transactions
4. Use constructor injection, not `@Autowired` field injection
5. Apply `@Transactional` on service methods only

---

## Naming Conventions

1. Package names: lowercase only (`com.example.service`)
2. Classes: PascalCase (`UserService`, `OrderController`)
3. Methods/variables: camelCase (`findUserById`, `emailAddress`)
4. Constants: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)

---

## Lombok

1. Enabled: YES
2. Allowed annotations: `@Data`, `@Getter`, `@Setter`, `@Slf4j`, `@RequiredArgsConstructor`
3. Forbidden: `@AllArgsConstructor`, `@Builder`

---

## DTOs

1. Use Java Records for immutable DTOs
2. Apply Bean Validation: `@NotNull`, `@Email`, `@Size`
3. Use `@Valid` in controller methods

---

## Error Handling

1. Custom exceptions extend `RuntimeException`
2. Use `@RestControllerAdvice` for global exception handling
3. HTTP status codes:
   - 400 Bad Request (validation)
   - 404 Not Found (missing resource)
   - 409 Conflict (duplicate)
   - 500 Internal Server Error

---

## Security

1. Passwords: Always use BCrypt via `PasswordEncoder`
2. Secrets: Use `${ENV_VAR}` in `application.yml`, never hardcode
3. Never log passwords, tokens, or API keys

---

## Database

1. Entities: Use `@Entity`, `@Table`, `@Id`
2. Relationships: Lazy loading by default
3. Migrations: Use Flyway (never `ddl-auto: update` in production)
4. Avoid N+1 queries: Use `@EntityGraph` or `JOIN FETCH`

---

## Testing

1. Unit tests: JUnit 5 + Mockito
2. Integration tests: `@SpringBootTest` + `MockMvc`
3. Test structure: Arrange-Act-Assert (AAA)
4. Test naming: `methodName_Scenario_ExpectedOutcome`
5. Coverage target: 80%+ for services

---

## Configuration

1. Format: `application.yml` (preferred)
2. Externalize all credentials and URLs using `${ENV_VAR}`
3. Use Spring profiles for environment-specific configs

---

## API Standards

1. REST conventions: Standard HTTP verbs (GET, POST, PUT, DELETE)
2. Endpoint naming: Plural nouns (`/api/users`)
3. Response format: Return DTOs, not entities
4. Versioning: URL-based (`/api/v1/users`)

---

## Logging

1. Framework: SLF4J + Logback
2. Use `@Slf4j` from Lombok
3. Never log sensitive data (passwords, tokens, PII)
4. No `System.out.println` in production code

---

## Code Quality Rules

1. No hardcoded values (use `application.yml`)
2. No unused imports or variables
3. Exception handling required for external calls
4. All code must compile and pass tests before commit

---

## Spring Boot Version-Specific Rules

### Spring Boot 3.x (jakarta.*)

1. All Java EE imports use `jakarta.*` (NOT `javax.*`)
   - `jakarta.persistence.*` for JPA
   - `jakarta.validation.*` for Bean Validation
   - `jakarta.servlet.*` for Servlet API
2. Security: Use `SecurityFilterChain` bean (NOT `WebSecurityConfigurerAdapter` — removed in 3.x)
   ```java
   @Bean
   SecurityFilterChain filterChain(HttpSecurity http) throws Exception { ... }
   ```
3. Error responses: Use `ProblemDetail` (RFC 7807) for structured errors
4. HTTP clients: Prefer `@HttpExchange` declarative clients over `RestTemplate`
5. Observability: Use Micrometer Observation API (`@Observed`)
6. Java 17+ required (records, sealed classes, pattern matching encouraged)

### Spring Boot 2.x (javax.*)

1. All Java EE imports use `javax.*` (NOT `jakarta.*`)
   - `javax.persistence.*` for JPA
   - `javax.validation.*` for Bean Validation
   - `javax.servlet.*` for Servlet API
2. Security: Extend `WebSecurityConfigurerAdapter`
   ```java
   @Configuration
   public class SecurityConfig extends WebSecurityConfigurerAdapter { ... }
   ```
3. HTTP clients: Use `RestTemplate` (blocking) or `WebClient` (reactive)
4. Error handling: Use `@RestControllerAdvice` with `ResponseEntity`
