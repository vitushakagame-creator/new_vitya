const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'site-data.json');
const PORT = process.env.PORT || 3000;
fs.mkdirSync(DATA, { recursive: true });
for (const folder of ['Mini-Videos', 'Programs', 'Materials']) fs.mkdirSync(path.join(PUBLIC, folder), { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({codes:{},posts:[{id:'welcome',type:'news',author:'Vitya News 2В',role:'Новости',text:'Добро пожаловать! Здесь будут появляться новости о Вите. Можешь опубликовать свою первую запись после входа.',createdAt:new Date().toISOString()}],messages:[]},null,2));
function readDB(){try{return JSON.parse(fs.readFileSync(DB_FILE,'utf8'));}catch{return {codes:{},posts:[],messages:[]};}}
function writeDB(db){fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));}
function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(type.startsWith('application/json')?JSON.stringify(body):body);}
const sessions=new Map();
function getSession(req){const id=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('vitya_session='))?.split('=')[1];return id&&sessions.get(id);}
function requireUser(req,res){const user=getSession(req);if(!user){send(res,401,{error:'Сначала войди на сайт по коду доступа.'});return null;}return user;}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.m4v':'video/mp4','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf','.zip':'application/zip','.exe':'application/octet-stream','.py':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
function walk(dir,base){let out=[];if(!fs.existsSync(dir))return out;for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,ent.name);if(ent.isDirectory())out=out.concat(walk(full,base));else if(ent.isFile()&&!ent.name.startsWith('.'))out.push({name:ent.name,full,rel:path.relative(base,full).split(path.sep).join('/')});}return out;}
function fileUrl(folder,rel){return '/public/'+encodeURIComponent(folder).replace(/%2F/gi,'/')+'/'+rel.split('/').map(encodeURIComponent).join('/');}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/api/state'){const db=readDB();return send(res,200,{posts:db.posts,messages:db.messages,user:getSession(req)||null});}
 if(req.method==='GET'&&url.pathname==='/api/videos'){const files=walk(path.join(PUBLIC,'Mini-Videos'),path.join(PUBLIC,'Mini-Videos')).filter(f=>['.mp4','.webm','.mov','.m4v'].includes(path.extname(f.name).toLowerCase()));return send(res,200,files.map(f=>({title:path.parse(f.name).name,description:'Мини-видосик',src:fileUrl('Mini-Videos',f.rel)})));}
 if(req.method==='GET'&&url.pathname==='/api/programs'){const files=walk(path.join(PUBLIC,'Programs'),path.join(PUBLIC,'Programs'));return send(res,200,files.map(f=>({title:f.name,src:fileUrl('Programs',f.rel),size:formatSize(fs.statSync(f.full).size),kind:path.extname(f.name).slice(1).toUpperCase()||'ФАЙЛ',icon:iconFor(f.name)})));}
 if(req.method==='POST'&&url.pathname==='/api/login'){let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{try{const body=JSON.parse(raw||'{}');const code=String(body.code||'').trim().toUpperCase();const nickname=String(body.nickname||'').trim().slice(0,32);const role=String(body.role||'Другой пользователь').slice(0,80);if(!code||!nickname)return send(res,400,{error:'Укажи ник и код доступа.'});const db=readDB();if(db.codes[code]){const profile=db.codes[code];if(profile.nickname!==nickname||profile.role!==role)return send(res,403,{error:'Этот код уже закреплён за другим профилем. Проверь ник и роль.'});}else{if(code.length<4)return send(res,400,{error:'Код доступа должен содержать не менее 4 символов.'});db.codes[code]={nickname,role};writeDB(db);}const user={nickname,role};const sid=crypto.randomBytes(24).toString('hex');sessions.set(sid,user);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Set-Cookie':`vitya_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,'Cache-Control':'no-store'});res.end(JSON.stringify({user}));}catch{return send(res,400,{error:'Не удалось обработать запрос.'});}});return;}
 if(req.method==='POST'&&(url.pathname==='/api/message'||url.pathname==='/api/post')){const user=requireUser(req,res);if(!user)return;let raw='';req.on('data',c=>{raw+=c;if(raw.length>20000)req.destroy();});req.on('end',()=>{try{const body=JSON.parse(raw||'{}');const text=String(body.text||'').trim().slice(0,2000);if(!text)return send(res,400,{error:'Сначала напиши сообщение.'});const db=readDB();const item={id:crypto.randomUUID(),author:user.nickname,role:user.role,text,createdAt:new Date().toISOString(),type:url.pathname==='/api/post'?String(body.type||'новость'):'сообщение'};if(url.pathname==='/api/post')db.posts.unshift(item);else db.messages.push(item);writeDB(db);return send(res,201,{item});}catch{return send(res,400,{error:'Не удалось сохранить запись.'});}});return;}
 if(req.method==='GET'){
  let pathname=decodeURIComponent(url.pathname);let target;
  if(pathname==='/')target=path.join(ROOT,'index.html');
  else if(['/index.html','/style.css','/app.js'].includes(pathname))target=path.join(ROOT,pathname.slice(1));
  else if(pathname.startsWith('/public/')){const rel=pathname.slice('/public/'.length);target=path.resolve(PUBLIC,rel);if(!(target===PUBLIC||target.startsWith(PUBLIC+path.sep)))return send(res,403,'Доступ запрещён','text/plain; charset=utf-8');}
  else return send(res,404,'Файл не найден','text/plain; charset=utf-8');
  fs.stat(target,(err,stat)=>{if(err||!stat.isFile())return send(res,404,'Файл не найден','text/plain; charset=utf-8');const ext=path.extname(target).toLowerCase();res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});fs.createReadStream(target).pipe(res);});return;
 }
 send(res,405,{error:'Метод не поддерживается.'});
});
function formatSize(n){if(n<1024)return n+' Б';if(n<1048576)return (n/1024).toFixed(1)+' КБ';return (n/1048576).toFixed(1)+' МБ';}
function iconFor(name){const ext=path.extname(name).toLowerCase();return ({'.exe':'🖥️','.msi':'🧩','.zip':'🗜️','.py':'🐍','.html':'🌐','.pdf':'📕','.txt':'📝','.png':'🖼️','.jpg':'🖼️'})[ext]||'📦';}
server.listen(PORT,()=>console.log(`Vitya News 2В запущен: http://localhost:${PORT}`));
