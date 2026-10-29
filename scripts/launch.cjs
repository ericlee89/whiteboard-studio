const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
process.chdir(path.join(__dirname,'..'));
function run(exe,args){const r=cp.spawnSync(exe,args,{stdio:'inherit',shell:process.platform==='win32'});if(r.status!==0){console.error('启动未完成：'+exe+' '+args.join(' '));process.exit(r.status||1);}}
for(const exe of ['node',process.platform==='win32'?'python':'python3','ffmpeg','ffprobe']){
 const r=cp.spawnSync(exe,exe==='ffmpeg'||exe==='ffprobe'?['-version']:['--version'],{stdio:'ignore'});
 if(r.status!==0){console.error('请先安装运行依赖：'+exe);process.exit(1);}
}
if(!fs.existsSync('node_modules/@agent-native/core'))run('pnpm',['install']);
if(!fs.existsSync('engine/node_modules/playwright')){
 run('npm',['--prefix','engine','ci','--ignore-scripts']);
 run('npx',['--prefix','engine','playwright','install','chromium']);
}
const py=process.platform==='win32'?'python':'python3';
const tts=cp.spawnSync(py,['-c','import edge_tts'],{stdio:'ignore'});
if(tts.status!==0)run(py,['-m','pip','install','edge-tts']);
run('pnpm',['exec','agent-native','dev','--host','127.0.0.1','--port','4317','--open']);
