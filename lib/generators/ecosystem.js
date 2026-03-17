const path = require('path');
const fse = require('fs-extra');

/**
 * Build PM2 app config by project type.
 * @param {Object} project - project from wizard
 * @returns {Object} - PM2 app config
 */
function buildAppConfig(project) {
  const cwd = project.path.startsWith('~') ? path.join(process.env.HOME || require('os').homedir(), project.path.slice(1)) : project.path;
  const base = {
    name: project.pm2Name,
    cwd,
    env: {
      PORT: project.port,
      NODE_ENV: 'production',
    },
  };

  switch (project.type) {
    case 'nextjs':
      return { ...base, script: 'npm', args: 'start' };
    case 'vite':
      return { ...base, script: 'npm', args: 'run preview' };
    case 'strapi':
      return { ...base, script: 'npm', args: 'run start' };
    case 'express':
      return {
        ...base,
        script: 'node',
        args: project.entryFile || 'index.js',
      };
    default:
      return { ...base, script: 'node', args: project.entryFile || 'index.js' };
  }
}

/**
 * Generate ecosystem.config.js for a project.
 * @param {Object} project
 * @returns {Promise<string>} path to written file
 */
async function generate(project) {
  const appConfig = buildAppConfig(project);
  const config = {
    apps: [appConfig],
  };
  const cwd = project.path.startsWith('~')
    ? path.join(process.env.HOME || require('os').homedir(), project.path.slice(1))
    : project.path;
  await fse.ensureDir(cwd);
  const filePath = path.join(cwd, 'ecosystem.config.js');
  const content = `module.exports = ${JSON.stringify(config, null, 2)};\n`;
  await fse.writeFile(filePath, content, 'utf8');
  return filePath;
}

module.exports = { generate, buildAppConfig };
