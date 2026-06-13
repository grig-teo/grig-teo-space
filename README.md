# grig-teo portfolio

Personal developer portfolio — Next.js frontend + NestJS backend.

**Domain:** [grig-teo.space](https://grig-teo.space)

## Stack

- **Frontend:** Next.js 15, Tailwind CSS, next-intl (EN / RU / RO)
- **Backend:** NestJS 11 REST API
- **Deploy:** Docker Compose + Nginx + Let's Encrypt

## Run locally

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- CV download: http://localhost:3001/api/cv

## Deploy to VPS

DNS must point to your server before HTTPS setup:

```
A     grig-teo.space      -> <your-server-ip>
A     www.grig-teo.space  -> <your-server-ip>
```

Production uses **host nginx** on the VPS (ports 80/443 are shared with other projects).

SSH alias from `~/.ssh/config`:

```bash
ssh vecin2vecin-vps
```

From your machine:

```bash
chmod +x deploy/deploy.sh deploy/init-ssl.sh
./deploy/deploy.sh
./deploy/init-ssl.sh
```

Production compose file: `docker-compose.prod.yml`  
Environment: `.env.production`

Manual deploy on the server:

```bash
ssh vecin2vecin-vps
cd /opt/grig-teo-space
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## Development without Docker

```bash
# Backend
cd backend && npm install && npm run build && npm start

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```
