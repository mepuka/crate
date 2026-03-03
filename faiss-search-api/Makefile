UV ?= uv

.PHONY: sync test test-cov lint format format-check typecheck check smoke

sync:
	$(UV) sync --extra dev

test:
	$(UV) run --extra dev pytest -q

test-cov:
	$(UV) run --extra dev pytest --cov=app --cov-report=term-missing

lint:
	$(UV) run --extra dev ruff check app tests

format:
	$(UV) run --extra dev ruff format app tests

format-check:
	$(UV) run --extra dev ruff format --check app tests

typecheck:
	$(UV) run --extra dev mypy app

check:
	$(MAKE) lint
	$(MAKE) format-check
	$(MAKE) typecheck
	$(MAKE) test

smoke:
	$(UV) run python -m py_compile app/main.py app/routes/summary.py app/routes/embeddings.py app/services/search_service.py
