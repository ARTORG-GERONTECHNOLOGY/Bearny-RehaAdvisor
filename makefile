# Makefile

.PHONY: build up down logs restart

build:
	docker compose -f docker-compose.prod.yml build --no-cache

up:
	docker compose -f docker-compose.prod.yml up -d

down:
	docker compose -f docker-compose.prod.yml down

logs:
	docker compose logs -f

restart: down build up

build_dev:
	docker compose -f docker-compose.dev.yml build --no-cache

dev_up:
	docker compose -f docker-compose.dev.yml up -d

dev_down:
	docker compose -f docker-compose.dev.yml down

dev_logs:
	docker compose logs -f

dev_restart: down build up
