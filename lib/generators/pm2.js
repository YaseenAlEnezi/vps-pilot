const path = require('path');
const os = require('os');
const execa = require('execa');
const chalk = require('chalk');

/**
 * Register project in PM2: start from ecosystem.config.js and save.
 * @param {Object} project - path, pm2Name
 */
async function register(project) {
  const projectPath = project.path.replace(/^~/, os.homedir());
  const ecosystemPath = path.join(projectPath, 'ecosystem.config.js');

  try {
    await execa('pm2', ['start', ecosystemPath, '--only', project.pm2Name], {
      stdio: 'inherit',
      cwd: projectPath,
    });
  } catch (err) {
    console.error(chalk.red('PM2 start failed:'), err.message);
    throw err;
  }

  try {
    await execa('pm2', ['save'], { stdio: 'inherit' });
  } catch (err) {
    console.error(chalk.red('PM2 save failed:'), err.message);
    throw err;
  }
}

module.exports = { register };
