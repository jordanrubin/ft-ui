# future tokenizer server setup

## quick start

```bash
# start both servers
./scripts/start-servers.sh

# stop both servers
./scripts/stop-servers.sh
```

## access

| endpoint | url | auth |
|----------|-----|------|
| nginx (production) | http://154.53.35.193:3080 | basic auth |
| react direct | http://localhost:3000 | none |
| api direct | http://localhost:8000 | none |

**nginx credentials:** `jr` / (see /etc/nginx/.htpasswd-runeforge)

## manual setup

### 1. install dependencies

```bash
# python
python -m venv .venv
.venv/bin/pip install -e ".[web]"

# node
cd web && npm install
```

### 2. start servers

```bash
# terminal 1: API
.venv/bin/ft-api --mock

# terminal 2: React
cd web && npm run dev
```

### 3. nginx config (optional, for auth)

config at `/etc/nginx/sites-available/future-tokenizer`:

```nginx
server {
    listen 3080;
    server_name _;

    auth_basic "Future Tokenizer";
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

create password file:
```bash
sudo htpasswd -c /etc/nginx/.htpasswd-runeforge jr
```

enable and reload:
```bash
sudo ln -sf /etc/nginx/sites-available/future-tokenizer /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## architecture

```
browser
   |
   v
nginx (:3080) -- basic auth
   |
   +-- / ---------> vite dev server (:3000) --> React app
   |
   +-- /api/* ----> FastAPI (:8000) --> Claude API
```

## flags

```bash
# API server
ft-api --mock          # use mock client (no real API calls)
ft-api                 # use real Claude API
ft-api --port 9000     # custom port

# TUI (alternative to web)
future-tokenizer --mock       # terminal UI
```
