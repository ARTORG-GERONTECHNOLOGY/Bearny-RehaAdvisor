# Contributing Guidelines

## Welcome!

Thank you for your interest in contributing to RehaAdvisor! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read and adhere to our Code of Conduct:

- Be respectful and inclusive
- Welcome diverse perspectives
- Provide constructive criticism
- Report inappropriate behavior using the process in [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)

Quick onboarding path:
- [First Contribution Quickstart](./CONTRIBUTING_QUICKSTART.md)
- [Testing Hub](./TESTING.md)
- [Security Policy](../SECURITY.md)

## Getting Started

### Prerequisites

- Familiarity with Git and GitHub
- Understanding of Python/Django or React/TypeScript
- Development environment set up (see [Getting Started](./01-GETTING_STARTED.md))

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
```bash
git clone https://github.com/your-username/RehaAdvisor.git
cd RehaAdvisor
```

3. Add upstream remote:
```bash
git remote add upstream https://github.com/ARTORG-GERONTECHNOLOGY/RehaAdvisor.git
```

## Development Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
# Update main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
```

Branch naming conventions:
- `feature/description` - New features
- `bugfix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions

### 2. Make Changes

Follow the project's coding standards:

#### Frontend (React/TypeScript)

```bash
cd frontend
npm install  # Install dependencies if needed
```

**Code style**:
- Use TypeScript for type safety
- Follow React best practices
- Components in PascalCase, files in kebab-case
- Use functional components with hooks
- Add JSDoc comments for complex logic

Example component:
```typescript
/**
 * Button component for user interactions
 * @param label - Button label text
 * @param onClick - Click handler function
 * @param disabled - Whether button is disabled
 */
export const Button: React.FC<ButtonProps> = ({ label, onClick, disabled }) => {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
};
```

#### Backend (Python/Django)

```bash
cd backend
pip install -r requirements.txt  # Install dependencies
```

**Code style**:
- Follow PEP 8
- Use type hints
- Write docstrings for functions and classes
- Keep functions focused and small
- Use meaningful variable names

Example function:
```python
def create_therapy_session(
    patient_id: str,
    therapist_id: str,
    session_date: datetime
) -> TherapySession:
    """
    Create a new therapy session for a patient.
    
    Args:
        patient_id: Unique patient identifier
        therapist_id: Unique therapist identifier
        session_date: Scheduled date and time
        
    Returns:
        Created TherapySession object
        
    Raises:
        PatientNotFound: If patient doesn't exist
        TherapistNotFound: If therapist doesn't exist
    """
    patient = Patient.objects.get(id=patient_id)
    therapist = CustomUser.objects.get(id=therapist_id)
    
    session = TherapySession.objects.create(
        patient=patient,
        therapist=therapist,
        scheduled_date=session_date
    )
    return session
```

### 3. Write Tests

All contributions should include tests:

#### Frontend Tests

```typescript
// __tests__/components/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../../components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', () => {
    const mockClick = jest.fn();
    render(<MyComponent onClick={mockClick} />);
    screen.getByRole('button').click();
    expect(mockClick).toHaveBeenCalled();
  });
});
```

#### Backend Tests

```python
# tests/test_models.py
import pytest
from core.models import Patient

@pytest.mark.django_db
def test_create_patient():
    """Test patient creation."""
    patient = Patient.objects.create(
        first_name="John",
        email="john@example.com"
    )
    assert patient.first_name == "John"
    assert Patient.objects.filter(email="john@example.com").exists()
```

Run tests:
```bash
# Frontend
npm test

# Backend
pytest

# With coverage
pytest --cov=api --cov=core
```

### 4. Commit Your Changes

Write clear, descriptive commit messages:

```bash
git add .
git commit -m "feature: Add patient therapy assignment

- Implement new therapy assignment endpoint
- Add corresponding tests
- Update API documentation"
```

Commit message format:
```
<type>: <subject>

<body>

<footer>
```

Types: `feature`, `bugfix`, `docs`, `refactor`, `test`, `chore`

### 5. Push and Create Pull Request

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create pull request on GitHub
```

## Pull Request Guidelines

### PR Title and Description

**Title**: Clear, concise description
- ✅ "Add patient therapy assignment feature"
- ❌ "Fix stuff"

**Description** should include:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issue
Fixes #123

## Changes Made
- Change 1
- Change 2

## Testing
- How to test these changes
- List of test cases

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No new warnings generated
```

### Review Process

1. **Automated Checks**:
   - Code passes linting
   - All tests pass
   - Coverage maintained or improved
   - No security issues

2. **Code Review**:
   - At least one maintainer review
   - Feedback addressed
   - Approval granted

3. **Merge**:
   - Branch squashed and merged
   - Related issues closed

## Code Standards

### Frontend (React/TypeScript)

```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint -- --fix

# Format code
npm run format

# Run tests
npm test

# Generate coverage
npm test -- --coverage
```

### Backend (Python)

```bash
# Linting
flake8 api/ core/ tests/
pylint api/ core/ tests/

# Type checking
mypy api/ core/

# Formatting
black api/ core/ tests/

# Tests
pytest
pytest --cov=api --cov=core
```

### Git Hooks (Optional)

Use pre-commit hooks to auto-check before committing:

```bash
pip install pre-commit
pre-commit install
```

## Documentation

### Update Documentation When:

- Adding new features
- Changing API endpoints
- Modifying configuration
- Adding new dependencies
- Fixing known issues

### Documentation Format

Follow existing documentation style:
- Use clear, concise language
- Include code examples
- Link to related documentation
- Update table of contents if needed

## Reporting Issues

### Bug Report Template

```markdown
## Description
Clear description of the bug

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: Ubuntu 22.04
- Docker version: 20.10
- Browser: Chrome 120

## Screenshots
If applicable, add screenshots
```

### Feature Request Template

```markdown
## Description
Clear description of the feature

## Use Case
Why this feature is needed

## Proposed Solution
How this could be implemented

## Alternatives Considered
Other approaches

## Additional Context
Any other information
```

## Development Tools

### Useful Commands

```bash
# Frontend
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # Lint code
npm test             # Run tests
npm run format       # Format code

# Backend
python manage.py runserver      # Dev server
python manage.py migrate        # Apply migrations
python manage.py createsuperuser # Create admin
pytest                          # Run tests
black api/                      # Format code

# Docker
make build_dev      # Build dev containers
make dev_up         # Start dev environment
make dev_logs       # View logs
make dev_down       # Stop dev environment
```

### Debugging

**Frontend**:
- Browser DevTools (F12)
- React Developer Tools extension
- Redux DevTools (if using Redux)

**Backend**:
- Django Debug Toolbar
- Python pdb debugger:
```python
import pdb; pdb.set_trace()
```

## Code Review Checklist

When reviewing code, check:

- [ ] Code follows style guidelines
- [ ] Variables and functions have meaningful names
- [ ] Comments explain complex logic
- [ ] Tests cover new functionality
- [ ] No unnecessary dependencies
- [ ] Performance is acceptable
- [ ] Security best practices followed
- [ ] Documentation is updated
- [ ] Backward compatibility maintained

## Release Process

### Version Numbering

Uses semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Release Checklist

- [ ] All tests passing
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] Version number bumped
- [ ] Git tag created
- [ ] Release notes written

## Community

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **Pull Request Comments**: Design and implementation feedback during review
- **GitHub Discussions**: Questions and general discussion (if enabled for this repository)
- **Security Reports**: Follow [../SECURITY.md](../SECURITY.md) for private disclosure

### Getting Help

1. Check existing documentation
2. Search GitHub issues
3. Open or join a PR discussion for implementation-specific help
4. Ask in GitHub Discussions if available

## Recognition

Contributors will be:
- Added to CONTRIBUTORS.md
- Mentioned in release notes
- Given credit for significant contributions

## Legal

By contributing to RehaAdvisor, you agree that:
- Your contributions are licensed under the project's license
- You have the right to contribute the code
- You grant the project permission to use your contributions

## Questions?

Feel free to:
- Open a GitHub issue
- Start with [First Contribution Quickstart](./CONTRIBUTING_QUICKSTART.md)
- Check existing documentation

## Thank You!

We appreciate your contributions to making RehaAdvisor better!

---

**Quick Links**:
- [First Contribution Quickstart](./CONTRIBUTING_QUICKSTART.md)
- [Code of Conduct](../CODE_OF_CONDUCT.md)
- [Security Policy](../SECURITY.md)
- [Contributors](../CONTRIBUTORS.md)
- [Project Changelog](../CHANGELOG.md)
- [License](../LICENSE)
- [Architecture](./02-ARCHITECTURE.md)
- [Backend Guide](./04-BACKEND_GUIDE.md)
- [Frontend Guide](./03-FRONTEND_GUIDE.md)
