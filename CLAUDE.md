# ft-ui Project Instructions

## Bug Fixing Process

When encountering any bug (errors, crashes, functionality failures):

1. **Create a failing test** that replicates the bug
2. **Spawn parallel subagents** that each attempt different fix strategies
3. **Validate** the fix against the test
4. **Merge** the successful fix

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
