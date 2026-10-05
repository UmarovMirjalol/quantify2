.PHONY: help build up down logs smoke test deploy restart ps

help:
	@echo "QuantLLM make targets:"
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
	docker compose build

up:
	docker compose up -d

down:
	bash deploy/scripts/down.sh

purge:
	bash deploy/scripts/down.sh --purge

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

smoke:
	bash deploy/scripts/smoke.sh

test:
	cd backend && PYTHONPATH=. pytest -q

restart:
	docker compose restart
