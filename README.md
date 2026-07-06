# Link Tracker

Wrap any URL with a consent-based landing page that captures the visitor's **device info**, **browser/OS**, **IP address**, and optionally their **GPS location** — then redirects them to the original destination. View everything through a password-protected admin dashboard.

---

## How it works

1. You create a "wrapped link" in the admin dashboard (e.g. `https://yoursite.com/l/mylink`)
2. You share that link instead of the real URL
3. When someone clicks it, they see a consent page explaining what data is collected
4. They can choose:
   - **Allow location & continue** → browser prompts for GPS permission, data is saved, redirect happens
   - **Continue without location** → only device/browser data is saved, redirect happens
5. You view all visits in the admin dashboard, including GPS coordinates linked to Google Maps

---

## Requirements

- **Node.js v22.5 or newer** (uses the built-in `node:sqlite` module — no native compilation needed)
- No external database required

---

## Setup

### 1. Clone / copy the project

```bash
git clone <your-repo> link-tracker
cd link-tracker
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
ADMIN_PASSWORD=choose_a_strong_password
SESSION_SECRET=a_long_random_string_at_least_32_chars
BASE_URL=https://your-deployed-domain.com
ENABLE_IP_FALLBACK=true
```

- `ADMIN_PASSWORD` — the password you'll use to log into `/admin`
- `SESSION_SECRET` — any long random string; used to sign session cookies
- `BASE_URL` — your public URL, used to generate shareable link previews in the dashboard
- `ENABLE_IP_FALLBACK` — when `true`, if a visitor denies GPS permission the app tries to get a rough location from their IP address (city-level accuracy, uses the free [ip-api.com](http://ip-api.com) service). Set to `false` to disable.

### 4. Run

```bash
npm start
```

Open `http://localhost:3000/admin` in your browser.

---

## Deployment

### Render (recommended — free tier available)

1. Push the project to a GitHub repository
2. Go to [render.com](https://render.com) → New → Web Service → connect your repo
3. Set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Node version:** 22 or later (set in Environment → `NODE_VERSION=22`)
4. Add environment variables (`ADMIN_PASSWORD`, `SESSION_SECRET`, `BASE_URL`, etc.) under the Environment tab
5. Deploy — Render assigns you a `.onrender.com` URL; set that as your `BASE_URL`

> ⚠️ Render's free tier spins down after inactivity, which means the SQLite file may be lost on restart unless you use a **persistent disk** (paid feature). For production use, attach a 1 GB persistent disk mounted at `/data` and change your `.env` to point `data/` there, or migrate to a hosted database.

### Railway

1. Push to GitHub, connect to [railway.app](https://railway.app)
2. Add env vars in the Variables tab
3. Railway auto-detects Node and runs `npm start`
4. For persistent storage, add a volume mounted at `/app/data`

### Self-hosted (VPS / Linux)

```bash
# Install Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and configure
git clone <repo> /srv/link-tracker
cd /srv/link-tracker
npm install
cp .env.example .env
nano .env   # fill in your values

# Run with PM2 for auto-restart
npm install -g pm2
pm2 start server.js --name link-tracker
pm2 save
pm2 startup
```

Then point Nginx at port 3000:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
    }
}
```

Run `certbot --nginx` for HTTPS (strongly recommended — browsers block location requests on non-HTTPS pages).

---

## Project structure

```
link-tracker/
├── server.js          # Express app entry point
├── db.js              # SQLite schema and connection
├── routes/
│   ├── admin.js       # Admin dashboard routes (auth-protected)
│   └── visit.js       # Consent page + visit-capture API
├── middleware/
│   └── auth.js        # Session auth check
├── views/
│   ├── consent.ejs    # Landing page shown to visitors
│   ├── login.ejs      # Admin login
│   ├── dashboard.ejs  # Link list
│   └── link-detail.ejs# Per-link visit table
├── public/
│   └── style.css      # Shared styles
├── data/              # Auto-created — holds app.db
├── .env.example
└── package.json
```

---

## Admin routes

| Route | Description |
|---|---|
| `GET /admin` | Dashboard — lists all wrapped links |
| `GET /admin/login` | Login form |
| `POST /admin/login` | Submit password |
| `POST /admin/logout` | Log out |
| `POST /admin/links` | Create a new wrapped link |
| `GET /admin/links/:id` | View all visits for a link |
| `POST /admin/links/:id/delete` | Delete a link and all its visit data |

## Public routes

| Route | Description |
|---|---|
| `GET /l/:slug` | Consent landing page shown to visitors |
| `POST /api/visit/:slug` | Records the visit; returns `{ redirect: "..." }` |

---

## Data collected per visit

| Field | How |
|---|---|
| IP address | From request headers (respects `X-Forwarded-For`) |
| Browser name + version | Parsed from User-Agent |
| Operating system | Parsed from User-Agent |
| Device type | `mobile`, `tablet`, or `desktop` |
| GPS latitude/longitude | Via browser Geolocation API (only if user consents) |
| GPS accuracy | In metres |
| Location source | `gps` / `ip` (fallback) / `denied` |
| Consent given | Boolean |
| Timestamp | UTC |

---

## Notes

- HTTPS is **required** for the browser Geolocation API to work. On HTTP (e.g. `localhost`) the browser will silently refuse to return GPS coordinates.
- The IP geolocation fallback uses [ip-api.com](http://ip-api.com) (free, ~45 req/min, city-level accuracy). No API key needed.
- All data is stored locally in `data/app.db` (SQLite). No third-party services receive your visit data.
