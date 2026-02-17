# Copilot Instructions for RehaAdvisor

## Project Overview
This project is a web application designed for rehabilitation management, integrating various user roles such as therapists, researchers, and administrators. The architecture is based on a microservices approach, utilizing Docker containers for deployment.

## Architecture
- **Frontend**: Built with React and Vite, located in the `frontend` directory. It communicates with the backend via RESTful APIs.
- **Backend**: Developed using Django, located in the `backend` directory. It handles data management and business logic.
- **Database**: MongoDB is used for data storage, with configurations found in the `mongo` directory.
- **Nginx**: Acts as a reverse proxy, configured in the `nginx` directory.

## Developer Workflows
- **Building**: Use the Makefile for building containers:
  ```sh
  make build
  ```
- **Running**: Start the application in development mode:
  ```sh
  make dev_up
  ```
- **Testing**: Run tests using Jest for the frontend and pytest for the backend. Use the following commands:
  ```sh
  npm test  # For frontend
  pytest     # For backend
  ```

## Project Conventions
- **File Structure**: Follow the established directory structure for components, pages, and assets. Components are located in `frontend/src/components`, while pages are in `frontend/src/pages`.
- **State Management**: Utilize MobX for state management in the frontend. Observables and actions should be defined in the `stores` directory.
- **Localization**: Language files are stored in `frontend/src/assets/lang`, supporting multiple languages.

## Integration Points
- **API Communication**: The frontend communicates with the backend using Axios. Ensure to handle API responses and errors appropriately.
- **User Authentication**: Implemented using JWT. The authentication flow is managed in the `authStore`.

## External Dependencies
- **Frontend**: React, Vite, MobX, Axios, and i18next for localization.
- **Backend**: Django, Django REST Framework, and MongoDB.

## Cross-Component Communication
- Use props to pass data between components. For global state, utilize MobX stores.

## Example Patterns
- **Form Handling**: Forms are managed using controlled components. Validation is performed using regex patterns defined in the component.
- **Feedback Submission**: Feedback is submitted via a form that constructs a `FormData` object, which is then sent to the backend API.

## Conclusion
These instructions should help AI agents understand the structure and workflows of the RehaAdvisor project, enabling them to assist effectively in development tasks.