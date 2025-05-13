# docker-django-react

## Project

original template: https://github.com/cglusky/docker-django-react/tree/master (modified heavily by Noora)

## Basics

Full stack using docker-compose with Django backend and React (Vite) frontend; all served behind NGINX with MongoDB Database.

## Main Frameworks/Libraries/Packages

Please see requirements.txt and package.json for full details.

Django

- Docker ubuntu:22.04
- Django v5
- Django Rest Framework
- Django Rest Framework Simple JWT
- PyTest

### Notes

- One backend app created/installed called core

React

- Docker ubuntu:22.04
- Vite
- Hot reload (for dev)

MongoDB

- Docker mongo:8.0.3

Ngnix

- Docker nginx:stable-alpine
- Serves Django's static and media files as well.  See conf for details.

### Useful Commands

Build containers. Add -up flag to bring services up after build.

```sh

$> docker compose -f docker-compose.dev.yml build --no-cache
or
$> docker compose -f docker-compose.prod.yml build --no-cache

```

Bring containers up. Add -d flag to run output detached from current shell.

```sh

$> docker compose -f docker-compose.dev.yml up -d
or
$> docker compose -f docker-compose.prod.yml up -d
```

Bring containers down. Add -v flag to also delete named volumes

```sh

$>  docker compose -f docker-compose.dev.yml down --volumes --remove-orphans
$>  docker compose -f docker-compose.prod.yml down --volumes --remove-orphans

```

View logs by service name.

```sh

$> docker compose logs <service-name>

```

Enter shell for specified container (must be running)

```sh

$> docker exec -it <container-name> sh

```

See all logs and container details.
```sh

$> lazydocker

```
### Containers, Services and Ports

| Container  | Service | Host Port | Docker Port |
|------------|---------|-----------|-------------|
|[dev-]django| django  | 8001      | 8000        |
|[dev-]react | react   | 3001      | 3000        |
|[dev-]db    | db      | 27017     | 27017       |
|[dev-]nginx | nginx   | 8080 443  | 80  443     |

