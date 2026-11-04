import {readFile,writeFile,rename} from 'node:fs/promises';
import {canonicalName,normalizeRaces,summarizeCareer} from './lib/f1-career-data.mjs';
const base='https://api.jolpi.ca/ergast/f1/';
const file=path=>new URL(`../${path}`,import.meta.url);
const read=async path=>{try{return JSON.parse(await readFile(file(path),'utf8'));}catch{return null;}};
const calendar=await read('f1-fixtures.json');
const season=Number(calendar?.season||new Date().getUTCFullYear());
const now=new Date(),refresh=process.argv.includes('--refresh-all');
const old=await read('f1-careers.json');
const cache=await read('sports-data/f1-career-cache.json')||{histories:{},championships:{}};
cache.histories||={};cache.championships||={};
let nextRequest=0;
async function request(path){
    const url=new URL(path,base);
    for(let attempt=0;attempt<3;attempt++){
        const delay=Math.max(0,nextRequest-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
        nextRequest=Date.now()+360;
        try{const response=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();if(!data.MRData)throw new Error('Invalid Jolpica response');return data;}
        catch(error){if(attempt===2)throw new Error(`${path}: ${error.message}`);await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));}
    }
}
async function racesFor(kind,id,prefix=''){
    const results=[];let offset=0,total;
    do{const data=await request(`${prefix}${kind==='driver'?'drivers':'constructors'}/${id}/results/?limit=100&offset=${offset}`);
        const page=normalizeRaces(data,kind,id);total=Number(data.MRData.total);if(!Number.isInteger(total)||total<0)throw new Error('Invalid historical result count');
        if(!page.length&&offset<total)throw new Error('Incomplete historical pagination');results.push(...page);offset+=page.length;
    }while(offset<total);
    return results;
}
const drivers=await request(`${season}/drivers/?limit=100`),teams=await request(`${season}/constructors/?limit=100`);
const sourceDrivers=drivers.MRData.DriverTable?.Drivers,sourceTeams=teams.MRData.ConstructorTable?.Constructors;
if(!Array.isArray(sourceDrivers)||!sourceDrivers.length||!Array.isArray(sourceTeams)||!sourceTeams.length)throw new Error('Current historical identifiers unavailable; keeping previous snapshot');
const driverSnapshot=await read('drivers-championship.json');
const sessions=await read('f1-sessions.json');
const localDrivers=new Map((driverSnapshot?.drivers_championship||[]).map(row=>[row.driverId,row.driver]));
for(const race of calendar?.races||[])for(const row of race.results||[])localDrivers.set(row.driverId,row.driver);
for(const weekend of Object.values(sessions?.races||{}))for(const session of Object.values(weekend.sessions||{}))for(const row of session.results||[])if(row.driver?.name)localDrivers.set(row.driverId,row.driver);
const entities=[];
for(const [id,driver] of localDrivers){const source=sourceDrivers.find(row=>row.driverId===id)||sourceDrivers.find(row=>canonicalName(`${row.givenName} ${row.familyName}`)===canonicalName(`${driver.name} ${driver.surname}`));if(source)entities.push({kind:'driver',id,sourceId:source.driverId,sourceName:`${source.givenName} ${source.familyName}`});}
for(const team of sourceTeams)entities.push({kind:'team',id:team.constructorId,sourceId:team.constructorId,sourceName:team.name});
const result={season,updatedAt:now.toISOString(),source:{name:'Jolpica F1',url:'https://api.jolpi.ca/ergast/f1/',documentation:'https://github.com/jolpica/jolpica-f1/tree/main/docs'},drivers:{},teams:{}};
const failures=[];
const seasonFinished=!!calendar?.races?.length&&calendar.races.every(race=>race.status==='CONCLUDED'&&race.results?.length&&Date.parse(race.startTime||race.date)<=now.getTime());
// Historical final standings are immutable in normal operation; cache by season.
for(let year=1950;year<=(seasonFinished?season:season-1);year++){
    for(const kind of ['driver','team']){
        if(kind==='team'&&year<1958)continue;
        const key=`${kind}:${year}`;if(cache.championships[key]&&!refresh)continue;
        try{const rows=[];let offset=0,total;do{const data=await request(`${year}/${kind==='driver'?'driverStandings':'constructorStandings'}/?limit=100&offset=${offset}`);const lists=data.MRData.StandingsTable?.StandingsLists;if(!Array.isArray(lists))throw new Error('Missing final standings');const page=lists.flatMap(list=>list[kind==='driver'?'DriverStandings':'ConstructorStandings']||[]);total=Number(data.MRData.total);if(!page.length&&offset<total)throw new Error('Incomplete final standings');rows.push(...page);offset+=page.length;}while(offset<total);cache.championships[key]=rows.map(row=>({id:kind==='driver'?row.Driver?.driverId:row.Constructor?.constructorId,season:year,position:Number(row.position),points:Number(row.points)}));}
        catch(error){failures.push(key);console.error(error.message);}
    }
    if(year%10===0){await writeFile(file('sports-data/f1-career-cache.json.tmp'),JSON.stringify(cache));await rename(file('sports-data/f1-career-cache.json.tmp'),file('sports-data/f1-career-cache.json'));console.log(`Historical championships cached through ${year}`);}
}
for(const entity of entities){
    const {kind,id,sourceId,sourceName}=entity,key=`${kind}:${sourceId}`,collection=kind==='driver'?'drivers':'teams';
    try{
        const previous=cache.histories[key];
        let rows;
        const cachedHistory=!refresh&&previous?.complete&&now.getTime()-Date.parse(previous.fullUpdatedAt||previous.updatedAt)<30*86400000;
        if(cachedHistory){rows=[...previous.results.filter(row=>row.season!==season),...await racesFor(kind,sourceId,`${season}/`)];}
        else rows=await racesFor(kind,sourceId);
        const standings=Object.entries(cache.championships).filter(([key])=>key.startsWith(`${kind}:`)).flatMap(([,rows])=>rows.filter(row=>row.id===sourceId));
        const missingYears=[...new Set(rows.map(row=>row.season))].filter(year=>year<season&&!(kind==='team'&&year<1958)&&!cache.championships[`${kind}:${year}`]);
        const career=summarizeCareer({kind,sourceId,sourceName,results:rows,standings,season,seasonFinished,updatedAt:now.toISOString(),source:`${base}${kind==='driver'?'drivers':'constructors'}/${sourceId}/results/`});
        career.complete=missingYears.length===0;career.missingChampionshipYears=missingYears;
        result[collection][id]=career;cache.histories[key]={complete:true,updatedAt:now.toISOString(),fullUpdatedAt:cachedHistory?previous.fullUpdatedAt||previous.updatedAt:now.toISOString(),results:rows};
        console.log(`${kind} ${id}: ${career.totals.starts} GP starts, ${career.totals.wins} wins, ${career.totals.titles} titles`);
    }catch(error){failures.push(key);console.error(`${key}: ${error.message}`);if(old?.[collection]?.[id])result[collection][id]={...old[collection][id],stale:true};}
}
if(!Object.keys(result.drivers).length||!Object.keys(result.teams).length)throw new Error('Historical import unavailable; retaining previous snapshot');
result.failures=failures;
await writeFile(file('sports-data/f1-career-cache.json.tmp'),JSON.stringify(cache));await rename(file('sports-data/f1-career-cache.json.tmp'),file('sports-data/f1-career-cache.json'));
await writeFile(file('f1-careers.json.tmp'),JSON.stringify(result,null,2)+'\n');await rename(file('f1-careers.json.tmp'),file('f1-careers.json'));
console.log(`Saved ${Object.keys(result.drivers).length} driver and ${Object.keys(result.teams).length} constructor careers; ${failures.length} source failures`);
if(failures.length)process.exitCode=1;
