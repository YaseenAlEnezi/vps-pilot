const path = require('path');
const os = require('os');
const fse = require('fs-extra');

const CONFIG_PATH = path.join(os.homedir(), '.vps-pilot.json');

/**
 * Load config from ~/.vps-pilot.json.
 * @returns {Promise<{ projects: Array, deployGroups?: Object } | null>}
 */
async function loadConfig() {
  try {
    const raw = await fse.readFile(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);
    if (!config.projects || !Array.isArray(config.projects)) {
      return null;
    }
    return config;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    return null;
  }
}

/**
 * Save config to ~/.vps-pilot.json.
 * @param {Object} config - { projects, deployGroups? }
 */
async function saveConfig(config) {
  await fse.ensureDir(path.dirname(CONFIG_PATH));
  await fse.writeJson(CONFIG_PATH, config, { spaces: 2 });
}

/**
 * Generate a slug id from project name.
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Add a project to config (assigns id if missing).
 * @param {Object} config
 * @param {Object} project
 */
function addProject(config, project) {
  if (!project.id) project.id = slugify(project.name) || `project-${Date.now()}`;
  config.projects.push(project);
}

/**
 * Update a project by id.
 * @param {Object} config
 * @param {string} id
 * @param {Object} updates
 */
function updateProject(config, id, updates) {
  const idx = config.projects.findIndex((p) => p.id === id);
  if (idx === -1) return;
  config.projects[idx] = { ...config.projects[idx], ...updates };
}

/**
 * Get a project by id.
 * @param {Object} config
 * @param {string} id
 * @returns {Object | undefined}
 */
function getProject(config, id) {
  return config.projects.find((p) => p.id === id);
}

/**
 * List all projects (names and ids for prompts).
 * @param {Object} config
 * @returns {Array<{ name: string, value: string }>}
 */
function listProjects(config) {
  return (config.projects || []).map((p) => ({
    name: `${p.name} (${p.path})`,
    value: p.id,
  }));
}

module.exports = {
  CONFIG_PATH,
  loadConfig,
  saveConfig,
  slugify,
  addProject,
  updateProject,
  getProject,
  listProjects,
};
