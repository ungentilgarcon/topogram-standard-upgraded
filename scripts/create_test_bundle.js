const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');

async function main(){
  const wd = path.resolve(__dirname, '..');
  const baseDir = '/tmp/topogram-exports';
  await fsp.mkdir(baseDir, { recursive: true });
  const name = 'test-bundle-verify-' + Date.now();
  const testDir = path.join(baseDir, name);
  await fsp.rm(testDir, { recursive: true, force: true });
  await fsp.mkdir(path.join(testDir, 'presentation'), { recursive: true });
  await fsp.mkdir(path.join(testDir, 'data'), { recursive: true });

  // copy presentation-template
  const srcPres = path.join(wd, 'mapappbuilder', 'presentation-template');
  async function copyDir(src, dest){
    const entries = await fsp.readdir(src, { withFileTypes: true });
    await fsp.mkdir(dest, { recursive: true });
    for (const e of entries){
      const srcp = path.join(src, e.name);
      const destp = path.join(dest, e.name);
      if (e.isDirectory()) await copyDir(srcp, destp);
      else await fsp.copyFile(srcp, destp);
    }
  }
  await copyDir(srcPres, path.join(testDir, 'presentation'));

  // write data/topogram.json
  const data = { nodes:[{id:1,label:'A',lat:48.8566,lon:2.3522},{id:2,label:'B',lat:51.5074,lon:-0.1278}], edges:[{from:1,to:2}] };
  await fsp.writeFile(path.join(testDir, 'data','topogram.json'), JSON.stringify(data, null, 2));
  // config
  await fsp.writeFile(path.join(testDir, 'config.json'), JSON.stringify({ title: 'Verify Topogram', networkOptions:{} }, null, 2));
  // server.js
  const serverJs = `const express=require('express');\nconst path=require('path');\nconst app=express();\napp.use('/data',express.static(path.join(__dirname,'data')));\napp.use('/',express.static(path.join(__dirname,'presentation')));\napp.get('/health',(req,res)=>res.send('OK'));\nconst port=process.env.PORT||3000;\napp.listen(port,()=>console.log('listening on port '+port));\n`;
  await fsp.writeFile(path.join(testDir,'server.js'), serverJs);
  // package.json
  await fsp.writeFile(path.join(testDir,'package.json'), JSON.stringify({ name:'verify-topogram', version:'0.0.1', private:true, scripts:{ start:'node server.js' }, dependencies:{ express:'^4.18.2' } }, null, 2));
  await fsp.writeFile(path.join(testDir,'README.md'), 'Verify bundle for automated tests\n');

  // zip it using system zip
  const zipPath = path.join(baseDir, name + '.zip');
  await new Promise((resolve, reject)=>{
    const proc = spawn('zip', ['-r', zipPath, name], { cwd: baseDir, stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('close', (code)=> code===0 ? resolve() : reject(new Error('zip exited '+code)));
  });
  console.log('Created zip:', zipPath);
  process.exit(0);
}

main().catch(err=>{ console.error(err); process.exit(2); });
