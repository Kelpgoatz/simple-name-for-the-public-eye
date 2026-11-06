import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {buildFacts} from './facts.mjs';

export const SPORTS=['afl','aflw','f1','f2','f3','nrl','nrlw','nba','wnba','nbl','nfl','tennis'];
const files={aflFixtures:'afl-fixtures.json',aflPlayerStats:'sports-data/afl-players.json',f1Fixtures:'f1-fixtures.json',f1Sessions:'f1-sessions.json',f1Drivers:'drivers-championship.json',f1Constructors:'constructors-championship.json',f2:'f2-data.json',f3:'f3-data.json'};
export function pathsFor(sport){
    if(sport==='afl')return {aflFixtures:files.aflFixtures,aflPlayerStats:files.aflPlayerStats};
    if(sport==='f1')return Object.fromEntries(Object.entries(files).filter(([key])=>key.startsWith('f1')));
    if(sport==='f2'||sport==='f3')return {[sport]:files[sport]};
    return {generic:`sports-data/${sport}.json`,...(sport==='tennis'?{}:{players:`sports-data/${sport}-players.json`})};
}
export async function collectSport(sport,window,{config,sourceDir,fetchImpl=fetch,now=new Date().toISOString()}={}){
    if(!SPORTS.includes(sport))throw new Error('Unknown competition');
    const repository=config?.sourceRepository||'Kelpgoatz/simple-name-for-the-public-eye',branch=process.env.SOURCE_REVISION||config?.sourceBranch||'main';
    if(!/^[\w.-]+\/[\w.-]+$/.test(repository)||!branch||/[\r\n?#]/.test(branch))throw new Error('Invalid source repository or branch');
    const base=`https://raw.githubusercontent.com/${repository}/${encodeURIComponent(branch)}/`;
    const snapshots={},errors=[];
    await Promise.all(Object.entries(pathsFor(sport)).map(async([key,file])=>{
        try{
            let content;
            if(sourceDir){const root=resolve(sourceDir),target=resolve(root,file);if(!target.startsWith(root+sep))throw new Error('Invalid source path');content=await readFile(target,'utf8');}
            else{const response=await fetchImpl(base+file,{headers:{'User-Agent':'cgrillo-weekly-recaps/1.0',Accept:'application/json'},signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);content=await response.text();}
            if(Buffer.byteLength(content)>35*1024*1024)throw new Error('Source snapshot exceeds the size limit');snapshots[key]=JSON.parse(content);
        }catch(error){errors.push({key,file,reason:error.code==='ENOENT'?'Snapshot unavailable':/^HTTP \d{3}$/.test(error.message)?error.message:'Snapshot unavailable or invalid'});}
    }));
    const facts=buildFacts(sport,snapshots,window,{sourceBaseUrl:base,maxEvents:config?.maxEvents||200,retrievedAt:now});
    facts.coverage.sourceErrors=errors;
    const maxBytes=config?.maxFactsBytes||180000;
    if(Buffer.byteLength(JSON.stringify(facts))>maxBytes){facts.coverage.status='unavailable';facts.coverage.reason='The weekly facts exceed the configured input budget; review the coverage before increasing it.';}
    return facts;
}
