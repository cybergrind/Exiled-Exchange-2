# Price sync and tests (guide/poe-source.html, D4 and WP-21).
# The scripts are TypeScript run by plain Node: Node 22.18+ (see MIN_NODE in ./run).

NODE ?= node
# make update-prices LEAGUE="HC Forbidden Rites"; default: the app's selected league
LEAGUE ?=

league_flag = $(if $(LEAGUE),--league "$(LEAGUE)")

.PHONY: update-prices validate-rolls test test-renderer test-run test-live

## Fetch prices now and write <apt-data>/market/<league>.json
update-prices:
	$(NODE) renderer/scripts/update-prices.ts $(league_flag)

## Check roll profiles (D7, WP-62); default research/uniques/*.json
## make validate-rolls FILES="research/uniques/svalinn.json"
validate-rolls:
	$(NODE) tools/validate-rolls.ts $(FILES)

## Default suites; no network
test: test-renderer test-run

test-renderer:
	cd renderer && npx vitest run

test-run:
	uv run --no-project --with pytest pytest -q tests/test_run.py

## Real network responses: shape and empty types. On demand only.
test-live:
	$(NODE) renderer/scripts/live-check.ts $(league_flag)
