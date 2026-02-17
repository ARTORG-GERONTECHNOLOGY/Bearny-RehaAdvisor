# Makefile for RehaAdvisor

.PHONY: help build up down logs restart build_dev dev_up dev_down dev_logs dev_restart build_prod prod_up prod_down prod_logs prod_restart prod_health

help:
	@echo "RehaAdvisor Development and Production Commands"
	@echo "=============================================="
	@echo ""
	@echo "Development (Local):"
	@echo "  make build_dev         - Build development containers"
	@echo "  make dev_up            - Start development environment"
	@echo "  make dev_down          - Stop development environment"
	@echo "  make dev_logs          - View development logs"
	@echo "  make dev_restart       - Restart development environment"
	@echo ""
	@echo "Production (reha-advisor.ch):"
	@echo "  make build_prod        - Build production containers"
	@echo "  make prod_up           - Start production environment"
	@echo "  make prod_down         - Stop production environment"
	@echo "  make prod_logs         - View production logs"
	@echo "  make prod_restart      - Restart production environment"
	@echo "  make prod_health       - Check production health"
	@echo ""

# ===== DEVELOPMENT =====

build_dev:
	docker compose -f docker-compose.dev.yml build --no-cache

dev_up:
	docker compose -f docker-compose.dev.yml up -d
	@echo "Development environment started at http://localhost:3001"

dev_down:
	docker compose -f docker-compose.dev.yml down --volumes --remove-orphans

dev_logs:
	docker compose -f docker-compose.dev.yml logs -f

dev_restart: dev_down build_dev dev_up

# ===== PRODUCTION (Generic) =====

build:
	docker compose -f docker-compose.prod.yml build --no-cache

up:
	docker compose -f docker-compose.prod.yml up -d

down:
	docker compose -f docker-compose.prod.yml down

logs:
	docker compose logs -f

restart: down build up

# ===== PRODUCTION (reha-advisor.ch) =====

build_prod:
	docker compose -f docker-compose.prod.reha-advisor.yml build --no-cache

prod_up:
	docker compose -f docker-compose.prod.reha-advisor.yml up -d
	@echo "Production environment (reha-advisor.ch) started"

prod_down:
	docker compose -f docker-compose.prod.reha-advisor.yml down --volumes --remove-orphans

prod_logs:
	docker compose -f docker-compose.prod.reha-advisor.yml logs -f

prod_logs_django:
	docker compose -f docker-compose.prod.reha-advisor.yml logs -f django-prod

prod_logs_nginx:
	docker compose -f docker-compose.prod.reha-advisor.yml logs -f nginx-prod

prod_logs_celery:
	docker compose -f docker-compose.prod.reha-advisor.yml logs -f celery-prod

prod_restart: prod_down build_prod prod_up

prod_health:
	@echo "Checking production health..."
	@docker compose -f docker-compose.prod.reha-advisor.yml ps
	@echo ""
	@echo "Service health checks:"
	@docker exec django-prod curl -f http://localhost:8000/api/health/ 2>/dev/null && echo "✓ Django API: OK" || echo "✗ Django API: FAILED"
	@docker exec redis-prod redis-cli ping 2>/dev/null && echo "✓ Redis: OK" || echo "✗ Redis: FAILED"
	@docker exec db-prod mongosh --eval 'db.adminCommand("ping")' 2>/dev/null && echo "✓ MongoDB: OK" || echo "✗ MongoDB: FAILED"

# ===== UTILITY =====

prod_shell_django:
	docker exec -it django-prod bash

prod_shell_mongo:
	docker exec -it db-prod mongosh

prod_shell_redis:
	docker exec -it redis-prod redis-cli

dev_shell_django:
	docker exec -it django bash

dev_shell_mongo:
	docker exec -it db mongosh

# Cleanup
clean:
	docker compose -f docker-compose.dev.yml down -v
	docker compose -f docker-compose.prod.yml down -v
	docker compose -f docker-compose.prod.reha-advisor.yml down -v
	docker system prune -f

# Database migration for production
prod_migrate:
	docker exec django-prod python manage.py migrate

# Create superuser for production
prod_superuser:
	docker exec -it django-prod python manage.py createsuperuser

# Collect static files
prod_collectstatic:
	docker exec django-prod python manage.py collectstatic --noinput

# Backup production database
prod_backup:
	@echo "Creating MongoDB backup..."
	docker exec db-prod mongodump --archive=/data/db/backup_$(shell date +%Y%m%d_%H%M%S).archive
	@echo "Backup completed"
