const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo root (two levels up from this package)
const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Tell Metro to watch the entire monorepo so it can resolve workspace packages
config.watchFolders = [workspaceRoot];

// Resolve modules from both the package's own node_modules and the workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Allow bundling .tflite model files as assets
config.resolver.assetExts.push('tflite');

module.exports = config;
