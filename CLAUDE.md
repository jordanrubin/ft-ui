# ft-ui Project Instructions

## Bug Fixing Process

**MANDATORY**: When fixing any bug or adding any feature:

1. **Write a test FIRST** that demonstrates the expected behavior
2. For bugs: test should fail before fix, pass after
3. For features: test should verify the new functionality
4. Run `pytest` to verify tests pass before committing

Never skip tests. If you catch yourself fixing something without a test, stop and write the test first.

## Project Structure

- `src/runeforge_canvas/` - Python backend
  - `core/` - models, skills, client
  - `api/` - FastAPI server
  - `tui/` - Textual TUI (alternative frontend)
- `web/` - React frontend (Vite)
  - `src/components/` - React components
  - `src/api/` - API client
  - `src/types/` - TypeScript types

## Running

```bash
# Start both servers
./scripts/start-servers.sh

# Or manually:
cd /home/jr/projects/ft-ui
source .venv/bin/activate
python -m runeforge_canvas.api.server  # API on :8000

cd web
npm run dev  # Vite on :3000
```

Access via nginx at **:3080** (auth: jr / runeforge2024)

## Testing

```bash
# Python tests
pytest

# TypeScript checks
cd web && npx tsc --noEmit
```

## Key Features

- **Canvas** - graph-based thinking, not linear chat
- **Skills** - runeforge operations (@excavate, @antithesize, etc.)
- **Plan synthesis** - collapse exploratory branches into Claude Code plan
- **Auto-save** - all mutations persist to disk
