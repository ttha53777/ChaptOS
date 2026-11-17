// Metro for the native app.
//
// The app shares two folders with the web repo: lib/api-types (wire types,
// `import type` only) and lib/validation (Zod request schemas). The `@/lib/*`
// path in tsconfig.json points at them; Expo's tsconfig-paths support resolves
// it at bundle time, and watchFolders lets Metro read files outside mobile/.
//
// Bare imports made FROM those shared files ("zod") are resolved as if from
// mobile/, so the app bundles its own single copy of each package rather than
// whatever the web's node_modules holds. scripts/lint-mobile-imports.py keeps
// mobile/ from reaching anything else in the repo.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), path.join(repoRoot, "lib")];

const isBare = name => !name.startsWith(".") && !name.startsWith("/") && !name.startsWith("@/") && !name.startsWith("~/");
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  const fromRepoLib = !context.originModulePath.startsWith(projectRoot + path.sep)
    && context.originModulePath.startsWith(path.join(repoRoot, "lib") + path.sep);
  if (fromRepoLib && isBare(moduleName)) {
    return resolve({ ...context, originModulePath: path.join(projectRoot, "package.json") }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

// Never bundle the web app, generated Prisma client, or the repo's node_modules.
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${escape(path.join(repoRoot, "node_modules"))}/.*`),
  new RegExp(`^${escape(path.join(repoRoot, "app"))}/.*`),
];

function escape(s) { return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"); }

module.exports = config;
