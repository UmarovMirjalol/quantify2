.PHONY: help build up down logs smoke test deploy restart ps

ENV_FILE ?= $(shell if [ -f .env.production ]; then echo .env.production; elif [ -f .env ]; then echo .env; else echo .env.production; fi)
COMPOSE = docker compose --env-file $(ENV_FILE)

help:
	@echo "Quantify make targets:"
	@echo "  make deploy   - build + start production stack"
	@echo "  make up       - start (no rebuild)"
	@echo "  make down     - stop containers"
	@echo "  make logs     - follow logs"
	@echo "  make smoke    - API smoke test"
	@echo "  make test     - run pytest"
	@echo "  make ps       - compose status"

deploy:
	bash deploy/scripts/deploy.sh

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

down:
	bash deploy/scripts/down.sh

purge:
	bash deploy/scripts/down.sh --purge

logs:
	$(COMPOSE) logs -f --tail=200

ps:
	$(COMPOSE) ps

smoke:
	@export APP_ACCESS_TOKEN=$$(grep '^APP_ACCESS_TOKEN=' $(ENV_FILE) 2>/dev/null | cut -d= -f2-); \
	bash deploy/scripts/smoke.sh http://127.0.0.1:$${APP_PORT:-80}

test:
	cd backend && PYTHONPATH=. pytest -q

restart:
	$(COMPOSE) restart
