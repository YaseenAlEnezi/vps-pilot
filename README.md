# vps-pilot

A setup wizard that runs on any VPS to configure projects, generate deploy scripts, `ecosystem.config.js`, and nginx configs interactively.

## Installation

```bash
npm install -g vps-pilot
```

## Usage

```bash
vps-pilot
```

## Requirements

- **Node.js** 18+
- **PM2** (optional, for process management)
- **Nginx** (optional, for reverse proxy)
- **Ubuntu/Debian** VPS (scripts use `bash`, `systemctl` for nginx)

## What it does

1. **Config** – Saves your choices to `~/.vps-pilot.json` so you can re-run the wizard later to add or update projects.
2. **Per project** you can:
   - Set name, path, type (Next.js, Vite, Strapi, Express/Node), PM2 name, port, git branch.
   - Enable build step, Nginx, DB backup (MySQL/PostgreSQL).
   - Generate `ecosystem.config.js`, deploy script, nginx site config.
   - Register in PM2 and optionally install a `deploy-<name>` command in `/usr/local/bin`.
3. **Deploy scripts** – Bash scripts with error handling: DB backup (with warning prompt), git pull (with conflict handling: stash / force / abort), `npm install`, `npm run build`, `pm2 restart`, nginx reload.
4. **Deploy groups** – Optionally create a single script (e.g. `deploy-all`) that runs multiple project deploy scripts in order.

## Writing to system paths

- Nginx configs are written to `/etc/nginx/sites-available/`. You may be prompted for `sudo` if the process doesn’t have permission.
- Installing a command in `/usr/local/bin` uses `sudo cp` and `sudo chmod +x`; you may be prompted for your password.

## License

ISC
