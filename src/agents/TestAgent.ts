import * as fs from 'fs';
import * as path from 'path';
import { Agent } from '../core/Agent';
import { LanguageDetector, ProjectInfo } from '../core/LanguageDetector';
import chalk from 'chalk';

export interface TestFile {
  path: string;
  content: string;
  action: 'create' | 'modify';
}

export interface TestResult {
  success: boolean;
  testsGenerated: TestFile[];
  error?: string;
}

/**
 * Test Agent (Section 3: Agent Architecture)
 *
 * Responsibilities:
 * - Detect test framework (JUnit, Jest, pytest)
 * - Generate or update tests for changed code
 * - Report coverage delta
 */
export class TestAgent extends Agent {
  private detector: LanguageDetector;

  constructor(private repoPath: string = process.cwd()) {
    super('test-agent');
    this.detector = new LanguageDetector(repoPath);
  }

  async start(): Promise<void> {
    this.running = true;
    this.log('Test Agent started', 'info');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.log('Test Agent stopped', 'info');
  }

  /**
   * Generate tests for given source files
   */
  async generateTests(sourceFiles: string[], aiProvider: any): Promise<TestResult> {
    try {
      const projectInfo = this.detector.detectPrimary();
      const testFramework = this.detector.getTestFramework(projectInfo);

      console.log(chalk.blue('   🧪 Generating tests...'));
      console.log(chalk.gray(`      Framework: ${testFramework}`));

      const testsGenerated: TestFile[] = [];

      for (const sourceFile of sourceFiles) {
        const testFile = this.getTestFilePath(sourceFile, projectInfo);

        if (!testFile) {
          console.log(chalk.gray(`      Skipping ${sourceFile} (not a testable file)`));
          continue;
        }

        // Check if test already exists
        const testExists = fs.existsSync(path.join(this.repoPath, testFile));
        const action = testExists ? 'modify' : 'create';

        // Read source file
        const sourceContent = fs.readFileSync(
          path.join(this.repoPath, sourceFile),
          'utf-8'
        );

        // Read existing test if modifying
        let existingTest = '';
        if (testExists) {
          existingTest = fs.readFileSync(path.join(this.repoPath, testFile), 'utf-8');
        }

        // Generate test content using AI
        const testContent = await this.generateTestContent(
          sourceFile,
          sourceContent,
          existingTest,
          projectInfo,
          testFramework,
          aiProvider
        );

        testsGenerated.push({
          path: testFile,
          content: testContent,
          action
        });

        // Write test file
        const fullPath = path.join(this.repoPath, testFile);
        const dir = path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, testContent, 'utf-8');

        const actionText = action === 'create' ? '📝 Created' : '✏️  Updated';
        console.log(chalk.green(`      ${actionText}: ${testFile}`));
      }

      console.log(chalk.green(`   ✅ Generated ${testsGenerated.length} test files`));

      return {
        success: true,
        testsGenerated
      };
    } catch (error: any) {
      console.log(chalk.red(`   ❌ Test generation failed: ${error.message}`));
      return {
        success: false,
        testsGenerated: [],
        error: error.message
      };
    }
  }

  /**
   * Get test file path for source file
   */
  private getTestFilePath(sourceFile: string, projectInfo: ProjectInfo): string | null {
    switch (projectInfo.language) {
      case 'java':
        // src/main/java/com/example/Foo.java → src/test/java/com/example/FooTest.java
        if (sourceFile.includes('src/main/java/')) {
          return sourceFile
            .replace('src/main/java/', 'src/test/java/')
            .replace('.java', 'Test.java');
        }
        return null;

      case 'node':
        // src/utils/foo.ts → src/utils/foo.test.ts
        if (sourceFile.match(/\.(ts|js)$/)) {
          return sourceFile.replace(/\.(ts|js)$/, '.test.$1');
        }
        return null;

      case 'python':
        // myapp/utils.py → tests/test_utils.py
        if (sourceFile.endsWith('.py')) {
          const baseName = path.basename(sourceFile, '.py');
          return path.join('tests', `test_${baseName}.py`);
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * Generate test content using AI
   */
  private async generateTestContent(
    sourceFile: string,
    sourceContent: string,
    existingTest: string,
    projectInfo: ProjectInfo,
    testFramework: string,
    aiProvider: any
  ): Promise<string> {
    const prompt = this.buildTestPrompt(
      sourceFile,
      sourceContent,
      existingTest,
      projectInfo,
      testFramework
    );

    // Call AI provider to generate test
    const response = await aiProvider.generateTest(prompt);

    return response;
  }

  /**
   * Build prompt for test generation
   */
  private buildTestPrompt(
    sourceFile: string,
    sourceContent: string,
    existingTest: string,
    projectInfo: ProjectInfo,
    testFramework: string
  ): string {
    let prompt = `You are a test engineer writing ${testFramework} tests.\n\n`;

    prompt += `# Source File: ${sourceFile}\n\n`;
    prompt += '```\n' + sourceContent + '\n```\n\n';

    if (existingTest) {
      prompt += `# Existing Test (update/expand this):\n\n`;
      prompt += '```\n' + existingTest + '\n```\n\n';
    }

    prompt += `# Task\n\n`;
    prompt += `Write comprehensive ${testFramework} tests for the source file above.\n\n`;

    // Language-specific instructions
    switch (projectInfo.language) {
      case 'java':
        prompt += this.getJavaTestInstructions(projectInfo);
        break;
      case 'node':
        prompt += this.getNodeTestInstructions(projectInfo);
        break;
      case 'python':
        prompt += this.getPythonTestInstructions(projectInfo);
        break;
    }

    prompt += `\n## Output\n\n`;
    prompt += `Return ONLY the complete test file content. No explanations, no markdown code blocks.\n`;

    return prompt;
  }

  /**
   * Java/JUnit test instructions
   */
  private getJavaTestInstructions(projectInfo: ProjectInfo): string {
    return `
## Requirements

1. **Framework**: JUnit 5 + Mockito
2. **Coverage**: Test all public methods
3. **Naming**: Test class name should be <ClassName>Test
4. **Test naming**: Use descriptive names (e.g., shouldReturnUserWhenIdExists)
5. **Mocking**: Use @Mock and @InjectMocks for dependencies
6. **Assertions**: Use AssertJ or standard JUnit assertions
7. **Edge cases**: Test null inputs, empty lists, exceptions

## Example Structure

\`\`\`java
package com.example.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.Mock;
import org.mockito.InjectMocks;
import org.mockito.MockitoAnnotations;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class UserServiceTest {
    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    void shouldReturnUserWhenIdExists() {
        // Arrange
        User expectedUser = new User(1L, "John");
        when(userRepository.findById(1L)).thenReturn(Optional.of(expectedUser));

        // Act
        User result = userService.getUserById(1L);

        // Assert
        assertEquals(expectedUser, result);
        verify(userRepository).findById(1L);
    }
}
\`\`\`
`;
  }

  /**
   * Node/Jest test instructions
   */
  private getNodeTestInstructions(projectInfo: ProjectInfo): string {
    return `
## Requirements

1. **Framework**: Jest
2. **Coverage**: Test all exported functions/classes
3. **Naming**: Use descriptive test names
4. **Mocking**: Use jest.fn() and jest.mock() for dependencies
5. **Assertions**: Use expect() with Jest matchers
6. **Edge cases**: Test error handling, edge cases, async operations

## Example Structure

\`\`\`typescript
import { UserService } from './UserService';
import { UserRepository } from './UserRepository';

jest.mock('./UserRepository');

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    mockUserRepository = new UserRepository() as jest.Mocked<UserRepository>;
    userService = new UserService(mockUserRepository);
  });

  it('should return user when id exists', async () => {
    const expectedUser = { id: 1, name: 'John' };
    mockUserRepository.findById.mockResolvedValue(expectedUser);

    const result = await userService.getUserById(1);

    expect(result).toEqual(expectedUser);
    expect(mockUserRepository.findById).toHaveBeenCalledWith(1);
  });

  it('should throw error when user not found', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(userService.getUserById(999)).rejects.toThrow('User not found');
  });
});
\`\`\`
`;
  }

  /**
   * Python/pytest test instructions
   */
  private getPythonTestInstructions(projectInfo: ProjectInfo): string {
    return `
## Requirements

1. **Framework**: pytest
2. **Coverage**: Test all public functions/methods
3. **Naming**: Test functions start with test_
4. **Mocking**: Use unittest.mock or pytest-mock
5. **Assertions**: Use standard assert statements
6. **Fixtures**: Use pytest fixtures for setup

## Example Structure

\`\`\`python
import pytest
from unittest.mock import Mock, patch
from myapp.services import UserService
from myapp.models import User

@pytest.fixture
def user_repository():
    return Mock()

@pytest.fixture
def user_service(user_repository):
    return UserService(user_repository)

def test_get_user_by_id_returns_user_when_exists(user_service, user_repository):
    # Arrange
    expected_user = User(id=1, name='John')
    user_repository.find_by_id.return_value = expected_user

    # Act
    result = user_service.get_user_by_id(1)

    # Assert
    assert result == expected_user
    user_repository.find_by_id.assert_called_once_with(1)

def test_get_user_by_id_raises_error_when_not_found(user_service, user_repository):
    # Arrange
    user_repository.find_by_id.return_value = None

    # Act & Assert
    with pytest.raises(ValueError, match='User not found'):
        user_service.get_user_by_id(999)
\`\`\`
`;
  }
}
