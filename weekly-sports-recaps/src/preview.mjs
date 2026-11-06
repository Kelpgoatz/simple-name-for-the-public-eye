import http from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||8770);
const server=http.createServer(async(request,response)=>{
    try{
        const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);let target,type='application/json';
        if(pathname==='/'){target=resolve(root,'public/index.html');type='text/html; charset=utf-8';}
        else if(pathname==='/recaps.json')target=resolve(root,'public/recaps.json');
        else if(pathname==='/status.json'){
            const files=await readdir(resolve(root,'reports')).catch(()=>[]),latest=files.filter(file=>/^\d{4}-\d{2}-\d{2}\.json$/.test(file)).sort().at(-1);
            const body=latest?await readFile(resolve(root,'reports',latest),'utf8'):JSON.stringify({items:[]});response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(body);return;
        }else if(pathname.startsWith('/facts/')||pathname.startsWith('/drafts/')){
            const folder=pathname.startsWith('/facts/')?'facts':'drafts',base=resolve(root,folder);target=resolve(base,pathname.slice(folder.length+2));
            if(!target.startsWith(base+sep)||!target.endsWith('.json'))throw new Error('Not found');
        }else throw new Error('Not found');
        const body=await readFile(target);response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'"});response.end(body);
    }catch{response.writeHead(404,{'Content-Type':'text/plain'});response.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Recap review preview: http://127.0.0.1:${port}`));
