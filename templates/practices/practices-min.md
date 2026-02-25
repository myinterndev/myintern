# Java

1. Java 21, Spring Boot 3.4.x, always use latest stable dependencies from Maven Central
2. Follow Controller → Service → Repository pattern (3-tier architecture)
3. Controllers handle HTTP only, Services contain business logic, Repositories handle data access
4. Use constructor injection, not `@Autowired` field injection
5. Apply `@Transactional` on service methods only
6. Packages: lowercase (`com.example.service`), Classes: PascalCase (`UserService`), Methods/variables: camelCase (`findUserById`), Constants: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
7. Lombok enabled: `@Data`, `@Getter`, `@Setter`, `@Slf4j`, `@RequiredArgsConstructor` allowed, `@AllArgsConstructor` and `@Builder` forbidden
8. Use Java Records for immutable DTOs, apply Bean Validation (`@NotNull`, `@Email`, `@Size`), use `@Valid` in controllers
9. Custom exceptions extend `RuntimeException`, use `@RestControllerAdvice` for global handling
10. HTTP codes: 400 (validation), 404 (not found), 409 (conflict), 500 (server error)
11. Passwords: BCrypt via `PasswordEncoder`, Secrets: `${ENV_VAR}` in `application.yml`, never log passwords/tokens/keys
12. Entities: `@Entity`, `@Table`, `@Id`, lazy loading by default, use Flyway migrations
13. Avoid N+1 queries: use `@EntityGraph` or `JOIN FETCH`
14. Unit tests: JUnit 5 + Mockito, Integration: `@SpringBootTest` + `MockMvc`, AAA pattern, 80%+ coverage for services
15. Use `application.yml`, externalize credentials with `${ENV_VAR}`, use Spring profiles for environments
16. REST conventions: standard HTTP verbs, plural nouns (`/api/users`), return DTOs not entities, URL versioning (`/api/v1/users`)
17. SLF4J + Logback, use `@Slf4j` from Lombok, never log sensitive data, no `System.out.println`
18. No hardcoded values, no unused imports, exception handling for external calls, all code must compile and pass tests
