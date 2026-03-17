const path = require('path');
const os = require('os');
const inquirer = require('inquirer');
const chalk = require('chalk');
const fse = require('fs-extra');
const { execa } = require('execa');
const { slugify } = require('../config');

const SITES_AVAILABLE = '/etc/nginx/sites-available';
const SITES_ENABLED = '/etc/nginx/sites-enabled';

/**
 * Generate nginx server block content.
 * @param {Object} project - serverName, port (for proxy_pass)
 * @returns {string}
 */
function buildNginxConfig(project) {
  const port = project.proxyPassPort != null ? project.proxyPassPort : project.port;
  const serverName = project.serverName || '_';
  return `server {
    listen 80;
    server_name ${serverName};

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
}

/**
 * Write nginx config to /etc/nginx/sites-available (requires sudo).
 * Optionally prompt to symlink and reload.
 * @param {Object} project
 * @returns {Promise<{ path: string, symlinked?: boolean }>}
 */
async function generate(project) {
  const name = slugify(project.pm2Name) || slugify(project.name) || 'default';
  const configPath = path.join(SITES_AVAILABLE, name);
  const content = buildNginxConfig(project);

  try {
    await fse.writeFile(configPath, content, 'utf8');
  } catch (err) {
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      try {
        const tmpPath = path.join(os.tmpdir(), `vps-pilot-nginx-${name}`);
        await fse.writeFile(tmpPath, content, 'utf8');
        await execa('sudo', ['cp', tmpPath, configPath], { stdio: 'inherit' });
        await fse.remove(tmpPath).catch(() => {});
      } catch (teeErr) {
        console.log(chalk.yellow('Cannot write to /etc/nginx (permission denied). Run with sudo or write manually:'));
        console.log(chalk.gray(configPath));
        console.log(chalk.gray(content));
        return { path: configPath, symlinked: false };
      }
    } else {
      throw err;
    }
  }

  let symlinked = false;
  const { symlinkAndReload } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'symlinkAndReload',
      message: 'Symlink to sites-enabled and reload nginx?',
      default: true,
    },
  ]);

  if (symlinkAndReload) {
    try {
      const enabledPath = path.join(SITES_ENABLED, name);
      await execa('sudo', ['ln', '-sf', configPath, enabledPath], { stdio: 'inherit' });
      await execa('sudo', ['systemctl', 'reload', 'nginx'], { stdio: 'inherit' });
      symlinked = true;
    } catch (err) {
      console.error(chalk.red('Symlink/reload failed:'), err.message);
    }
  }

  return { path: configPath, symlinked };
}

module.exports = { generate, buildNginxConfig };
