const path = require('path');
const os = require('os');
const fse = require('fs-extra');

/**
 * Build bash deploy script content for one project.
 * @param {Object} project
 * @returns {string}
 */
function buildDeployScript(project) {
  const dir = project.path.replace(/^~/, '$HOME');
  const branch = project.gitBranch || 'main';
  const pm2Name = project.pm2Name;

  let script = `#!/bin/bash
set -e

PROJECT_DIR="${dir}"
cd "$PROJECT_DIR" || { echo "❌ Failed to cd to $PROJECT_DIR"; exit 1; }

`;

  if (project.dbBackup && project.dbType) {
    const backupDir = project.backupDir || '$HOME';
    const timestamp = '$(date +%Y%m%d_%H%M%S)';
    if (project.dbType === 'mysql') {
      script += `# --- 1. DB Backup (MySQL) ---
BACKUP_DIR="${backupDir}"
BACKUP_FILE="$BACKUP_DIR/backup_${project.dbName || 'db'}_${timestamp}.sql"
echo "📦 Running MySQL backup..."
if ! mysqldump -u "${project.dbUser || 'root'}" -p"${project.dbPassword || ''}" "${project.dbName || ''}" > "$BACKUP_FILE" 2>/tmp/backup_stderr.txt; then
  echo "❌ Backup failed. Aborting."
  cat /tmp/backup_stderr.txt
  exit 1
fi
if grep -i warning /tmp/backup_stderr.txt 2>/dev/null; then
  read -p "⚠️  Backup completed with warnings. Continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
fi
echo "✅ Backup saved to $BACKUP_FILE"

`;
    } else if (project.dbType === 'postgres') {
      script += `# --- 1. DB Backup (PostgreSQL) ---
BACKUP_DIR="${backupDir}"
BACKUP_FILE="$BACKUP_DIR/backup_${project.dbName || 'db'}_${timestamp}.sql"
echo "📦 Running PostgreSQL backup..."
if ! pg_dump -U "${project.dbUser || 'postgres'}" "${project.dbName || ''}" > "$BACKUP_FILE" 2>/tmp/backup_stderr.txt; then
  echo "❌ Backup failed. Aborting."
  cat /tmp/backup_stderr.txt
  exit 1
fi
if grep -i warning /tmp/backup_stderr.txt 2>/dev/null; then
  read -p "⚠️  Backup completed with warnings. Continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then exit 1; fi
fi
echo "✅ Backup saved to $BACKUP_FILE"

`;
    }
  }

  script += `# --- 2. Git Pull ---
echo "📥 Git pull..."
if ! git pull origin ${branch}; then
  ERR=$(git status 2>&1)
  if echo "$ERR" | grep -q "would be overwritten\\|diverged\\|local changes"; then
    echo "❌ Git pull failed due to local changes."
    echo "$ERR"
    echo ""
    echo "Choose an option:"
    echo "  1) Stash changes and retry"
    echo "  2) Force overwrite (git checkout -- . && git pull)"
    echo "  3) Abort"
    read -p "Enter 1, 2, or 3: " choice
    case $choice in
      1) git stash && git pull origin ${branch} || { echo "❌ Stash/pull failed"; exit 1; };;
      2) git checkout -- . && git pull origin ${branch} || { echo "❌ Force pull failed"; exit 1; };;
      *) echo "Aborted."; exit 1;;
    esac
  else
    echo "❌ Git error: $ERR"
    exit 1
  fi
fi
echo "✅ Git pull done"

`;

  script += `# --- 3. npm install ---
echo "📦 npm install..."
npm install || { echo "❌ npm install failed"; exit 1; }
echo "✅ npm install done"

`;

  if (project.hasBuildStep) {
    script += `# --- 4. Build ---
echo "🔨 npm run build..."
npm run build || { echo "❌ Build failed"; exit 1; }
echo "✅ Build done"

`;
  }

  script += `# --- ${project.hasBuildStep ? '5' : '4'}. PM2 restart ---
echo "🔄 PM2 restart ${pm2Name}..."
pm2 restart ${pm2Name} --update-env || { echo "❌ PM2 restart failed"; exit 1; }
echo "✅ PM2 restarted"

`;

  if (project.usesNginx) {
    script += `# --- ${project.hasBuildStep ? '6' : '5'}. Nginx reload ---
echo "🌐 Reloading nginx..."
sudo systemctl reload nginx || { echo "❌ Nginx reload failed"; exit 1; }
echo "✅ Nginx reloaded"

`;
  }

  script += `echo "🎉 Deploy finished successfully."
`;
  return script;
}

/**
 * Generate deploy script for one project; write to project path and chmod +x.
 * @param {Object} project
 * @param {Object} config - full config (for deploy group paths)
 * @returns {Promise<string>} path to script
 */
async function generate(project, config) {
  const projectPath = project.path.replace(/^~/, os.homedir());
  await fse.ensureDir(projectPath);
  const scriptPath = path.join(projectPath, `deploy-${project.pm2Name}.sh`);
  const content = buildDeployScript(project);
  await fse.writeFile(scriptPath, content, 'utf8');
  await fse.chmod(scriptPath, 0o755);
  return scriptPath;
}

/**
 * Generate a deploy group script that runs each project's deploy script in order.
 * @param {Object} config - has projects, deployGroups
 * @param {string} groupName
 * @param {string[]} projectIds
 * @param {string} scriptsDir - e.g. ~/vps-pilot-scripts
 * @returns {Promise<string>} path to group script
 */
async function generateDeployGroup(config, groupName, projectIds, scriptsDir) {
  const resolvedDir = scriptsDir.replace(/^~/, os.homedir());
  await fse.ensureDir(resolvedDir);
  const scriptPath = path.join(resolvedDir, `deploy-${groupName}.sh`);

  const lines = [
    '#!/bin/bash',
    'set -e',
    '',
    `echo "🚀 Deploy group: ${groupName}"`,
    '',
  ];

  for (const id of projectIds) {
    const p = config.projects.find((pr) => pr.id === id);
    if (!p) continue;
    const deployPath = path.join(p.path.replace(/^~/, os.homedir()), `deploy-${p.pm2Name}.sh`);
    lines.push(`echo "--- Deploying ${p.name} ---"`);
    lines.push(`bash "${deployPath}" || { echo "❌ Deploy failed for ${p.name}"; exit 1; }`);
    lines.push('');
  }

  lines.push('echo "🎉 Deploy group finished."');
  const content = lines.join('\n');
  await fse.writeFile(scriptPath, content, 'utf8');
  await fse.chmod(scriptPath, 0o755);
  return scriptPath;
}

module.exports = { generate, generateDeployGroup, buildDeployScript };
