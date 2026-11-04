import {readFile,writeFile,rename} from 'node:fs/promises';
import {embeddedObjects,findObject,normalizeSession,image,officialNationality} from './lib/f2-source.mjs';
const year=Number(process.argv.find(value=>/^20\d\d$/.test(value))||new Date().getUTCFullYear());
const base='https://www.fiaformula2.com',output=new URL('../f2-data.json',import.meta.url),now=new Date();
async function request(url,headers={}) {
    let error;
    for(let attempt=0;attempt<3;attempt++)try {const response=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response;}catch(cause){error=cause;}
    throw error;
}
const html=await(await request(`${base}/en/standings/${year}/drivers`)).text();
const driverSource=findObject(embeddedObjects(html),value=>Array.isArray(value.meetings)&&Array.isArray(value.standings)&&value.category==='Driver');
const teamsHtml=await(await request(`${base}/en/standings/${year}/teams`)).text();
const teamSource=findObject(embeddedObjects(teamsHtml),value=>Array.isArray(value.standings)&&value.category==='Team');
if(!driverSource?.meetings?.length||!driverSource.standings.length||!teamSource?.standings?.length||driverSource.meetings.some(meeting=>!meeting.meetingStartDate?.startsWith(String(year))))throw new Error('Current F2 season unavailable; retained saved data');
let previous;try{previous=JSON.parse(await readFile(output,'utf8'));}catch{}
const previousRaces=previous?.season===year?previous.races:[];
const races=driverSource.meetings.map((meeting,index)=>({id:String(meeting.meetingKey),round:index+1,name:`${meeting.meetingLocation} · ${meeting.meetingCountryName}`,location:meeting.meetingLocation,country:meeting.meetingCountryName,startDate:meeting.meetingStartDate,endDate:meeting.meetingEndDate,url:base+meeting.url,sessions:[]}));
let next=0;const failures=[];
await Promise.all(Array.from({length:3},async()=>{while(next<races.length){const race=races[next++];try{
    const page=await(await request(race.url)).text();
    const detail=findObject(embeddedObjects(page),value=>Array.isArray(value.meetingSessions));
    if(!detail||String(detail.meetingKey)!==race.id)throw new Error('Unexpected race metadata');
    race.circuit=detail.circuitOfficialName||detail.circuitShortName;race.officialName=detail.meetingOfficialName;race.image=image(detail.circuitImage);race.sessions=[];
    const publicKey=page.replace(/\\"/g,'"').match(/"key":\{"public":"([^"]+)"/)?.[1];
    const weekendIdentities=new Map();
    for(const item of detail.meetingSessions)for(const row of item.results||[])if(row.driverReference)weekendIdentities.set(String(row.racingNumber),row);
    for(const session of detail.meetingSessions){
        const cached=previousRaces?.find(item=>item.id===race.id)?.sessions?.find(item=>item.id===session.value);
        if(session.state==='completed'&&cached?.results?.length&&!process.argv.includes('--refresh-all')&&Date.parse(cached.updatedAt)>now.getTime()-7*86400000){race.sessions.push(cached);continue;}
        let data=session;
        if(!session.results?.length&&session.state==='completed')try{
            if(!publicKey||!/^f2\/(practice|qualifying|race)\?meeting=\d+&session=\d+$/.test(session.value))throw new Error('Result endpoint not published');
            const payload=await(await request(`https://api.formula1.com/v2/core-fom-results/${session.value}`,{apikey:publicKey})).json();
            if(Number(payload.year)!==year)throw new Error('Unexpected result season');
            data={...session,...payload.sessionResults};
        }catch(error){failures.push(`R${race.round} ${session.shortName}`);if(cached){race.sessions.push({...cached,refreshFailed:true});continue;}}
        for(const row of data.results||[])if(row.driverReference)weekendIdentities.set(String(row.racingNumber),row);
        data={...data,results:(data.results||[]).map(row=>({...weekendIdentities.get(String(row.racingNumber)),...row}))};
        const normalized=normalizeSession({...data,value:session.value});normalized.updatedAt=now.toISOString();race.sessions.push(normalized);
    }
}catch(error){console.error(`F2 R${race.round}: ${error.message}`);failures.push(`R${race.round}`);const cached=previousRaces?.find(item=>item.id===race.id);if(cached){Object.assign(race,cached,{refreshFailed:true});}}}}));
const identities=new Map();for(const race of races)for(const session of race.sessions)for(const row of session.results)if(row.driverId)identities.set(row.driverId,row);
const drivers=driverSource.standings.map(row=>({id:row.driverReference,name:`${row.driverFirstName} ${row.driverLastName}`,rank:Number(row.displayPosition),points:Number(row.championshipPoints),...Object.fromEntries(['teamId','teamName','driverImage','teamImage','number'].map(key=>[key,identities.get(row.driverReference)?.[key]||null]))}));
let nextDriver=0;
await Promise.all(Array.from({length:3},async()=>{while(nextDriver<drivers.length){const driver=drivers[nextDriver++],path=identities.get(driver.id)?.driverPageUrl;const old=previous?.season===year?previous.drivers.find(row=>row.id===driver.id):null;
    if(old?.flagUrl&&!process.argv.includes('--refresh-all')){Object.assign(driver,{flagUrl:old.flagUrl,nationality:old.nationality,countryCode:old.countryCode,nationalitySource:old.nationalitySource});continue;}
    if(!path?.startsWith('/en/drivers/'))continue;
    try{const profile=await(await request(base+path)).text();const flag=officialNationality(profile);if(flag)Object.assign(driver,flag,{nationalitySource:base+path});}catch{}
}}));
const nationalities=new Map(drivers.map(driver=>[driver.id,driver]));
for(const race of races)for(const session of race.sessions)for(const row of session.results){const driver=nationalities.get(row.driverId);if(driver?.flagUrl)Object.assign(row,{flagUrl:driver.flagUrl,nationality:driver.nationality,countryCode:driver.countryCode});}
const teams=teamSource.standings.map(row=>({id:String(row.teamKey),name:row.teamName,rank:Number(row.displayPosition),points:Number(row.championshipPoints),teamImage:image(row.teamLogoImage)}));
const data={season:year,updatedAt:now.toISOString(),source:{name:'FIA Formula 2',url:`${base}/en/racing/${year}`,drivers:`${base}/en/standings/${year}/drivers`,teams:`${base}/en/standings/${year}/teams`},coverage:{complete:failures.length===0,failed:failures},races,drivers,teams};
const temp=new URL('../f2-data.json.tmp',import.meta.url);await writeFile(temp,JSON.stringify(data,null,2)+'\n');await rename(temp,output);
console.log(`F2 ${year}: ${races.length} rounds, ${races.flatMap(r=>r.sessions).filter(s=>s.results.length).length} classified sessions, ${drivers.length} drivers, ${teams.length} teams; ${failures.length} unavailable selections`);
if(failures.length)process.exitCode=1;
