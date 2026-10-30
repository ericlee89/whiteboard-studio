// wb clip —— 把一段外部短视频（实拍 / 录屏 / 动画）接进这一期的成片。
//
//   wb clip <期> <视频>                    接在片尾
//   wb clip <期> <视频> --where 03-amount  接在 03-amount 这段之后
//   wb clip <期> <视频> --where start      接在片头
//   wb clip <期> <视频> --mode pip --corner br --size 0.3 --from 4
//   wb clip <期> --list / --remove 2
//
// 参数：--mode cut|pip  --fade 0.4  --size 0.32  --corner br|bl|tr|tl  --from 2  --margin 40
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const paths = require('./paths.cjs');
const L = require('./clip-lib.js');

const argv = process.argv.slice(2);
const opt = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { opt[k] = next; i++; } else opt[k] = true;
  } else pos.push(a);
}

const P = paths.projectPaths(paths.resolveProject(pos[0]));

function relist() {
  const list = L.readClips(P);
  if (!list.length) { console.log('这一期没有插片（clips.json 不存在或为空）'); return; }
  console.log(`插片清单（${path.relative(process.cwd(), L.clipsFile(P))}）：`);
  list.forEach((c, i) => {
    const tag = (c.mode || 'cut') === 'cut' ? `整屏插入 · ${c.where || 'end'} 之后` : `画中画 · ${c.corner || 'br'} · ${c.from || 2}s 起`;
    console.log(`  ${i + 1}. ${c.id}  [${tag}]  源：${c.src}`);
  });
}

function refresh() {
  const out = L.buildClipMaster(P, (m) => console.log(m));
  if (!out) console.log('没有可用插片，回到纯渲染版');
  console.log('重新混 BGM…');
  execFileSync(process.execPath, [path.join(__dirname, 'mix-bgm.mjs'), P.project], { stdio: 'inherit' });
  // 侧挂的 字幕.srt 要按整屏插入的时长整体后移，否则外部播放器加载字幕后会越走越偏
  try {
    const cfg = require('./paths.cjs').cfg;
    if (cfg.captions && cfg.captions.enabled) {
      const r = require('./captions.cjs').writeSrt(P.project);
      console.log(`字幕 ${r.count} 条 → ${path.basename(r.file)}（已含插片偏移）`);
    }
  } catch (e) { console.log(`字幕没重算：${e.message}`); }
  try { execFileSync(process.execPath, [path.join(P.project, 'scenes.js')], { stdio: 'ignore' }); } catch {}
  console.log('成片：' + P.final);
  return out;
}

if (opt.list) { relist(); process.exit(0); }

if (opt.remove) {
  const list = L.readClips(P);
  const key = String(opt.remove);
  const i = /^\d+$/.test(key) ? Number(key) - 1 : list.findIndex((c) => c.id === key);
  if (i < 0 || i >= list.length) { console.error(`没有这条插片：${key}`); process.exit(1); }
  const [gone] = list.splice(i, 1);
  L.writeClips(P, list);
  fs.rmSync(path.join(L.clipDir(P), `${gone.id}.norm.mp4`), { force: true });
  console.log(`已移除插片 ${gone.id}`);
  if (fs.existsSync(path.join(P.out, 'master.mp4'))) refresh(); else console.log('（还没渲染过，等 build 时自动生效）');
  process.exit(0);
}

// —— 添加 ——
if (!pos[1]) {
  console.error('用法：wb clip <期> <视频文件> [--where start|<段名>|end] [--mode cut|pip]');
  process.exit(1);
}
const src = paths.expand(pos[1]);
if (!fs.existsSync(src)) { console.error(`找不到视频：${src}`); process.exit(1); }
if (!fs.existsSync(path.join(P.out, 'master.mp4'))) { console.error('还没渲染过成片，先跑 wb render 或 wb build'); process.exit(1); }

const st = fs.statSync(src);
const info = L.probe(src);
if (!info.v) { console.error('这个文件里没有视频流'); process.exit(1); }

// 源视频复制进期目录（build 的 work/clip 会随 clean 重建，期目录 assets 才是长期存放处）
const slug = path.basename(src, path.extname(src)).replace(/[^\w\u4e00-\u9fa5-]+/g, '-').slice(0, 40) || 'clip';
const keep = path.join(P.assets, `clip-${slug}${path.extname(src).toLowerCase()}`);
if (path.resolve(keep) !== path.resolve(src)) fs.copyFileSync(src, keep);

const list = L.readClips(P);
let id = slug;
for (let n = 2; list.some((c) => c.id === id); n++) id = `${slug}-${n}`;

const norm = path.join(L.clipDir(P), `${id}.norm.mp4`);
fs.mkdirSync(L.clipDir(P), { recursive: true });
// 画中画不做淡入淡出：它是在白板画面上叠一块，淡到纸色会先白一下，反而突兀
const mode = opt.mode === 'pip' ? 'pip' : 'cut';
const fadeVal = mode === 'pip' ? 0 : (opt.fade == null ? 0.4 : Number(opt.fade));
console.log(`规整插片：${path.basename(src)}（${info.w}×${info.h}，${info.dur.toFixed(1)}s，${info.a ? '有音轨' : '无音轨→补静音'}）`);
const r = L.normalize(keep, norm, { fade: fadeVal });
const nd = L.probe(norm).dur; // 规整后的真实时长（帧率对齐后可能差零点几秒），字幕后移要用它

const entry = {
  id,
  src: path.relative(P.project, keep).replace(/\\/g, '/'),
  mode,
  where: opt.where || 'end',
  fade: fadeVal,
  dur: Number(nd.toFixed(3)),
};
if (entry.mode === 'pip') {
  Object.assign(entry, {
    corner: opt.corner || 'br',
    size: Number(opt.size || 0.32),
    from: Number(opt.from || 2),
    margin: Number(opt.margin || 40),
  });
}
if (!['start', 'end'].includes(entry.where)) {
  const names = L.segments(P).map((f) => path.basename(f, '.mp4'));
  if (!names.includes(entry.where)) {
    console.error(`没有这一段：${entry.where}\n现有：${names.join(' | ')}`);
    process.exit(1);
  }
}
list.push(entry);
L.writeClips(P, list);
console.log(`已登记 ${id}：${entry.mode === 'pip' ? `画中画 ${entry.corner}，${entry.from}s 起` : `整屏插入，${entry.where} 之后`}（插片 ${nd.toFixed(1)}s，淡入淡出 ${entry.fade}s）`);
refresh();
