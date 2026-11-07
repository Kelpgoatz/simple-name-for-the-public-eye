const root='https://www.fia.com';
const decode=text=>String(text||'').replace(/&amp;/g,'&').replace(/&#039;|&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;|&#160;/g,' ').replace(/&eacute;/g,'é');
const plain=text=>decode(String(text||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const norm=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const recordedLap = value => /^\d+:\d{2}\.\d+$/.test(value || '');
const lapSeconds = time => time.split(':').reduce((total, part) => total * 60 + Number(part), 0);
function fastestLap(results) {
    const fastest = results.filter(row => recordedLap(row.bestLap)).sort((a, b) => lapSeconds(a.bestLap) - lapSeconds(b.bestLap))[0];
    return fastest ? { driverId: fastest.driverId, time: fastest.bestLap, lap: fastest.bestLapNumber } : null;
}
export function keepSavedTiming(data, previous) {
    if (previous?.season !== data.season) return;
    for (const race of data.races) {
        const savedRace = previous.races?.find(old => old.id === race.id);
        for (const session of race.sessions) {
            const saved = savedRace?.sessions.find(old => old.id === session.id && old.startTime === session.startTime);
            if (session.state !== 'completed' || !session.startTime || !saved?.timingSource || saved.state !== 'completed') continue;
            const savedRows = new Map(saved.results.filter(row => row.driverId && recordedLap(row.bestLap)).map(row => [row.driverId, row]));
            let retained = 0;
            session.results = session.results.map(row => {
                const old = savedRows.get(row.driverId);
                if (row.bestLap || row.timingSource || !old || old.number !== row.number) return row;
                retained++;
                return { ...row, bestLap: old.bestLap, bestLapNumber: old.bestLapNumber, timingSource: old.timingSource || saved.timingSource };
            });
            if (!retained) continue;
            session.timingRetained = retained;
            session.timingSource ||= saved.timingSource;
            if (saved.pdfTimingSource) session.pdfTimingSource ||= saved.pdfTimingSource;
            session.fastestLap = fastestLap(session.results);
            session.timingCoverage = { matched: session.results.filter(row => row.timingSource).length, total: session.results.length };
        }
    }
    if (data.timingCoverage) {
        data.timingCoverage.availableSessions = data.races.flatMap(race => race.sessions)
            .filter(session => session.timingSource && session.results.some(row => recordedLap(row.bestLap))).length;
    }
}
export function canReuseSession(session,cached,now=Date.now()){
    const started=Date.parse(cached?.startTime),updated=Date.parse(cached?.updatedAt);
    return session.state==='completed'&&Boolean(cached?.results?.length)&&Number.isFinite(started)&&now-started>72*3600000&&Number.isFinite(updated)&&now-updated<7*86400000;
}
export function parseClassification(html){
    for(const table of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)){
        const rows=[...table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
        const headers=rows.map(row=>[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>plain(cell[1])));
        const first=headers.findIndex(cells=>cells.includes('Nr')&&cells.includes('Driver')&&cells.includes('Best lap'));
        if(first<0)continue;
        const keys=headers[first];
        return rows.slice(first+1).map((row,index)=>{
            const raw=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>cell[1]);
            const values=headers[first+index+1]||[];const record=Object.fromEntries(keys.map((key,i)=>[key,values[i]||'']));
            const driverRaw=raw[keys.indexOf('Driver')]||'';
            record.Driver=plain(driverRaw.match(/class="name"[^>]*>([\s\S]*?)<\/div>/)?.[1]||record.Driver);
            return record;
        }).filter(record=>/^\d+$/.test(record.Nr));
    }
    return [];
}
export function enrichRows(session,classification,url){
    const cars=new Map(classification.map(row=>[String(Number(row.Nr)),row]));let matched=0;
    const results=(session.results||[]).map(row=>{
        const record=cars.get(String(Number(row.number)));if(!record)return row;
        const driverWords=String(row.name||'').trim().split(/\s+/);const last=norm(driverWords.at(-1));
        if(!last||!norm(record.Driver).endsWith(last))return row;
        matched++;
        const lap=recordedLap(record['Best lap'])?record['Best lap']:null;
        return {...row,...(lap?{bestLap:lap,bestLapNumber:Number(record['Best lap lap'])||null}:{}),gap:row.gap??record['Gap first'],interval:row.interval??record['Gap previous'],timingSource:url};
    });
    return {...session,results,timingSource:url,timingCoverage:{matched,total:results.length},fastestLap:fastestLap(results)};
}
function links(html,prefix){return [...new Set([...html.matchAll(/href="([^"]+)"/g)].map(match=>decode(match[1])).filter(path=>path.startsWith(prefix)&&/classification$/.test(path)))];}
const request=async(url,fetcher)=>{const response=await fetcher(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`FIA HTTP ${response.status}`);return response.text();};
export async function enrichFiaSeason(data,{series='f2',refreshAll=false,fetcher=fetch}={}){
    const competition=series==='f3'?'fia-formula-3-championship':'formula-2-championship',prefix=`/events/${competition}/season-${data.season}/`;
    const indexUrl=`${root}${prefix}fia-formula-${series==='f3'?'3':'2'}`;
    let index;try{index=await request(indexUrl,fetcher);}catch(error){data.timingCoverage={source:indexUrl,note:error.message};return data;}
    const events=[...new Set([...index.matchAll(/href="([^"]+)"/g)].map(match=>decode(match[1])).filter(path=>path.startsWith(prefix)||path.startsWith('/championship'+prefix)).map(path=>path.slice(path.indexOf(prefix)+prefix.length).split('/')[0]))];
    const aliases={barcelona:'barcelonacatalunya',montecarlo:'monaco',spa:'spafrancorchamps',miamigardens:'miami'};
    let next=0,matched=0,expected=0;const unavailable=[];
    await Promise.all(Array.from({length:3},async()=>{while(next<(data.races||[]).length){const race=data.races[next++];
        const needs=(race.sessions||[]).some(session=>session.results?.length&&(refreshAll||!session.timingCoverage));if(!needs)continue;
        const raw=new URL(race.url).pathname.split('/').filter(Boolean).at(-1),names=[norm(raw),norm(race.location)];
        const event=events.find(event=>names.some(name=>norm(event)===(aliases[name]||name)));
        if(!event){unavailable.push(`R${race.round}`);continue;}
        const base=`${prefix}${event}/`;let page;
        try{page=await request(root+base+'session-classifications',fetcher);}catch{unavailable.push(`R${race.round}`);continue;}
        const actualLinks=links(page,base);
        for(let i=0;i<race.sessions.length;i++){
            const session=race.sessions[i];if(!session.results?.length||(!refreshAll&&session.timingCoverage))continue;
            expected++;
            const key=norm(session.label);
            const candidates=actualLinks.filter(path=>norm(path.split('/').at(-1).replace(/-(iii|ii|i)-classification$/,(_,roman)=>`-${{i:1,ii:2,iii:3}[roman]}-classification`).replace(/-classification$/,''))===key);
            const combinedQualifying=actualLinks.filter(path=>path.endsWith('/qualifying-classification'));
            const selected=candidates.length===1?candidates[0]:session.type==='Qualifying'&&combinedQualifying.length===1?combinedQualifying[0]:session.type==='Practice'?actualLinks.find(path=>path.endsWith('/session-classifications')):null;
            const url=root+(selected||base+'session-classifications');
            if(!selected&&session.type!=='Practice'){unavailable.push(`R${race.round} ${session.label}`);continue;}
            try{const html=selected?await request(root+selected,fetcher):page;const rows=parseClassification(html);const enriched=enrichRows(session,rows,url);if(enriched.timingCoverage.matched){race.sessions[i]=enriched;matched++;}else unavailable.push(`R${race.round} ${session.label}`);}catch{unavailable.push(`R${race.round} ${session.label}`);}
        }
    }}));
    const all=(data.races||[]).flatMap(race=>race.sessions||[]).filter(session=>session.results?.length);
    data.timingCoverage={source:indexUrl,availableSessions:all.filter(session=>session.timingCoverage?.matched>0).length,totalSessions:all.length,requestedSessions:expected,unavailable};return data;
}
