const inquirer = require('inquirer');
const chalk = require('chalk');
const path = require('path');
const os = require('os');
const {
  loadConfig,
  saveConfig,
  addProject,
  updateProject,
  getProject,
  listProjects,
  slugify,
} = require('./config');
const generateDeployScript = require('./generators/deploy').generate;
const generateEcosystem = require('./generators/ecosystem').generate;
const generateNginx = require('./generators/nginx').generate;
const registerPm2 = require('./generators/pm2').register;
const generateDeployGroup = require('./generators/deploy').generateDeployGroup;

const PROJECT_TYPES = [
  { name: 'Next.js', value: 'nextjs' },
  { name: 'Vite (React/Vue)', value: 'vite' },
  { name: 'Strapi', value: 'strapi' },
  { name: 'Express/Node', value: 'express' },
];

/**
 * Build per-project questions. When updating, default is the existing project.
 * @param {Object} [existing] - existing project for defaults
 * @returns {Array}
 */
function projectQuestions(existing = {}) {
  return [
    {
      type: 'input',
      name: 'name',
      message: 'Project name (e.g. Backend):',
      default: existing.name,
      validate: (v) => (v && v.trim() ? true : 'Name is required'),
    },
    {
      type: 'input',
      name: 'path',
      message: 'Absolute path on this server (e.g. /home/ubuntu/my_app):',
      default: existing.path,
      validate: (v) => (v && v.trim() ? true : 'Path is required'),
    },
    {
      type: 'list',
      name: 'type',
      message: 'Project type:',
      choices: PROJECT_TYPES,
      default: existing.type || 'express',
    },
    {
      type: 'input',
      name: 'pm2Name',
      message: 'PM2 process name (e.g. store-backend):',
      default: existing.pm2Name || existing.name ? slugify(existing.name) : '',
      validate: (v) => (v && v.trim() ? true : 'PM2 name is required'),
    },
    {
      type: 'input',
      name: 'port',
      message: 'Port number:',
      default: existing.port != null ? String(existing.port) : '3000',
      validate: (v) => (/^\d+$/.test(v) ? true : 'Enter a number'),
    },
    {
      type: 'input',
      name: 'gitBranch',
      message: 'Git branch to pull from:',
      default: existing.gitBranch || 'main',
    },
    {
      type: 'confirm',
      name: 'hasBuildStep',
      message: 'Does it need a build step? (npm run build)',
      default: existing.hasBuildStep != null ? existing.hasBuildStep : true,
    },
    {
      type: 'confirm',
      name: 'usesNginx',
      message: 'Does it use Nginx?',
      default: existing.usesNginx != null ? existing.usesNginx : false,
    },
    {
      type: 'input',
      name: 'serverName',
      message: 'Nginx server_name (domain):',
      default: existing.serverName,
      when: (answers) => answers.usesNginx,
    },
    {
      type: 'input',
      name: 'proxyPassPort',
      message: 'Nginx proxy_pass port (usually same as app port):',
      default: (answers) => answers.port || existing.proxyPassPort,
      when: (answers) => answers.usesNginx,
    },
    {
      type: 'confirm',
      name: 'generateNginxConfig',
      message: 'Generate nginx config file for this project?',
      default: existing.generateNginxConfig != null ? existing.generateNginxConfig : true,
      when: (answers) => answers.usesNginx,
    },
    {
      type: 'confirm',
      name: 'dbBackup',
      message: 'Does it need a DB backup before deploying?',
      default: existing.dbBackup != null ? existing.dbBackup : false,
    },
    {
      type: 'list',
      name: 'dbType',
      message: 'DB type:',
      choices: [{ name: 'MySQL', value: 'mysql' }, { name: 'PostgreSQL', value: 'postgres' }],
      when: (answers) => answers.dbBackup,
    },
    {
      type: 'input',
      name: 'dbName',
      message: 'DB name:',
      when: (answers) => answers.dbBackup,
    },
    {
      type: 'input',
      name: 'dbUser',
      message: 'DB user:',
      when: (answers) => answers.dbBackup,
    },
    {
      type: 'password',
      name: 'dbPassword',
      message: 'DB password:',
      when: (answers) => answers.dbBackup,
    },
    {
      type: 'input',
      name: 'backupDir',
      message: 'Backup directory (default $HOME):',
      default: existing.backupDir || '$HOME',
      when: (answers) => answers.dbBackup,
    },
    {
      type: 'confirm',
      name: 'generateEcosystem',
      message: 'Generate ecosystem.config.js for this project?',
      default: existing.generateEcosystem != null ? existing.generateEcosystem : true,
    },
    {
      type: 'confirm',
      name: 'registerPm2Now',
      message: 'Register this project in PM2 now?',
      default: existing.registerPm2Now != null ? existing.registerPm2Now : false,
    },
    {
      type: 'confirm',
      name: 'createDeployCommand',
      message: 'Create a deploy-[name] command in /usr/local/bin?',
      default: existing.createDeployCommand != null ? existing.createDeployCommand : false,
    },
    // Express/Node: entry file
    {
      type: 'input',
      name: 'entryFile',
      message: 'Entry file (e.g. app.js or index.js):',
      default: existing.entryFile || 'index.js',
      when: (answers) => answers.type === 'express',
    },
  ];
}

/**
 * Run the full wizard and generators.
 */
async function run() {
  let config = await loadConfig();
  let configChoice = 'add';
  if (config && config.projects && config.projects.length > 0) {
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Found existing config. What do you want to do?',
        choices: [
          { name: 'Add a new project', value: 'add' },
          { name: 'Update an existing project', value: 'update' },
          { name: 'Start fresh', value: 'fresh' },
        ],
      },
    ]);
    configChoice = choice;
    if (choice === 'fresh') {
      config = { projects: [], deployGroups: config.deployGroups || {} };
    }
  } else {
    config = config || { projects: [], deployGroups: {} };
  }

  let addAnother = true;
  while (addAnother) {
    if (configChoice === 'update') {
      const projectList = listProjects(config);
      if (projectList.length === 0) {
        console.log(chalk.yellow('No projects to update. Adding new project instead.'));
        configChoice = 'add';
      } else {
        const { projectId } = await inquirer.prompt([
          { type: 'list', name: 'projectId', message: 'Which project to update?', choices: projectList },
        ]);
        const existing = getProject(config, projectId);
        const answers = await inquirer.prompt(projectQuestions(existing));
        const project = {
          ...existing,
          ...answers,
          id: projectId,
          port: parseInt(answers.port, 10),
        };
        updateProject(config, projectId, project);
        console.log(chalk.green(`Updated project: ${project.name}`));
        const { another } = await inquirer.prompt([
          { type: 'confirm', name: 'another', message: 'Add another project?', default: false },
        ]);
        addAnother = another;
        if (addAnother) configChoice = 'add';
        continue;
      }
    }

    const answers = await inquirer.prompt(projectQuestions());
    const project = {
      ...answers,
      port: parseInt(answers.port, 10),
      id: slugify(answers.name) || `project-${Date.now()}`,
    };
    addProject(config, project);
    console.log(chalk.green(`Added project: ${project.name}`));

    const { another } = await inquirer.prompt([
      { type: 'confirm', name: 'another', message: 'Add another project?', default: false },
    ]);
    addAnother = another;
  }

  // Deploy group
  if (config.projects.length > 0) {
    const { createGroup } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createGroup',
        message: 'Do you want to create a deploy group command (e.g. deploy-all)?',
        default: false,
      },
    ]);
    if (createGroup) {
      const groupChoices = config.projects.map((p) => ({ name: p.name, value: p.id }));
      const { groupName, projectIds } = await inquirer.prompt([
        { type: 'input', name: 'groupName', message: 'Group name (e.g. all):', default: 'all' },
        {
          type: 'checkbox',
          name: 'projectIds',
          message: 'Which projects to include?',
          choices: groupChoices,
          validate: (v) => (v.length > 0 ? true : 'Select at least one project'),
        },
      ]);
      config.deployGroups = config.deployGroups || {};
      config.deployGroups[groupName] = projectIds;
    }
  }

  await saveConfig(config);

  // Run generators for each project
  const summary = { config: true, deployScripts: [], ecosystems: [], nginx: [], pm2: [], deployGroups: [], symlinks: [] };

  for (const project of config.projects) {
    const projectPath = project.path.replace(/^~/, os.homedir());

    if (project.generateEcosystem) {
      try {
        const ecosystemPath = await generateEcosystem(project);
        if (ecosystemPath) summary.ecosystems.push({ name: project.name, path: ecosystemPath });
      } catch (err) {
        console.error(chalk.red(`Ecosystem for ${project.name}: ${err.message}`));
      }
    }

    try {
      const deployPath = await generateDeployScript(project, config);
      if (deployPath) summary.deployScripts.push({ name: project.name, path: deployPath });
    } catch (err) {
      console.error(chalk.red(`Deploy script for ${project.name}: ${err.message}`));
    }

    if (project.usesNginx && project.generateNginxConfig) {
      try {
        const nginxResult = await generateNginx(project);
        if (nginxResult && nginxResult.path) {
          summary.nginx.push({ name: project.name, path: nginxResult.path });
          if (nginxResult.symlinked) summary.nginx[summary.nginx.length - 1].symlinked = true;
        }
      } catch (err) {
        console.error(chalk.red(`Nginx config for ${project.name}: ${err.message}`));
      }
    }

    if (project.registerPm2Now) {
      try {
        await registerPm2(project);
        summary.pm2.push(project.name);
      } catch (err) {
        console.error(chalk.red(`PM2 register for ${project.name}: ${err.message}`));
      }
    }

    if (project.createDeployCommand) {
      try {
        const deployScriptPath = path.join(projectPath, `deploy-${project.pm2Name}.sh`);
        const fse = require('fs-extra');
        if (await fse.pathExists(deployScriptPath)) {
          const execa = require('execa');
          const dest = `/usr/local/bin/deploy-${project.pm2Name}`;
          await execa('sudo', ['cp', deployScriptPath, dest], { stdio: 'inherit' });
          await execa('sudo', ['chmod', '+x', dest], { stdio: 'inherit' });
          summary.symlinks.push(dest);
        }
      } catch (err) {
        console.error(chalk.red(`Symlink deploy command for ${project.name}: ${err.message}`));
      }
    }
  }

  if (config.deployGroups && Object.keys(config.deployGroups).length > 0) {
    const scriptsDir = path.join(os.homedir(), 'vps-pilot-scripts');
    for (const [groupName, projectIds] of Object.entries(config.deployGroups)) {
      try {
        const groupPath = await generateDeployGroup(config, groupName, projectIds, scriptsDir);
        if (groupPath) summary.deployGroups.push({ name: groupName, path: groupPath });
      } catch (err) {
        console.error(chalk.red(`Deploy group ${groupName}: ${err.message}`));
      }
    }
  }

  printSummary(summary);
}

function printSummary(summary) {
  console.log(chalk.bold('\n--- Summary ---\n'));
  if (summary.config) {
    console.log(chalk.green('Config saved:') + ' ~/.vps-pilot.json');
  }
  summary.deployScripts.forEach(({ name, path: p }) => {
    console.log(chalk.green('Deploy script:') + ` ${p} (${name})`);
  });
  summary.ecosystems.forEach(({ name, path: p }) => {
    console.log(chalk.green('Ecosystem:') + ` ${p} (${name})`);
  });
  summary.nginx.forEach(({ name, path: p, symlinked }) => {
    console.log(chalk.green('Nginx config:') + ` ${p} (${name})` + (symlinked ? ' [symlinked & reloaded]' : ''));
  });
  if (summary.pm2.length) {
    console.log(chalk.green('PM2 registered:') + ' ' + summary.pm2.join(', '));
  }
  summary.deployGroups.forEach(({ name, path: p }) => {
    console.log(chalk.green('Deploy group:') + ` ${p} (${name})`);
  });
  summary.symlinks.forEach((p) => {
    console.log(chalk.green('Command in PATH:') + ` ${p}`);
  });
  console.log('');
}

module.exports = { run };
