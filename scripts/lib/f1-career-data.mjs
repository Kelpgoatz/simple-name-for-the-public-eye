export const canonicalName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function normalizeRaces(payload, kind, sourceId) {
    const races=payload?.MRData?.RaceTable?.Races;
    if(!Array.isArray(races))throw new Error('Historical race response is missing');
    return races.flatMap(race=>(race.Results||[]).map(row=>{
        if(kind==='driver'&&row.Driver?.driverId!==sourceId||kind==='team'&&row.Constructor?.constructorId!==sourceId)throw new Error('Historical result identity mismatch');
        if(!Number.isInteger(Number(race.season))||!Number.isInteger(Number(race.round))||!row.Driver?.driverId||!row.Constructor?.constructorId)throw new Error('Invalid historical result');
        return {season:Number(race.season),round:Number(race.round),race:race.raceName,date:race.date,url:race.url,driverId:row.Driver.driverId,driverName:[row.Driver.givenName,row.Driver.familyName].filter(Boolean).join(' '),constructorId:row.Constructor.constructorId,position:/^\d+$/.test(String(row.position))?Number(row.position):null,positionText:row.positionText,grid:Number(row.grid)>0?Number(row.grid):null,points:Number(row.points),status:row.status};
    }));
}
const started = result => !/did not start|did not qualify|did not prequalify|withdrew|withdrawn/i.test(result.status||'');
const unique = (rows,key) => new Set(rows.map(key)).size;
const raceKey = row => `${row.season}:${row.round}`;
export function summarizeCareer({kind,sourceId,sourceName,results=[],standings=[],season,seasonFinished=false,updatedAt,source}) {
    const rows=[...new Map(results.map(row=>[`${raceKey(row)}:${row.driverId}:${row.position}:${row.positionText}`,row])).values()];
    const starts=rows.filter(started);
    const classified=rows.filter(row=>row.position>0&&/^\d+$/.test(String(row.positionText??row.position))&&!/disqualified|excluded/i.test(row.status||''));
    const championships=standings.filter(row=>row.season<season||row.season===season&&seasonFinished).sort((a,b)=>a.season-b.season);
    const titles=championships.filter(row=>row.position===1).map(row=>row.season);
    const bestChampionship=championships.filter(row=>row.position>0).sort((a,b)=>a.position-b.position||b.season-a.season)[0]||null;
    const best=classified.sort((a,b)=>a.position-b.position||b.season-a.season||b.round-a.round)[0]||null;
    const wins=unique(classified.filter(row=>started(row)&&row.position===1),raceKey);
    const podiums=unique(classified.filter(row=>started(row)&&row.position>0&&row.position<=3),row=>`${raceKey(row)}:${row.position}`);
    const poleStarts=unique(starts.filter(row=>row.grid===1),raceKey);
    const startCount=unique(starts,raceKey);
    const perYear=[...new Set(rows.map(row=>row.season))].sort((a,b)=>b-a).map(year=>{
        const yearly=starts.filter(row=>row.season===year);
        return {season:year,starts:unique(yearly,raceKey),wins:unique(yearly.filter(row=>row.position===1),raceKey),podiums:unique(yearly.filter(row=>row.position>0&&row.position<=3),row=>`${raceKey(row)}:${row.position}`),championship:championships.find(row=>row.season===year)?.position??null,complete:year<season||year===season&&seasonFinished};
    });
    const positionRows=[...new Map([...classified.filter(started)].sort((a,b)=>b.position-a.position).map(row=>[kind==='team'?`${raceKey(row)}:${row.position}`:raceKey(row),row])).values()];
    const gridRows=[...new Map(starts.filter(row=>row.grid>0).map(row=>[kind==='team'?`${raceKey(row)}:${row.grid}`:raceKey(row),row])).values()];
    const average=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
    return {kind,sourceId,sourceName,updatedAt,source,scope:kind==='team'?`Exact Jolpica constructor identity “${sourceName}” (${sourceId}). Predecessor or renamed constructor identities are not merged.`:'Formula 1 World Championship Grand Prix results only; sprint results are excluded.',firstSeason:rows.length?Math.min(...rows.map(row=>row.season)):null,lastSeason:rows.length?Math.max(...rows.map(row=>row.season)):null,
        totals:{starts:startCount,entries:unique(rows,raceKey),wins,podiums,poleStarts,titles:titles.length},
        averages:{winRate:startCount?wins/startCount*100:null,podiumsPerStart:startCount?podiums/startCount:null,finish:average(positionRows.map(row=>row.position)),grid:average(gridRows.map(row=>row.grid))},
        titleYears:titles,bestChampionship,bestResult:best,seasons:perYear,complete:true};
}
