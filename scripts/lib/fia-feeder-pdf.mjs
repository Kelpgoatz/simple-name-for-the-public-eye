import {fileURLToPath} from 'node:url';
import {enrichRows} from './fia-feeder-classifications.mjs';
const plain=text=>String(text||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const norm=text=>String(text||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function classificationItems(items,type='Race') {
    const lines=[];
    for(const item of items.filter(item=>item.str?.trim())){
        const x=item.transform[4],y=item.transform[5];let line=lines.find(line=>Math.abs(line.y-y)<2);
        if(!line){line={y,items:[]};lines.push(line);}line.items.push({text:item.str.trim(),x});
    }
    lines.sort((a,b)=>b.y-a.y);for(const line of lines)line.items.sort((a,b)=>a.x-b.x);
    const header=lines.find(line=>line.items.some(item=>item.text==='NO')&&line.items.some(item=>item.text==='DRIVER')&&line.items.some(item=>item.text==='FASTEST'||item.text==='TIME'));
    if(!header)return [];
    const column=name=>header.items.find(item=>item.text===name)?.x;
    const no=column('NO'),driver=column('DRIVER'),team=header.items.find(item=>/TEAM/.test(item.text))?.x;
    const fastest=type==='Race'?column('FASTEST'):column('TIME'),on=column('ON');
    if(![no,driver,team,fastest].every(Number.isFinite))return [];
    const records=[];
    for(const line of lines.filter(line=>line.y<header.y-3)){
        if(line.items.some(item=>/OVERALL FASTEST|FASTEST LAP ELIGIBLE/.test(item.text)))break;
        const number=line.items.find(item=>item.x>=no-3&&item.x<driver-3&&/^\d{1,3}$/.test(item.text))?.text;
        const name=line.items.filter(item=>item.x>=driver-2&&item.x<team-3).map(item=>item.text).join(' ');
        const lap=line.items.find(item=>Math.abs(item.x-fastest)<12&&/^\d+:\d{2}\.\d+$/.test(item.text))?.text;
        const lapNumber=on==null?'':line.items.find(item=>Math.abs(item.x-on)<5&&/^\d+$/.test(item.text))?.text;
        if(number&&name&&lap)records.push({Nr:number,Driver:name,'Best lap':lap,'Best lap lap':lapNumber||''});
    }
    return records;
}
export async function pdfRecords(bytes,type){
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true,standardFontDataUrl:fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url)).replace(/\\/g,'/')});
    // Resolve from this module's actual scripts/lib location, independent of cwd.
    try{const doc=await task.promise;const records=[];for(let i=1;i<=Math.min(doc.numPages,4);i++){const content=await(await doc.getPage(i)).getTextContent();records.push(...classificationItems(content.items,type));}return [...new Map(records.map(record=>[record.Nr,record])).values()];}finally{await task.destroy();}
}
export function classificationPdfLinks(html,session,sessions){
    const paths=[...new Set([...html.matchAll(/href="([^"]+\.pdf)"/gi)].map(match=>match[1].replace(/&amp;/g,'&')))];
    const candidates=paths.filter(path=>/classification/i.test(path)&&!/(grid|laptimes|deleted|amendment)/i.test(path));
    const label=norm(session.label);
    return candidates.filter(path=>{
        const name=norm(decodeURIComponent(path.split('/').at(-1)));
        if(session.type==='Practice')return name.includes('practice');
        if(session.type==='Qualifying')return name.includes('qualifying')&&(sessions.filter(item=>item.type==='Qualifying').length===1||!/(groupa|groupb|qualifying1|qualifying2)/.test(name)||name.includes(label));
        if(label.includes('sprint'))return name.includes('sprintrace');
        if(label.includes('feature'))return name.includes('featurerace')&&(sessions.filter(item=>/feature/i.test(item.label)).length===1||name.includes(label));
        return false;
    }).sort((a,b)=>Number(/provisional/i.test(a))-Number(/provisional/i.test(b)));
}
export async function enrichFiaPdfSeason(data,{series='f2',fetcher=fetch,refreshAll=false}={}){
    const root='https://www.fia.com',competition=series==='f3'?'fia-formula-3-championship':'formula-2-championship',prefix=`/events/${competition}/season-${data.season}/`;
    const report=async url=>{const response=await fetcher(url,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error(`HTTP ${response.status}`);return response;};
    let index;try{index=await(await report(root+prefix+'fia-formula-'+(series==='f3'?'3':'2'))).text();}catch{return data;}
    const events=[...new Set([...index.matchAll(/href="([^"]+)"/g)].map(match=>match[1]).filter(path=>path.startsWith(prefix)||path.startsWith('/championship'+prefix)).map(path=>path.slice(path.indexOf(prefix)+prefix.length).split('/')[0]))];
    const aliases={miamigardens:'miami',barcelona:'barcelonacatalunya',montecarlo:'monaco',spa:'spafrancorchamps'};
    const unavailable=[];let count=0;
    for(const race of data.races||[]){
        const needed=(race.sessions||[]).filter(session=>session.results?.length&&session.results.filter(row=>row.bestLap).length<session.results.length&&(refreshAll||!session.pdfTimingCheckedAt||Date.now()-Date.parse(session.pdfTimingCheckedAt)>7*86400000));
        if(!needed.length)continue;
        const name=norm(new URL(race.url).pathname.split('/').filter(Boolean).at(-1)),event=events.find(event=>norm(event)===(aliases[name]||name));if(!event)continue;
        let html;try{html=await(await report(root+prefix+event+'/eventtiming-information')).text();}catch{continue;}
        for(const session of needed){
            const paths=classificationPdfLinks(html,session,race.sessions);if(paths.length!==1&&!(paths.length>1&&!/provisional/i.test(paths[0])))continue;
            const url=new URL(paths[0],root);if(url.hostname!=='www.fia.com'||!url.pathname.includes(String(data.season))||!new RegExp(`_${series}_|-${series}-`,'i').test(url.pathname))continue;
            try{const records=await pdfRecords(await(await report(url.href)).arrayBuffer(),session.type);const enriched=enrichRows(session,records,url.href);
                const present=new Map(enriched.results.map(row=>[row.driverId,row]));let additions=0;
                session.results=session.results.map(row=>{const extra=present.get(row.driverId);if(!row.bestLap&&extra?.bestLap){additions++;return {...row,bestLap:extra.bestLap,bestLapNumber:extra.bestLapNumber,timingSource:url.href};}return row;});
                session.pdfTimingCheckedAt=new Date().toISOString();
                if(additions){const valid=session.results.filter(row=>row.bestLap).sort((a,b)=>{const sec=t=>t.split(':').reduce((x,y)=>60*x+Number(y),0);return sec(a.bestLap)-sec(b.bestLap);});session.fastestLap={driverId:valid[0].driverId,time:valid[0].bestLap,lap:valid[0].bestLapNumber};session.timingSource||=url.href;session.pdfTimingSource=url.href;session.pdfTimingCoverage={matched:additions,total:session.results.length};session.timingCoverage={matched:valid.length,total:session.results.length};count++;}
            }catch(error){unavailable.push({round:race.round,session:session.label,reason:error.message});}
        }
    }
    data.pdfTimingCoverage={enrichedSessions:count,unavailable};if(data.timingCoverage)data.timingCoverage.availableSessions=(data.races||[]).flatMap(race=>race.sessions||[]).filter(session=>session.results?.some(row=>row.bestLap)&&session.timingSource).length;return data;
}
