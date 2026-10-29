const fs = require('node:fs');
const path = require('node:path');

// Hosted containers get one volume. Keep both existing relative paths on it
// without relocating application code or silently deleting legacy user data.
function preparePersistentStorage(env = process.env, appRoot = path.resolve(__dirname, '../..')) {
  const configured = env.STUDIO_STORAGE_ROOT;
  if (!configured) return { enabled: false };
  if (!path.isAbsolute(configured)) throw new Error('STUDIO_STORAGE_ROOT must be absolute.');
  const storageRoot = path.resolve(configured), application = path.resolve(appRoot);
  if (application === storageRoot || application.startsWith(storageRoot + path.sep) ||
      storageRoot.startsWith(application + path.sep) || storageRoot === path.parse(storageRoot).root)
    throw new Error('Persistent storage must be outside the application directory.');
  if (env.RAILWAY_PROJECT_ID && path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH || '.') !== storageRoot)
    throw new Error('Railway persistent volume is missing or mounted at a different path.');
  fs.mkdirSync(storageRoot, { recursive: true });
  const pairs = [['data', 'data'], ['.agent-native', 'state']].map(([name, dir]) => ({
    source: path.join(application, name), target: path.join(storageRoot, dir),
  }));
  // Validate every old path before making any links.
  for (const {source, target} of pairs) {
    const current = fs.lstatSync(source, { throwIfNoEntry: false });
    if (current?.isSymbolicLink()) {
      if (path.resolve(path.dirname(source), fs.readlinkSync(source)) !== target)
        throw new Error('Existing storage link points elsewhere; migrate it explicitly.');
    } else if (current && (!current.isDirectory() || fs.readdirSync(source).length))
      throw new Error('Existing application data is not empty; migrate it before enabling STUDIO_STORAGE_ROOT.');
    const existing = fs.lstatSync(target, { throwIfNoEntry: false });
    if (existing && (!existing.isDirectory() || existing.isSymbolicLink()))
      throw new Error('Persistent data/state targets must be real directories.');
  }
  for (const {source, target} of pairs) {
    fs.mkdirSync(target, { recursive: true });
    if (process.getuid?.() === 0) fs.chownSync(target, 1000, 1000);
    const current = fs.lstatSync(source, { throwIfNoEntry: false });
    if (!current?.isSymbolicLink()) {
      if (current) fs.rmdirSync(source); // Validated empty above; never recursive.
      fs.symlinkSync(target, source, process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
  return { enabled: true, storageRoot };
}
module.exports = { preparePersistentStorage };
