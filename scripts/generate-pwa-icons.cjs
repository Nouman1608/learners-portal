const fs = require('node:fs');
const path = require('node:path');
const sharp = require('../frontend/node_modules/sharp');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../frontend/public');
(async () => {
  for (const [key, name, shortName, logo, theme] of [
    ['la', 'Learners Academy', 'Learners', 'logo.svg', '#3F548D'],
    ['lp', 'Learners Preschool', 'Preschool', 'brand/learners-preschool.png', '#3F548D'],
    ['mb', 'Marlbridge', 'Marlbridge', 'brand/marlbridge-emblem-cream.png', '#0B1F3A'],
  ]) {
    const dir = path.join(root, 'pwa', key);
    fs.mkdirSync(dir, { recursive: true });
    const iconFiles = {};
    for (const [size, box, file] of [[192,150,'icon-192.png'],[512,400,'icon-512.png'],[512,280,'maskable-512.png'],[180,140,'apple-180.png']]) {
      const art = await sharp(path.join(root, logo), { density: 300 }).resize(box, box, { fit: 'inside' }).png().toBuffer();
      const output = await sharp({ create: { width:size,height:size,channels:4,background:'#ffffff' } }).composite([{input:art,gravity:'centre'}]).png().toBuffer();
      const version = createHash('sha256').update(output).digest('hex').slice(0,10);
      const name = file === 'apple-180.png' ? file : file.replace('.png', `-${version}.png`);
      fs.writeFileSync(path.join(dir,name), output);
      iconFiles[file] = name;
      if (name !== file && fs.existsSync(path.join(dir,file))) fs.unlinkSync(path.join(dir,file));
    }
    const manifest = { id:'/', name, short_name:shortName, description:`${name} student, teacher and staff portal`, start_url:'/', scope:'/', display:'standalone', background_color:'#ffffff',theme_color:theme, prefer_related_applications:false,
      icons:[{src:`/pwa/${key}/${iconFiles['icon-192.png']}`,sizes:'192x192',type:'image/png',purpose:'any'},{src:`/pwa/${key}/${iconFiles['icon-512.png']}`,sizes:'512x512',type:'image/png',purpose:'any'},{src:`/pwa/${key}/${iconFiles['maskable-512.png']}`,sizes:'512x512',type:'image/png',purpose:'maskable'}] };
    fs.writeFileSync(path.join(dir,'manifest.json'), JSON.stringify(manifest,null,2)+'\n');
  }
  const chooser=JSON.parse(fs.readFileSync(path.join(root,'pwa/la/manifest.json')));
  chooser.name='Learners Portal';chooser.short_name='Portal';chooser.description='Choose your school portal';
  fs.mkdirSync(path.join(root,'pwa/portal'),{recursive:true});
  fs.writeFileSync(path.join(root,'pwa/portal/manifest.json'),JSON.stringify(chooser,null,2)+'\n');
  console.log('Generated school manifests and install icons');
})().catch(error=>{console.error(error);process.exitCode=1});
