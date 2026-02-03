# agent deployment guide

step-by-step instructions for deploying runeforge canvas on a VPS or local machine. designed for AI agents to follow.

## prerequisites

before starting, verify these are available:

```bash
# check python version (need 3.11+)
python3 --version

# check node/npm
node --version
npm --version

# check claude code is installed and authenticated
claude --version
```

if claude code is not installed:
```bash
npm install -g @anthropic-ai/claude-code
claude  # follow auth prompts
```

## step 1: clone repository

```bash
cd ~
git clone https://github.com/jordanrubin/ft-ui.git
cd ft-ui
```

## step 2: install python dependencies

```bash
# create virtual environment
python3 -m venv .venv

# install with web dependencies
.venv/bin/pip install -e ".[web]"
```

verify installation:
```bash
.venv/bin/runeforge-api --help
```

## step 3: install frontend dependencies

```bash
cd web
npm install
cd ..
```

## step 4: start servers

option A - use the start script:
```bash
./scripts/start-servers.sh
```

option B - start manually (two terminals):
```bash
# terminal 1: API server
.venv/bin/runeforge-api

# terminal 2: frontend
cd web && npm run dev
```

option C - background with nohup:
```bash
nohup .venv/bin/runeforge-api > /tmp/runeforge-api.log 2>&1 &
cd web && nohup npm run dev > /tmp/runeforge-web.log 2>&1 &
```

## step 5: verify

```bash
# check API
curl http://localhost:8000/health

# check frontend
curl -s http://localhost:3000 | head -5
```

access in browser: `http://localhost:3000`

## step 6: optional - nginx reverse proxy with auth

for production/VPS deployment with basic auth:

```bash
# install nginx
sudo apt install nginx apache2-utils

# create password file
sudo htpasswd -c /etc/nginx/.htpasswd-runeforge <username>
```

create `/etc/nginx/sites-available/runeforge-canvas`:
```nginx
server {
    listen 3080;
    server_name _;

    auth_basic "Runeforge Canvas";
    auth_basic_user_file /etc/nginx/.htpasswd-runeforge;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
    }
}
```

enable and start:
```bash
sudo ln -sf /etc/nginx/sites-available/runeforge-canvas /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## step 7: optional - runeforge skills

runeforge canvas uses skill files from a sibling directory. for basic functionality, the bundled public skills work. for extended skills:

```bash
# clone runeforge skills repo (if you have access)
cd ~/projects  # or wherever ft-ui is
git clone https://github.com/jordanrubin/runeforge.git
```

or set environment variable:
```bash
export RUNEFORGE_SKILLS_DIR=/path/to/your/skills
```

## stopping servers

```bash
pkill -f 'runeforge-api|vite'
```

or use the script:
```bash
./scripts/stop-servers.sh
```

## troubleshooting

### API won't start
```bash
# check logs
cat /tmp/runeforge-api.log

# common fix: port in use
lsof -i :8000
kill <pid>
```

### frontend won't start
```bash
# check logs
cat /tmp/runeforge-web.log

# common fix: reinstall node modules
cd web && rm -rf node_modules && npm install
```

### skills not loading
```bash
# check skills directory exists
ls -la ../runeforge/public/

# or set explicitly
export RUNEFORGE_SKILLS_DIR=/path/to/skills
```

### claude API errors
```bash
# verify claude code auth
claude --version
claude "hello"  # should respond without auth errors
```

### hooks interference
runeforge canvas uses pure text generation with no tool calls. it explicitly disables all tools when connecting to the API, so tool-use hooks (Bash, file operations, etc.) should not fire.

if you still see permission issues, check your claude code hooks:
```bash
cat ~/.claude/settings.json | grep -A 20 hooks
```

runeforge only needs the ability to send prompts and receive text responses - no file access, no bash, no MCP servers.

## ports summary

| service | port | purpose |
|---------|------|---------|
| API | 8000 | FastAPI backend |
| Frontend | 3000 | React dev server |
| nginx (optional) | 3080 | reverse proxy with auth |

## quick reference

```bash
# full deploy from scratch
git clone https://github.com/jordanrubin/ft-ui.git && cd ft-ui
python3 -m venv .venv && .venv/bin/pip install -e ".[web]"
cd web && npm install && cd ..
./scripts/start-servers.sh
```
