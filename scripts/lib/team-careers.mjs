const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export function historicTeamId(rows,name,year) {
    const key=text=>String(text||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    let candidates=rows.filter(row=>row.year===year&&key(row.teamName)===key(name));
    if(!candidates.length)candidates=rows.filter(row=>key(row.teamName)===key(name)&&rows.some(other=>other.teamId===row.teamId&&other.year<=year)&&rows.some(other=>other.teamId===row.teamId&&other.year>=year));
    const ids=[...new Set(candidates.map(row=>String(row.teamId)))];
    return ids.length===1?ids[0]:null;
}
export function careerFromHistory(history, achievements = [], note = '') {
    const unique = new Map();
    for (const row of history) {
        if (!row.seasonId || !Number.isInteger(row.year) || ![row.wins,row.losses,row.draws].every(value=>Number.isFinite(value)&&value>=0)) continue;
        if (row.played !== row.wins+row.losses+row.draws) continue;
        unique.set(String(row.seasonId),row);
    }
    const rows = [...unique.values()].sort((a,b)=>a.year-b.year||String(a.seasonId).localeCompare(String(b.seasonId)));
    if (!rows.length) return null;
    const best = [...rows].filter(row=>row.played>0 && row.complete!==false).sort((a,b)=>(b.wins/b.played)-(a.wins/a.played)||b.wins-a.wins||b.year-a.year)[0];
    return {played:rows.reduce((sum,row)=>sum+row.played,0),wins:rows.reduce((sum,row)=>sum+row.wins,0),losses:rows.reduce((sum,row)=>sum+row.losses,0),draws:rows.reduce((sum,row)=>sum+row.draws,0),from:rows[0].year,to:rows.at(-1).year,seasons:rows.length,
        history:rows,bestSeason:best?{...best,winPct:best.wins/best.played}:null,achievements:[...new Map(achievements.map(item=>[`${item.year}:${item.label}`,item])).values()].sort((a,b)=>b.year-a.year),note};
}
export function aflCareerRows(data, season, sport) {
    if (Number(data.compSeason?.id)!==Number(season.id)) throw new Error('AFL historical season mismatch');
    return (data.ladders||[]).flatMap(ladder=>(ladder.entries||[]).map(entry=>{
        const record=entry.thisSeasonRecord||entry.thisSeason||{};
        const wins=record.winLossRecord||record;
        return {teamId:sport==='afl'?entry.team.name:String(entry.team.id),teamName:entry.team.name,year:Number(season.season.year),seasonId:String(season.id),label:season.name||`${season.season.year}`,played:numeric(wins.played??entry.played),wins:numeric(wins.wins),losses:numeric(wins.losses),draws:numeric(wins.draws),rank:numeric(entry.position)};
    }));
}
export function nrlCareerRows(data, season, teams) {
    if(Number(data.selectedSeasonId)!==Number(season)) throw new Error('NRL historical season mismatch');
    return (data.positions||[]).flatMap((position,index)=>{
        const team=teams.find(team=>team.key===position.theme?.key);
        if(!team) return [];
        const stats=position.stats||{};
        return [{teamId:String(team.id),teamName:team.name,year:Number(season),seasonId:String(season),label:String(season),played:numeric(stats.played),wins:numeric(stats.wins),losses:numeric(stats.lost),draws:numeric(stats.drawn),rank:index+1}];
    });
}
export function championshipFromEspnSummary(payload,sport,season) {
    if(Number(payload.header?.season?.year)!==Number(season)) return null;
    const competition=payload.header?.competitions?.[0];
    const note=[...(competition?.notes||[]),...(payload.finalNotes||[])].map(note=>note.headline||note.text||'').join(' ');
    const series=(competition?.series||[]).find(item=>item.type==='playoff' && item.completed && (/^(?:NBA|WNBA|NBL) (?:Finals|Grand Final|Championship)/i.test(item.description||'') || new RegExp(`${sport.toUpperCase()} Finals(?:\\s|$)`).test(note)));
    if(series) {
        const ordered=[...(series.competitors||[])].sort((a,b)=>(b.wins||0)-(a.wins||0));
        if(ordered.length!==2 || !(ordered[0].wins>ordered[1].wins)) return null;
        return {teamId:String(ordered[0].id),label:`${sport.toUpperCase()} champion`,year:Number(season)};
    }
    if(sport==='nfl' && /Super Bowl/i.test(note) && competition?.status?.type?.completed) {
        const winner=competition.competitors?.find(team=>team.winner);
        if(winner) return {teamId:String(winner.id),label:'Super Bowl champion',year:Number(season)};
    }
    return null;
}
export function tennisArchiveRows(data,tour,year) {
    const totals=new Map(), achievements=[];
    for(const event of data.events||[]) {
        if(Number(event.season?.year)!==Number(year)) continue;
        const group=event.groupings?.find(group=>group.grouping?.slug===`${tour==='atp'?'mens':'womens'}-singles`);
        const seen=new Set();
        for(const match of group?.competitions||[]) {
            if(seen.has(String(match.id))) continue;
            seen.add(String(match.id));
            const status=match.status?.type;
            if(!status?.completed || /walkover|w.o./i.test(`${status.name} ${status.description}`)) continue;
            const players=match.competitors||[],winner=players.find(player=>player.winner);
            if(players.length!==2 || !winner || players.some(player=>!player.athlete?.displayName)) continue;
            for(const player of players) {
                const id=String(player.id);
                if(!totals.has(id)) totals.set(id,{teamId:id,teamName:player.athlete.displayName,year:Number(year),seasonId:`${tour}-${year}`,label:`${year} ${tour.toUpperCase()} singles archive`,played:0,wins:0,losses:0,draws:0,rank:null});
                const row=totals.get(id);row.played++;player.winner?row.wins++:row.losses++;
            }
            if(/^final$/i.test(match.round?.displayName||'')) achievements.push({teamId:String(winner.id),year:Number(year),label:`${event.name} champion`,source:event.links?.find(link=>link.rel?.includes('summary'))?.href||`https://www.espn.com/tennis/scoreboard/tournament/_/eventId/${encodeURIComponent(event.id)}`});
        }
    }
    return {rows:[...totals.values()],achievements};
}
export function officialBasketballChampions(html,sport) {
    const clean=text=>text.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&#8211;|&ndash;/g,'–').replace(/&#8212;|&mdash;/g,'—').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
    const results=[];
    if(sport==='nba') {
        const script=html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
        const strings=[];
        function walk(item){if(typeof item==='string'&&item.includes('1946-47'))strings.push(clean(item));else if(Array.isArray(item))item.forEach(walk);else if(item&&typeof item==='object')Object.values(item).forEach(walk);}
        if(script)walk(JSON.parse(script));else strings.push(clean(html));
        for(const text of strings)for(const match of text.matchAll(/(\d{4})[-–](\d{2})\s*(?:--|—|–)\s*([^—]+?)\s+def\./g))results.push({year:Number(match[1])+1,teamName:match[3].trim()});
    }else if(sport==='wnba'){
        for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)){
            const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match=>clean(match[1]));
            if(/^\d{4}$/.test(cells[0]||'')&&cells[1])results.push({year:Number(cells[0]),teamName:cells[1]});
        }
    }
    const unique=[...new Map(results.map(item=>[`${item.year}:${item.teamName}`,item])).values()];
    if(unique.length<(sport==='nba'?70:25))throw Error('Official championship list could not be verified');
    return unique;
}
