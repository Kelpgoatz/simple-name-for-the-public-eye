export function embeddedObjects(html) {
    const text = [...html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)].map(match => { try { return JSON.parse(match[1])[1] || ''; } catch { return ''; } }).join('');
    return text.split('\n').flatMap(line => { try { const item=JSON.parse(line.slice(line.indexOf(':')+1)); return item && typeof item==='object' ? [item] : []; } catch { return []; } });
}
export function findObject(roots, predicate) {
    for (const value of roots) {
        if (!value || typeof value!=='object') continue;
        if (!Array.isArray(value) && predicate(value)) return value;
        const child=findObject(Object.values(value),predicate);
        if(child)return child;
    }
}
const num=value=>value!==''&&value!=null&&Number.isFinite(Number(value))?Number(value):null;
export const image = value => value?.public_id ? `https://res.cloudinary.com/prod-f2f3/c_fit,w_240,h_240/q_auto/${value.public_id}.webp` : null;
export function normalizeResult(row, race) {
    return {position:row.displayPosition||row.positionValue,positionNumber:num(row.positionNumber),driverId:row.driverReference||null,name:row.driverFirstName&&row.driverLastName?`${row.driverFirstName} ${row.driverLastName}`:`Driver #${row.racingNumber||'unknown'}`,teamId:row.teamKey?String(row.teamKey):null,teamName:row.teamName||'Team unavailable',number:row.racingNumber,
        points:race?num(row.racePoints):null,laps:num(row.lapsCompleted),time:row.displayTime||row.raceTime||row.classifiedTime||null,bestLap:race?null:row.classifiedTime||null,gap:row.gapToLeader,interval:row.gapToPrevious,status:row.completionStatusCode||null,
        driverImage:image(row.driverAvatarImage),teamImage:image(row.teamLogoImage),driverPageUrl:row.driverPageUrl||null};
}
const countries={Brazil:'br',Bulgaria:'bg',Ireland:'ie',Italy:'it',Sweden:'se',Mexico:'mx',Norway:'no',Paraguay:'py',India:'in',Netherlands:'nl',Thailand:'th',Japan:'jp','United Kingdom':'gb','Great Britain':'gb','United States':'us','United States of America':'us',USA:'us',Spain:'es',Poland:'pl',Colombia:'co',Germany:'de',Argentina:'ar',Australia:'au',France:'fr',Denmark:'dk',Belgium:'be',Finland:'fi','New Zealand':'nz',Canada:'ca',Portugal:'pt',Austria:'at',Switzerland:'ch',Russia:'ru'};
export function officialNationality(html){const nationality=html.match(/<title>Flag of ([^<]+)<\/title>/)?.[1];const iso=countries[nationality];return nationality&&iso?{nationality,countryCode:iso,flagUrl:`https://flagcdn.com/w160/${iso}.png`}:null;}
export function normalizeSession(session) {
    const start=session.startTime && (/Z$|[+-]\d\d:\d\d$/.test(session.startTime)?session.startTime:session.gmtOffset?session.startTime+session.gmtOffset:null);
    const race=session.sessionType==='Race';
    return {id:session.value||`${session.sessionType?.toLowerCase()}-${session.sessionNumber}`,label:session.shortName||session.description,type:session.sessionType,startTime:start?new Date(start).toISOString():null,state:session.state||'scheduled',
        results:(session.results||[]).map(row=>normalizeResult(row,race))};
}
