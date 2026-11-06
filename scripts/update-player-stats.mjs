import {readFile, writeFile, rename} from 'node:fs/promises';
import {categories, normalizeEspnPlayers, normalizeAflPlayers, normalizeNrlPlayers, parseNrlMatch} from './lib/player-performance.mjs';
import {HttpStatusError, isUnpublishedBoxScore, unavailableBoxScore, shouldRetryBoxScore} from './lib/boxscore-availability.mjs';

const paths = {nba:'basketball/nba',wnba:'basketball/wnba',nbl:'basketball/nbl',nfl:'football/nfl'};
const now = new Date();
const all = ['afl','aflw','nrl','nrlw','nba','wnba','nbl','nfl'];
const requested = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const sports = requested.length ? requested : all;
if (sports.some(sport => !all.includes(sport))) throw new Error('Unknown player statistics league');
const refresh = process.argv.includes('--refresh-all');
const file = name => new URL(`../sports-data/${name}`,import.meta.url);
const read = async name => {try{return JSON.parse(await readFile(file(name),'utf8'));}catch{return null;}};
async function request(url, options = {}, json = true) {
    let failure;
    for (let attempt=0;attempt<3;attempt++) {
        try {
            const response = await fetch(url,{...options,signal:AbortSignal.timeout(25000)});
            if (!response.ok) throw new HttpStatusError(response.status);
            return json ? await response.json() : await response.text();
        } catch(error) {if (isUnpublishedBoxScore(error)) throw error; failure=error;}
    }
    throw failure;
}
async function save(sport,data) {
    const temporary = file(`${sport}-players.json.tmp`);
    await writeFile(temporary,JSON.stringify(data)+'\n');
    await rename(temporary,file(`${sport}-players.json`));
}
async function exportAfl() {
    const cache = await read('afl-player-matches.json');
    if (!cache?.season || !cache.matches) throw new Error('Run the existing AFL player statistics importer first');
    const fixtures = JSON.parse(await readFile(new URL('../afl-fixtures.json',import.meta.url),'utf8'));
    const fixtureMap = new Map(fixtures.flatMap(group => group.matches.map(match => [String(match.matchId),match])));
    const matches = {};
    for (const match of Object.values(cache.matches)) {
        const fixture = fixtureMap.get(String(match.id));
        if (!fixture || new Date(String(fixture.startTime).replace(/\+0000$/,'Z')).getUTCFullYear() !== cache.season) continue;
        matches[match.id] = {id:String(match.id),groupId:String(match.round),startTime:fixture.startTime,status:match.status === 'CONCLUDED' ? 'final' : 'live',updatedAt:match.updatedAt,source:'https://www.afl.com.au/stats',players:match.players.map(player=>({id:String(player.id),name:player.name,teamId:player.teamName,teamName:player.teamName,stats:Object.fromEntries(categories('afl').map(({key})=>[key,player[key]??null]))}))};
    }
    const expected = [...fixtureMap.values()].filter(match=>/CONCLUDED|LIVE|IN_PROGRESS/.test(match.status)).length;
    await save('afl',{sport:'afl',season:cache.season,updatedAt:now.toISOString(),source:{name:'AFL.com.au',url:'https://www.afl.com.au/stats'},categories:categories('afl'),coverage:{expected,available:Object.keys(matches).length,complete:Object.keys(matches).length===expected},matches});
    console.log(`AFL: ${Object.keys(matches).length}/${expected} match box scores exported`);
}
async function importSport(sport) {
    if (sport==='afl') return exportAfl();
    const snapshot=await read(`${sport}.json`);
    if (!snapshot?.season || !snapshot.groups) throw new Error('Fixture snapshot unavailable');
    const previous=await read(`${sport}-players.json`);
    const matches=previous?.season===snapshot.season ? {...previous.matches} : {};
    const unavailable=previous?.season===snapshot.season ? {...previous.unavailableMatches} : {};
    const played=snapshot.groups.flatMap(group=>group.matches.filter(match=>['final','live'].includes(match.status)).map(match=>({...match,groupId:String(group.id)})));
    const expectedIds=new Set(played.map(match=>String(match.id)));
    for(const key of Object.keys(matches)) if(!expectedIds.has(key)) delete matches[key];
    for(const key of Object.keys(unavailable)) if(!expectedIds.has(key)) delete unavailable[key];
    const pending=played.filter(match=>
        (refresh || unavailable[match.id] || !matches[match.id] || matches[match.id].status!=='final' || Date.parse(matches[match.id].updatedAt)<now.getTime()-7*86400000) &&
        shouldRetryBoxScore(match,unavailable[match.id],now,refresh));
    let rawAfl,token;
    if(sport==='aflw' && pending.length) {
        rawAfl=new Map();
        for(let page=0;page<100;page++) {
            const data=await request(`https://aflapi.afl.com.au/afl/v2/matches?compSeasonId=${snapshot.seasonId}&pageSize=100&page=${page}`);
            if(!Array.isArray(data.matches)) throw new Error('AFLW fixture identities missing');
            for(const match of data.matches) {
                if(Number(match.compSeason?.id)!==Number(snapshot.seasonId)) throw new Error('AFLW fixture season mismatch');
                rawAfl.set(String(match.id),match);
            }
            if(page+1 >= data.meta?.pagination?.numPages || data.matches.length<100) break;
        }
        const session=await request('https://api.afl.com.au/cfs/afl/WMCTok',{method:'POST'});
        if(!session.token) throw new Error('AFLW player statistics session unavailable');
        token=session.token;
    }
    const failed=new Set(); let index=0;
    await Promise.all(Array.from({length:4},async()=>{
        while(index<pending.length) {
            const match=pending[index++];
            try {
                let players,source;
                if(paths[sport]) {
                    const endpoint=`https://site.api.espn.com/apis/site/v2/sports/${paths[sport]}/summary?event=${encodeURIComponent(match.id)}`;
                    players=normalizeEspnPlayers(await request(endpoint),match,sport,snapshot.season);
                    source=`https://www.espn.com/${sport}/game/_/gameId/${encodeURIComponent(match.id)}`;
                } else if(sport==='aflw') {
                    const raw=rawAfl.get(String(match.id));
                    if(!raw) throw new Error('AFLW match identity unavailable');
                    players=normalizeAflPlayers(await request(`https://api.afl.com.au/cfs/afl/playerStats/match/${raw.providerId}`,{headers:{'x-media-mis-token':token}}),raw,sport);
                    source='https://www.afl.com.au/aflw/stats';
                } else {
                    const url=new URL(match.url);
                    if(url.protocol!=='https:' || url.hostname!=='www.nrl.com' || !url.pathname.startsWith('/draw/')) throw new Error('Unexpected NRL match URL');
                    players=normalizeNrlPlayers(parseNrlMatch(await request(url.href,{},false)),match,sport);
                    source=url.href;
                }
                matches[match.id]={id:String(match.id),groupId:match.groupId,startTime:match.startTime,status:match.status,updatedAt:now.toISOString(),source,players};
                delete unavailable[match.id];
            } catch(error) {
                if (isUnpublishedBoxScore(error)) {
                    unavailable[match.id]=unavailableBoxScore(match,now);
                    console.warn(`${sport.toUpperCase()} ${match.id}: box score not published (HTTP 404); retry after ${unavailable[match.id].nextRetryAt}; saved data retained`);
                } else {
                    delete unavailable[match.id];
                    failed.add(String(match.id));
                    console.error(`${sport.toUpperCase()} ${match.id}: ${error.message}; saved data retained`);
                }
            }
        }
    }));
    const available=played.filter(match=>matches[match.id]).length;
    const source=paths[sport]?{name:'ESPN',url:`https://www.espn.com/${sport}/scoreboard`}:sport==='aflw'?{name:'AFL.com.au',url:'https://www.afl.com.au/aflw/stats'}:{name:'NRL.com',url:'https://www.nrl.com/stats/'};
    await save(sport,{sport,season:snapshot.season,updatedAt:now.toISOString(),source,categories:categories(sport),coverage:{expected:played.length,available,complete:available===played.length && !failed.size && !Object.keys(unavailable).length,failedMatchIds:[...failed],unavailableMatchIds:Object.keys(unavailable)},unavailableMatches:unavailable,matches});
    console.log(`${sport.toUpperCase()}: ${available}/${played.length} box scores; refreshed ${pending.length-failed.size-pending.filter(match=>unavailable[match.id]).length}, unpublished ${Object.keys(unavailable).length}, failed ${failed.size}`);
    if(failed.size) process.exitCode=1;
}
for(const sport of sports) {
    try {await importSport(sport);} catch(error) {console.error(`${sport.toUpperCase()}: ${error.message}; previous snapshot retained`);process.exitCode=1;}
}
