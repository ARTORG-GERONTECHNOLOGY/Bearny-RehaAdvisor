# docker-django-react

## Project

template: https://github.com/cglusky/docker-django-react/tree/master

## Basics

Local dev full stack using docker-compose with Django backend and React frontend; all served behind NGINX.

## Main Frameworks/Libraries/Packages

Please see requirements.txt and package.json for full details.

Django

- Docker ubuntu:22.04
- Django v5
- Django Rest Framework
- Django Rest Framework Simple JWT
- PyTest

### Notes

- One app created/installed called core

React

- Docker ubuntu:22.04
- Create React App
- Node dev server via Docker ubuntu image
- Hot reload

MongoDB

- Docker mongo:8.0.3

Ngnix

- Docker nginx:stable-alpine
- Serves Django's static and media files as well.  See conf for details.

### Useful Commands

Build containers. Add -up flag to bring services up after build.

```sh

$> docker compose build

```

Bring containers up. Add -d flag to run output detached from current shell.

```sh

$> docker compose up

```

Bring containers down. Add -v flag to also delete named volumes

```sh

$> docker compose down

```

View logs by service name.

```sh

$> docker compose logs <service-name>

```

Enter shell for specified container (must be running)

```sh

$> docker exec -it <container-name> sh

```

### Containers, Services and Ports

| Container  | Service | Host Port | Docker Port |
|------------|---------|-----------|-------------|
| dev-django | django  | 8001      | 8000        |
| dev-react  | react   | 3001      | 3000        |
| dev-db     | db      | 27017     | 27017       |
| dev-nginx  | nginx   | 8080      | 80          |

### Why NGINX for local dev?

Cross-Origin Resource Sharing(CORS) issues will make your browser sad when you serve your site from different ports as we do with this architecture. Using NGINX to proxy requests/responses to/from the correct container/service/ports helps make your browser happy. And it simulates real world infrastructure as a bonus. So...

Please make all requests from your browser through <http://localhost:8080> and NGINX will happily redirect the request and proxy all your services so your browser thinks it's all one and the same protocol/domain/port == CORS bliss.

### Can this be used for production?

Not yet. Later a new docker compose and docker files will be added to also support production.
