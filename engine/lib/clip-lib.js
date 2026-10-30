// 外部短视频融合：把实拍 / 录屏 / 动画片段接进白板成片。
//
// 为什么不塞进画布：render.html 的图层只吃静态 image（Excalidraw 也没有 video 元素），
// 逐帧截图时视频帧不稳定也没必要。视频走后期——把插片规整成和渲染分段完全一致的参数
// （1920×1080 / 30fps / H.264 High / yuvj420p / AAC 48k stereo），再拼进 master。
//
// 两种接法：
//   cut —— 整屏插入。在指定位置硬切一段，前后仍是白板画面。适合录屏演示、实拍空镜。
//   pip —— 画中画。叠加在白板画面某个角落，讲解词不停。适合「边讲边放实物」。
//
// 插片清单落在期目录 clips.json（人可读、可手改），每次 render 都会照它重拼，
// 所以 build 一条龙不会把插片弄丢；删掉 clips.json 即回到纯渲染版本。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const paths = require('./paths.cjs');

const cfg = paths.cfg;
const W = cfg.render.width || 1920;
const H = cfg.render.height || 1080;
const FPS = cfg.render.fps || 30;
const SAFE_BOTTOM = 940; // 字幕安全区上沿：画中画底边不许压过这条线
const PIX = 'yuvj420p'; // 与 render.js 渲染分段一致（ffmpeg 出来的分段实测是 yuvj420p）

function paper() {
  const s = cfg.style || {};
  const base = (s.presets && s.presets[s.preset]) || {};
  const m = { ...base, ...(s.override || {}) };
  return '0x' + String(m.paper || '#fffdf7').replace(/^#/, '');
}

function probe(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]).toString());
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  return { v, a, dur: Number(j.format.duration) || 0, w: v && v.width, h: v && v.height };
}

// 规整：等比缩放 + 纸色补边（不留黑边，白板底色延伸出去），统一帧率/像素格式/音频。
// fade>0 时首尾淡入淡出到**纸色**而不是黑色——从白板切出去再切回来才不闪。
function normalize(src, dst, o = {}) {
  const info = probe(src);
  if (!info.v) throw new Error(`插片没有视频流：${src}`);
  const dur = info.dur;
  const f = o.fade == null ? 0.4 : Number(o.fade);
  const pc = paper();
  const fade = f > 0 && dur > f * 2 + 0.2
    ? `,fade=t=in:st=0:d=${f}:color=${pc},fade=t=out:st=${(dur - f).toFixed(3)}:d=${f}:color=${pc}`
    : '';
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,`
    + `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${pc},setsar=1,fps=${FPS},format=${PIX}${fade}`;
  const args = ['-y', '-loglevel', 'error', '-i', src];
  if (!info.a) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  args.push('-map', '0:v:0', '-map', info.a ? '0:a:0' : '1:a', '-vf', vf,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', PIX, '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', dst);
  execFileSync('ffmpeg', args);
  return { dur, w: info.w, h: info.h, hasAudio: !!info.a, ratio: info.h / info.w };
}

// 分段顺序：script.json 的场景顺序 + 片尾卡（存在才拼）
function segments(P) {
  const script = JSON.parse(fs.readFileSync(P.script));
  const list = script.map((s) => path.join(P.out, `${s.name}.mp4`));
  const card = path.join(P.out, '99-brand.mp4');
  if (fs.existsSync(card)) list.push(card);
  return list;
}

function concatCopy(files, dst) {
  const listFile = `${dst}.txt`;
  fs.writeFileSync(listFile, files.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c', 'copy', '-movflags', '+faststart', dst]);
    return true;
  } catch {
    return false; // 参数没对齐时 copy 会失败，交给重编码兜底
  } finally {
    fs.rmSync(listFile, { force: true });
  }
}

function concatReencode(files, dst) {
  const args = ['-y', '-loglevel', 'error'];
  for (const f of files) args.push('-i', f);
  const pairs = files.map((_, i) => `[${i}:v:0][${i}:a:0]`).join('');
  args.push('-filter_complex', `${pairs}concat=n=${files.length}:v=1:a=1[v][a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', PIX, '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart', dst);
  execFileSync('ffmpeg', args);
}

// 画中画：白边框 + 贴角，按时间窗显示。默认贴右下但不许压字幕区。
function overlayOne(master, norm, dst, o = {}) {
  const info = probe(norm);
  const m = Number(o.margin || 40);
  const cw = Math.round(W * Number(o.size || 0.32));
  const ch = Math.round(cw * (info.h / info.w));
  const from = Number(o.from || 2);
  const corner = o.corner || 'br';
  const ySafe = Math.min(H - ch - m, SAFE_BOTTOM - ch - 16);
  let x = W - cw - m, y = ySafe;
  if (corner === 'tl') { x = m; y = m; }
  else if (corner === 'tr') { x = W - cw - m; y = m; }
  else if (corner === 'bl') { x = m; y = ySafe; }
  const en = `between(t,${from},${(from + info.dur).toFixed(3)})`;
  // 第二路输入有它自己的时间轴：不位移的话主视频到 from 秒时它已经播到 from 秒了，
  // 表现为「一出现就是尾巴」。setpts 把它的零点对齐到主视频的 from。
  const shift = from > 0 ? `setpts=PTS+${from}/TB,` : '';
  const fc = `[1:v]${shift}scale=${cw}:-2,format=${PIX},pad=iw+16:ih+16:8:8:color=white[c];`
    + `[0:v][c]overlay=${x}:${y}:eof_action=pass:enable='${en}'[v]`;
  const args = ['-y', '-loglevel', 'error', '-i', master, '-i', norm,
    '-filter_complex', fc, '-map', '[v]', '-map', '0:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', PIX, '-r', String(FPS),
    '-c:a', 'copy', '-movflags', '+faststart', dst];
  execFileSync('ffmpeg', args);
  return { x, y, cw, ch, from };
}

function clipsFile(P) { return path.join(P.project, 'clips.json'); }

function readClips(P) {
  const f = clipsFile(P);
  if (!fs.existsSync(f)) return [];
  try {
    const a = JSON.parse(fs.readFileSync(f, 'utf8'));
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

function writeClips(P, list) {
  const f = clipsFile(P);
  if (!list.length) { fs.rmSync(f, { force: true }); return; }
  fs.writeFileSync(f, JSON.stringify(list, null, 2) + '\n', 'utf8');
}

function clipDir(P) { return path.join(P.build, 'clip'); }

// 按 clips.json 拼出带插片的 master → work/out/master-clip.mp4
// 没有插片时顺手删掉旧产物，免得 mix 读到过期文件。
function buildClipMaster(P, log = () => {}) {
  const clips = readClips(P).filter((c) => fs.existsSync(path.join(clipDir(P), `${c.id}.norm.mp4`)));
  const outClip = path.join(P.out, 'master-clip.mp4');
  if (!clips.length) {
    fs.rmSync(outClip, { force: true });
    return null;
  }
  const segs = segments(P);
  const missing = segs.filter((f) => !fs.existsSync(f));
  if (missing.length) throw new Error(`缺少分段：${missing.map((f) => path.basename(f)).join(', ')}，先 wb render`);

  const cuts = clips.filter((c) => (c.mode || 'cut') === 'cut');
  const pips = clips.filter((c) => c.mode === 'pip');

  // 1) 先把 cut 段按位置拼进去
  let files = segs.slice();
  for (const c of cuts) {
    const norm = path.join(clipDir(P), `${c.id}.norm.mp4`);
    let idx = files.length;
    if (c.where === 'start') idx = 0;
    else if (c.where && c.where !== 'end') {
      const i = files.findIndex((f) => path.basename(f) === `${c.where}.mp4`);
      if (i >= 0) idx = i + 1;
    }
    files.splice(idx, 0, norm);
    log(`  插入 ${c.id} → ${c.where === 'start' ? '片头' : idx === files.length - 1 ? '片尾附近' : `第 ${idx} 段后`}`);
  }

  let master = outClip;
  if (cuts.length) {
    const tmp = path.join(clipDir(P), '_concat.mp4');
    if (!concatCopy(files, tmp)) {
      log('  （参数未对齐，改用重编码拼接）');
      concatReencode(files, tmp);
    }
    master = tmp;
  } else {
    master = path.join(P.out, 'master.mp4');
  }

  // 2) 再叠画中画（脚本顺序依次叠，后加的盖在上面）
  if (pips.length) {
    let cur = master;
    for (let k = 0; k < pips.length; k++) {
      const c = pips[k];
      const dst = path.join(clipDir(P), `_pip${k}.mp4`);
      const r = overlayOne(cur, path.join(clipDir(P), `${c.id}.norm.mp4`), dst, c);
      log(`  画中画 ${c.id} → ${c.corner || 'br'} (${r.x},${r.y}) ${r.cw}×${r.ch}，${r.from}s 起`);
      cur = dst;
    }
    master = cur;
  }
  if (master !== outClip) fs.copyFileSync(master, outClip);
  return outClip;
}

module.exports = { W, H, FPS, probe, normalize, segments, readClips, writeClips, buildClipMaster, clipsFile, clipDir, paper, concatCopy, concatReencode };
