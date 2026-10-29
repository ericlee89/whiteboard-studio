const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {preparePersistentStorage} = require('./persistent-storage.cjs');
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-volume-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const app=path.join(root,'app'),volume=path.join(root,'persistent');
  fs.mkdirSync(app);fs.mkdirSync(path.join(app,'data'));fs.mkdirSync(path.join(app,'.agent-native'));
  return {root,app,volume,env:{STUDIO_STORAGE_ROOT:volume,RAILWAY_PROJECT_ID:'fixture',RAILWAY_VOLUME_MOUNT_PATH:volume}};
}
test('ordinary Docker mode keeps its existing layout',t=>{
  const f=fixture(t);assert.equal(preparePersistentStorage({},f.app).enabled,false);
  assert(!fs.lstatSync(path.join(f.app,'data')).isSymbolicLink());
});
test('one attached volume persists both app data and framework state across a new image',t=>{
  const f=fixture(t);preparePersistentStorage(f.env,f.app);
  fs.writeFileSync(path.join(f.app,'data/episode.json'),'fixture');
  fs.writeFileSync(path.join(f.app,'.agent-native/settings.json'),'state');
  const next=path.join(f.root,'next-image');fs.mkdirSync(next);fs.mkdirSync(path.join(next,'data'));fs.mkdirSync(path.join(next,'.agent-native'));
  preparePersistentStorage(f.env,next);
  assert.equal(fs.readFileSync(path.join(next,'data/episode.json'),'utf8'),'fixture');
  assert.equal(fs.readFileSync(path.join(next,'.agent-native/settings.json'),'utf8'),'state');
  assert.equal(preparePersistentStorage(f.env,next).enabled,true);
});
test('missing Railway mount is refused instead of writing ephemeral data',t=>{
  const f=fixture(t);assert.throws(()=>preparePersistentStorage({...f.env,RAILWAY_VOLUME_MOUNT_PATH:'/wrong'},f.app),/volume is missing/);
});
test('nonempty legacy data is preserved and requires explicit migration',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.app,'.agent-native/keep.json'),'keep');
  assert.throws(()=>preparePersistentStorage(f.env,f.app),/not empty/);
  assert.equal(fs.readFileSync(path.join(f.app,'.agent-native/keep.json'),'utf8'),'keep');
  assert(!fs.lstatSync(path.join(f.app,'data')).isSymbolicLink());
});
test('rejects unsafe storage roots and existing links pointing elsewhere',t=>{
  const f=fixture(t);
  for(const root of ['relative',f.app,path.join(f.app,'data'),f.root])
    assert.throws(()=>preparePersistentStorage({...f.env,STUDIO_STORAGE_ROOT:root},f.app),/absolute|outside/);
  fs.rmdirSync(path.join(f.app,'data'));fs.symlinkSync('/different-volume',path.join(f.app,'data'),'dir');
  assert.throws(()=>preparePersistentStorage(f.env,f.app),/points elsewhere/);
});
test('rejects a persistent data target redirected outside the volume',t=>{
  const f=fixture(t);fs.mkdirSync(f.volume);fs.symlinkSync(f.app,path.join(f.volume,'data'),'dir');
  assert.throws(()=>preparePersistentStorage(f.env,f.app),/real directories/);
});
