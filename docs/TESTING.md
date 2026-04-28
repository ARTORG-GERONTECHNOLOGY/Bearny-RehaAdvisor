# Testing Documentation Hub

This is the canonical entry point for all testing documentation.

## Quick Start

```bash
# All tests
make dev_test

# Backend
cd backend && pytest

# Frontend
cd frontend && npm test
```

## Choose The Right Guide

- `docs/testing/MASTER_TESTING_GUIDE.md`: high-level testing workflow and common commands
- `docs/testing/BACKEND_TEST_DOCUMENTATION.md`: backend pytest conventions and scenarios
- `docs/testing/FRONTEND_TEST_DOCUMENTATION.md`: frontend Jest/RTL conventions and scenarios
- `docs/testing/FRONTEND_E2E_TEST_DOCUMENTATION.md`: Playwright end-to-end setup and flows
- `docs/testing/CICD_TESTING_GUIDE.md`: CI pipeline behavior and failure troubleshooting

## In-Tree Test Docs

Detailed test documentation also exists close to tests for feature-level context:

- `backend/tests/**/TESTING.md`
- `frontend/src/__tests__/**/TESTING.md`

Use those files for local behavior and edge cases; use this hub for navigation.

## Legacy Index Files

The following files remain for backward compatibility, but this page is the source of truth:

- `docs/testing/TESTING_DOCUMENTATION_INDEX.md`
- `docs/INDEX_TESTING.md`
- `docs/README_TESTING.md`
