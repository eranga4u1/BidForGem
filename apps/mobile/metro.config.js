// Metro config for the pnpm monorepo. Lets Metro find the workspace packages
// (@gem/api-client, @gem/types) and their hoisted dependencies, and follow the
// pnpm symlinks that link them into node_modules.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so edits to shared packages trigger reloads.
config.watchFolders = [workspaceRoot];

// Resolve modules from the app first, then the workspace root (pnpm hoist dir).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// pnpm links workspace packages as symlinks — Metro must follow them.
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
