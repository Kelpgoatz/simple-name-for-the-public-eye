import {readFile,writeFile,rename} from 'node:fs/promises';
import {normalizeEspnStandings} from './lib/espn-sports.mjs';
import {careerFromHistory,aflCareerRows,nrlCareerRows,championshipFromEspnSummary,tennisArchiveRows,officialBasketballChampions,historicTeamId} from './lib/team-careers.mjs';
const directory=new URL('../sports-data/',import.meta.url),now=new Date(),year=now.getUTCFullYear();
const paths={nba:'basketball/nba',wnba:'basketball/wnba',nbl:'basketball/nbl',nfl:'football/nfl'};
const sports=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const refresh=process.argv.includes('--refresh-all');
async function read(name){try{return JSON.parse(await readFile(new URL(name,directory),'utf8'));}catch{return null;}}
async function request(url){let failure;for(let i=0;i<3;i++){try{const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`HTTP ${response.status}`);return await response.json();}catch(error){failure=error;}}throw failure;}
async function pool(items,fn){let index=0;const results=[];await Promise.all(Array.from({length:5},async()=>{while(index<items.length){const i=index++;try{results[i]=await fn(items[i]);}catch(error){console.error(`${items[i].label||items[i].year||items[i]}: ${error.message}`);results[i]=null;}}}));return results;}
function knownTeams(snapshot){return [...new Map(snapshot.groups.flatMap(group=>group.matches.flatMap(match=>[match.home,match.away])).map(team=>[String(team.id),team])).values()];}
function cachedSeason(previous,id){return Object.entries(previous?.teams||{}).flatMap(([teamId,team])=>(team.history||[]).filter(row=>String(row.seasonId)===String(id)).map(row=>({...row,teamId,teamName:row.teamName||team.name})));}
function cachedAwards(previous,id){return Object.entries(previous?.teams||{}).flatMap(([teamId,team])=>(team.achievements||[]).filter(award=>String(award.seasonId)===String(id)).map(award=>({...award,teamId})));}
async function build(sport){
    const previous=await read(`${sport}-careers.json`),snapshot=sport==='afl'?null:await read(`${sport}.json`);
    const rows=[],awards=[],sources=[];let expected=0,available=0;let scope='',source;
    if(paths[sport]){
        const [type,league]=paths[sport].split('/'),current=Number(snapshot.season);
        const index=await request(`https://sports.core.api.espn.com/v2/sports/${type}/leagues/${league}/seasons?limit=1000`);
        const years=(index.items||[]).map(item=>Number(item.$ref?.match(/\/seasons\/(\d+)/)?.[1])).filter(value=>value<=current).sort((a,b)=>a-b);
        if(!years.length || index.items.length<index.count)throw Error('Season archive index incomplete');
        const ids=new Set(knownTeams(snapshot).map(team=>String(team.id)));
        expected=years.length;scope='Regular-season games only. Franchise continuity follows ESPN team IDs; records before the provider archive and defunct franchises are excluded. Current season is counted once and may be in progress. Championships are listed only when a completed final is explicitly identified; title history may be incomplete.';
        source={name:'ESPN season archive',url:`https://www.espn.com/${sport}/standings`};
        const results=await pool(years,async season=>{
            let seasonRows=cachedSeason(previous,season),seasonAwards=cachedAwards(previous,season);
            if(!refresh && season<current-1 && seasonRows.length)return {rows:seasonRows,awards:seasonAwards};
            const url=`https://site.api.espn.com/apis/v2/sports/${paths[sport]}/standings?season=${season}&seasontype=2`;
            const data=await request(url);
            const groups=normalizeEspnStandings(data,season);
            const regularEnd=data.seasons?.find(item=>Number(item.year)===season)?.types?.find(type=>String(type.id)==='2')?.endDate;
            seasonRows=[...new Map(groups.flatMap(group=>group.rows).filter(row=>ids.has(String(row.team.id))).map(row=>[String(row.team.id),{teamId:String(row.team.id),teamName:row.team.name,year:season,seasonId:String(season),label:['nba','nbl'].includes(sport)?`${season-1}-${String(season).slice(-2)}`:String(season),played:row.played,wins:row.wins,losses:row.losses,draws:row.draws,rank:row.rank>0?row.rank:null,source:url,complete:season<current||Date.parse(regularEnd)<now.getTime()}])).values()];
            if(!seasonRows.length)throw Error('Archive standings contain no current franchises');
            // Contemporary result feeds explicitly identify the completed championship series.
            if(season>=2003 && (season<current || sport==='wnba')){
                try{
                    const dates=String(sport==='nfl'?season+1:season);
                    const playoff=await request(`https://site.api.espn.com/apis/site/v2/sports/${paths[sport]}/scoreboard?dates=${dates}&seasontype=3&limit=1000`);
                    const final=(playoff.events||[]).filter(event=>Number(event.season?.year)===season&&Number(event.season?.type)===3&&event.status?.type?.completed).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date))[0];
                    if(final){const summary=await request(`https://site.api.espn.com/apis/site/v2/sports/${paths[sport]}/summary?event=${final.id}`);summary.finalNotes=final.competitions?.[0]?.notes||[];const champion=championshipFromEspnSummary(summary,sport,season);if(champion)seasonAwards=[{...champion,seasonId:String(season),source:`https://www.espn.com/${sport}/game/_/gameId/${final.id}`}];}
                }catch{}
            }
            return {rows:seasonRows,awards:seasonAwards};
        });
        for(const result of results)if(result){available++;rows.push(...result.rows);awards.push(...result.awards);}
    }else if(['afl','aflw'].includes(sport)){
        const data=await request('https://aflapi.afl.com.au/afl/v2/compseasons?pageSize=100&page=0');
        const seasons=(data.compSeasons||[]).filter(season=>season.competition?.code===sport.toUpperCase()&&Number(season.season?.year)<=year&&(sport==='afl'?season.shortName==='Premiership':!/(preseason|ireland|origin|practice)/i.test(season.shortName)));
        expected=seasons.length;scope='Regular-season ladder records from the official AFL archive. Finals are excluded from wins/losses; premierships are included only after a concluded Grand Final. Both 2022 AFLW seasons are separate records. Earlier VFL/AFL seasons are outside this archive.';
        source={name:'Official AFL season archive',url:sport==='aflw'?'https://www.afl.com.au/aflw/fixture':'https://www.afl.com.au/ladder'};
        const results=await pool(seasons,async season=>{
            let seasonRows=cachedSeason(previous,season.id),seasonAwards=cachedAwards(previous,season.id);
            if(!refresh&&season.season.year<year-1&&seasonRows.length)return {rows:seasonRows,awards:seasonAwards};
            const url=`https://aflapi.afl.com.au/afl/v2/compseasons/${season.id}/ladders`;
            seasonRows=aflCareerRows(await request(url),season,sport).map(row=>({...row,source:url,complete:season.season.year<year}));
            if(!seasonRows.length)throw Error('No historical ladder entries');
            const matches=[];
            for(let page=0;page<10;page++){
                const draw=await request(`https://aflapi.afl.com.au/afl/v2/matches?compSeasonId=${season.id}&pageSize=100&page=${page}`);
                matches.push(...(draw.matches||[]));if(page+1>=draw.meta?.pagination?.numPages||draw.matches?.length<100)break;
            }
            const finals=matches.filter(match=>/^Grand Final$/i.test(match.round?.name||'')&&match.status==='CONCLUDED');
            if(finals.length===1){const final=finals[0],home=final.home?.score?.totalScore,away=final.away?.score?.totalScore;if(home!=null&&away!=null&&home!==away){const winner=home>away?final.home.team:final.away.team;seasonAwards=[{teamId:sport==='afl'?winner.name:String(winner.id),year:season.season.year,seasonId:String(season.id),label:`${sport.toUpperCase()} premier`,source:`https://aflapi.afl.com.au/afl/v2/matches/${final.id}`}];seasonRows=seasonRows.map(row=>({...row,complete:true}));}}
            return {rows:seasonRows,awards:seasonAwards};
        });
        for(const result of results)if(result){available++;rows.push(...result.rows);awards.push(...result.awards);}
    }else if(['nrl','nrlw'].includes(sport)){
        const competition=sport==='nrl'?111:161;
        const current=await request(`https://www.nrl.com/ladder/data?competition=${competition}&season=${snapshot.season}`);
        const seasons=(current.filterSeasons||[]).map(item=>Number(item.value)).filter(value=>value<=Number(snapshot.season));
        const teams=knownTeams(snapshot);expected=seasons.length;source={name:'Official NRL ladder archive',url:`https://www.nrl.com/ladder/?competition=${competition}`};
        scope='Regular-season ladder records from the NRL.com archive. Current-club identities follow provider team IDs and theme keys; defunct clubs are excluded. Finals are excluded from wins/losses. Premierships require an explicit concluded Grand Final.';
        const results=await pool(seasons,async season=>{
            let seasonRows=cachedSeason(previous,season),seasonAwards=cachedAwards(previous,season);
            if(!refresh&&season<year-1&&seasonRows.length)return {rows:seasonRows,awards:seasonAwards};
            const url=`https://www.nrl.com/ladder/data?competition=${competition}&season=${season}`;
            seasonRows=nrlCareerRows(await request(url),season,teams).map(row=>({...row,source:url,complete:season<year}));
            const draw=await request(`https://www.nrl.com/draw/data?competition=${competition}&season=${season}`);
            const grandFinal=draw.filterRounds?.find(round=>/^Grand Final$/i.test(round.name));
            if(grandFinal){const finalDraw=await request(`https://www.nrl.com/draw/data?competition=${competition}&season=${season}&round=${grandFinal.value}`);const final=finalDraw.fixtures?.find(match=>match.type==='Match'&&/fulltime|final|complete/i.test(match.matchState||''));if(final){const home=Number(final.homeTeam.score),away=Number(final.awayTeam.score);if(Number.isFinite(home)&&Number.isFinite(away)&&home!==away){seasonAwards=[{teamId:String((home>away?final.homeTeam:final.awayTeam).teamId),year:season,seasonId:String(season),label:`${sport.toUpperCase()} premier`,source:new URL(final.matchCentreUrl,'https://www.nrl.com').href}];seasonRows=seasonRows.map(row=>({...row,complete:true}));}}}
            return {rows:seasonRows,awards:seasonAwards};
        });
        for(const result of results)if(result){available++;rows.push(...result.rows);awards.push(...result.awards);}
    }else if(sport==='tennis'){
        const ids=new Set(knownTeams(snapshot).map(team=>String(team.id)));
        // The public scoreboard calendar exposes tennis seasons from 2002 onward.
        const jobs=Array.from({length:year-2002+1},(_,i)=>2002+i).flatMap(year=>['atp','wta'].map(tour=>({year,tour,label:`${tour} ${year}`})));
        expected=jobs.length;source={name:'ESPN singles results archive',url:'https://www.espn.com/tennis/scoreboard'};
        scope='Published ATP/WTA singles match archive since 2002, including qualifying where supplied, excluding walkovers. This is archive coverage, not an official lifetime tour-level record. Only current Grand Slam draw players are shown. Tournament titles require an explicit final round.';
        const results=await pool(jobs,async job=>{
            const id=`${job.tour}-${job.year}`;
            if(!refresh&&job.year<year-1){const cached=cachedSeason(previous,id);if(cached.length)return {rows:cached,awards:cachedAwards(previous,id)};}
            const url=`https://site.api.espn.com/apis/site/v2/sports/tennis/${job.tour}/scoreboard?dates=${job.year}&limit=1000`;
            const data=await request(url);const result=tennisArchiveRows(data,job.tour,job.year);
            if(!result.rows.length)throw Error('No archived singles results');
            return {rows:result.rows.filter(row=>ids.has(row.teamId)).map(row=>({...row,source:url,complete:job.year<year})),awards:result.achievements.filter(award=>ids.has(award.teamId)).map(award=>({...award,seasonId:id}))};
        });
        for(const result of results)if(result){available++;rows.push(...result.rows);awards.push(...result.awards);}
    }else throw Error('Unknown sport');
    if(['nba','wnba'].includes(sport)){
        const url=sport==='nba'?'https://www.nba.com/news/history-nba-champions':'https://www.wnba.com/all-time-wnba-champions';
        try{
            const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`HTTP ${response.status}`);
            const champions=officialBasketballChampions(await response.text(),sport),key=name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
            // A name shared decades apart is not proof of franchise continuity (1948 Baltimore Bullets).
            for(let i=awards.length-1;i>=0;i--)if(awards[i].source===url)awards.splice(i,1);
            for(const champion of champions){const teamId=historicTeamId(rows,champion.teamName,champion.year);if(teamId)awards.push({teamId,year:champion.year,seasonId:String(champion.year),label:`${sport.toUpperCase()} champion`,source:url});}
        }catch(error){console.error(`${sport} official title list: ${error.message}; verified game achievements retained`);}
    }
    if(sport==='nfl'){
        const url='https://www.espn.com/nfl/superbowl/history/winners';
        try{
            const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`HTTP ${response.status}`);
            const html=await response.text();let count=0;
            const key=text=>text.toLowerCase().replace(/[^a-z0-9]/g,'');
            for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)){
                const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell=>cell[1].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
                const calendarYear=Number(cells[1]?.match(/\b(19\d{2}|20\d{2})\b/)?.[1]);
                const winner=cells[3]?.match(/^(.+?)\s+(\d+),\s*(.+?)\s+(\d+)/);
                if(!calendarYear||!winner||Number(winner[2])<=Number(winner[4]))continue;
                const season=calendarYear-1;
                const candidates=rows.filter(row=>row.year===season&&key(row.teamName).startsWith(key(winner[1])));
                let ids=[...new Set(candidates.map(row=>row.teamId))];
                if(!ids.length){
                    // Some old NFL standings omit a conference. Resolve a published winner only
                    // when its historic city/name identifies one current franchise unambiguously.
                    const older=rows.filter(row=>row.year<=season&&key(row.teamName).startsWith(key(winner[1])));
                    ids=[...new Set(older.map(row=>row.teamId))];
                    if(!ids.length)ids=knownTeams(snapshot).filter(team=>key(team.name).startsWith(key(winner[1]))).map(team=>String(team.id));
                }
                if(ids.length===1){awards.push({teamId:ids[0],year:season,seasonId:String(season),label:'Super Bowl champion',source:url});count++;}
            }
            if(count<50)console.error(`NFL title archive matched ${count} historic champions; unverified identities skipped`);
        }catch(error){console.error(`NFL title archive: ${error.message}; verified game achievements retained`);}
    }
    if(sport==='nbl'){
        // These milestones are explicitly named in the league's own history, not inferred from ladders.
        const url='https://www.nbl.com.au/pages/nbl-history';
        try{
            const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`HTTP ${response.status}`);
            const text=(await response.text()).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
            const named=[['Sydney Kings',[2003,2004,2005]],['New Zealand Breakers',[2011,2012,2013,2015]]];
            for(const [name,years] of named){const team=knownTeams(snapshot).find(team=>team.name===name);if(team&&text.includes(name)&&years.every(year=>text.includes(String(year))))for(const year of years)awards.push({teamId:String(team.id),year,seasonId:String(year),label:'NBL champion',source:url});}
            const perth=knownTeams(snapshot).find(team=>team.name==='Perth Wildcats');
            if(perth&&/Perth Wildcats.{0,180}10 titles.{0,80}2020/.test(text))awards.push({teamId:String(perth.id),year:2020,seasonId:'2020',label:'10 NBL championships recorded by the league',source:url});
            const kingsUrl='https://www.nbl.com.au/news/nbl26-champions-sydney-kings-kendric-davis';
            const kingsResponse=await fetch(kingsUrl,{signal:AbortSignal.timeout(20000)});if(kingsResponse.ok){const html=await kingsResponse.text();const kings=knownTeams(snapshot).find(team=>team.name==='Sydney Kings');if(kings&&/Champions of NBL26|win the NBL26 title/i.test(html))awards.push({teamId:String(kings.id),year:2026,seasonId:'2026',label:'NBL champion',source:kingsUrl});}
            const clubSources=[
                ['Adelaide 36ers',[1986,1998,1999,2002],'https://www.adelaide36ers.com/pages/history'],
                ['Melbourne United',[2018,2021],'https://www.melbourneutd.com.au/news/david-barlow-joins-melbourne-united-coaching-staff'],
                ['Illawarra Hawks',[2001,2025],'https://www.hawks.com.au/pages/illawarra-hawks-history'],
                ['Tasmania JackJumpers',[2024],'https://www.jackjumpers.com.au/news/tasmanian-museum-showcases-jackjumpers-historic-rise-and-place-in-state-history']
            ];
            await Promise.all(clubSources.map(async([name,years,url])=>{try{const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)return;const text=(await response.text()).replace(/<[^>]*>/g,' ');const team=knownTeams(snapshot).find(team=>team.name===name);if(team&&/champion/i.test(text)&&years.every(year=>text.includes(String(year))||text.includes(`${year-1}/${String(year).slice(-2)}`)))for(const year of years)awards.push({teamId:String(team.id),year,seasonId:String(year),label:'NBL champion',source:url});}catch{}}));
        }catch(error){console.error(`NBL official milestones: ${error.message}; regular-season achievements retained`);}
    }
    const teams={};
    for(const id of new Set(rows.map(row=>String(row.teamId)))){
        const own=rows.filter(row=>String(row.teamId)===id),career=careerFromHistory(own,awards.filter(award=>String(award.teamId)===id),scope);
        if(career){const present=new Set(career.history.map(row=>row.year)),missingYears=Array.from({length:career.to-career.from+1},(_,index)=>career.from+index).filter(year=>!present.has(year));teams[id]={name:own.at(-1).teamName,...career,missingYears,note:scope+(missingYears.length?` This team has missing archive seasons: ${missingYears.join(', ')}.`:''),source};}
    }
    if(!Object.keys(teams).length)throw Error('No valid historical team records');
    const years=Object.values(teams).flatMap(team=>[team.from,team.to]);
    const result={sport,updatedAt:now.toISOString(),source,coverage:{from:Math.min(...years),to:Math.max(...years),expectedSeasons:expected,availableSeasons:available,complete:available===expected,note:scope},teams};
    const temp=new URL(`${sport}-careers.json.tmp`,directory);await writeFile(temp,JSON.stringify(result)+'\n');await rename(temp,new URL(`${sport}-careers.json`,directory));
    console.log(`${sport.toUpperCase()}: ${Object.keys(teams).length} profiles, ${result.coverage.from}–${result.coverage.to}, ${available}/${expected} archive seasons, ${awards.length} verified achievements`);
}
for(const sport of sports.length?sports:['afl','aflw','nrl','nrlw','nba','wnba','nbl','nfl','tennis']){try{await build(sport);}catch(error){console.error(`${sport}: ${error.message}; existing career snapshot retained`);process.exitCode=1;}}
