(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HomeFollowing=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const sportOf=game=>game.sport||(game.race?'f1':'afl');
    const canonical=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const aliases={adelaide:'adelaidecrows',geelong:'geelongcats',goldcoast:'goldcoastsuns',greaterwesternsydney:'gwsgiants',sydney:'sydneyswans',westcoast:'westcoasteagles',fremantledockers:'fremantle'};
    const same=(a,b)=>{const key=canonical(a),other=canonical(b);return (aliases[key]||key)===(aliases[other]||other);};
    const hasAny=prefs=>Boolean(prefs?.leagues?.length||prefs?.teams?.length||prefs?.drivers?.length);
    function follows(game,prefs){
        const sport=sportOf(game);
        if(!hasAny(prefs))return !['f2','f3'].includes(sport);
        if(prefs.leagues?.includes(sport))return true;
        const teams=(prefs.teams||[]).filter(team=>team.sport===sport);
        const drivers=(prefs.drivers||[]).filter(driver=>driver.sport===sport);
        if(!teams.length&&!drivers.length)return false;
        if(['f1','f2','f3'].includes(sport)){
            const race=game.race||game.f2Race;
            const results=sport==='f1'?race?.results:(race?.sessions||[]).flatMap(session=>session.results||[]);
            return !results?.length||teams.some(team=>results.some(row=>same(row.teamId,team.id)))||drivers.some(driver=>results.some(row=>same(row.driverId,driver.id)));
        }
        const match=game.match||{};
        return teams.some(team=>[match.home?.id,match.away?.id,match.home?.name,match.away?.name,match.homeTeam,match.awayTeam].filter(Boolean).some(id=>same(id,team.id)));
    }
    const key=game=>`${sportOf(game)}:${game.race?.raceId||game.f2Race?.id||game.match?.id||game.match?.matchId}`;
    function outsideWindow(games,prefs,shown,now=Date.now()){
        if(!hasAny(prefs))return [];
        const groups=[...(prefs.leagues||[]).map(sport=>({sport})),...(prefs.teams||[]),...(prefs.drivers||[]).map(driver=>({...driver,driver:true}))];
        const result=[],seen=new Set(shown.map(key));
        for(const group of groups){
            const selected=games.filter(game=>sportOf(game)===group.sport&&follows(game,group.id?{leagues:[],teams:group.driver?[]:[group],drivers:group.driver?[group]:[]}:{leagues:[group.sport],teams:[]})&&!['cancelled','postponed'].includes(game.match?.status));
            const future=selected.filter(game=>game.startTime&&game.startTime.getTime()>=now).sort((a,b)=>a.startTime-b.startTime);
            const past=selected.filter(game=>game.startTime&&game.startTime.getTime()<now).sort((a,b)=>b.startTime-a.startTime);
            const choice=future[0]||past[0];
            if(choice&&!seen.has(key(choice))){seen.add(key(choice));result.push(choice);}
        }
        return result;
    }
    function f2Summaries(data,now=Date.now(),series='f2'){
        return (data?.races||[]).map(race=>{
            const sessions=[...(race.sessions||[])].filter(session=>session.startTime&&Number.isFinite(Date.parse(session.startTime))).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime));
            const future=sessions.find(session=>Date.parse(session.startTime)>=now);
            const completed=sessions.filter(session=>session.results?.length).at(-1);
            const session=future||completed||sessions[0];
            const startTime=session?new Date(session.startTime):new Date(`${race.startDate}T12:00:00Z`);
            return {sport:series,f2Race:race,f2Session:session,startTime,dateKey:new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(startTime),state:{isLive:false,isFinished:!future&&Boolean(completed)},match:{id:race.id,status:future?'scheduled':completed?'final':'scheduled'}};
        });
    }
    function renderF2(game){
        const race=game.f2Race,session=game.f2Session;const series=game.sport==='f3'?'f3':'f2',number=series==='f3'?3:2;
        const results=session?.results||[];
        const when=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(game.startTime);
        return `<article class="afl-game home-f2-game"><div class="f1-game__head"><a class="f1-game__name" href="${series}.html?round=${race.round}">Formula ${number} · ${esc(race.location||race.name)}</a><span class="afl-game__status">${results.length?'Finished':'Upcoming'}</span></div><p class="f1-game__circuit">Round ${race.round} · ${esc(session?.label||'Race weekend')} · <strong>${esc(when)} Sydney</strong></p>${results.length?`<div class="home-f2-podium">${results.slice(0,3).map((row,index)=>`<a href="${series}.html?driver=${encodeURIComponent(row.driverId)}&round=${race.round}"><small>P${index+1}</small><strong>${row.flagUrl&&/^https:\/\/flagcdn\.com\//.test(row.flagUrl)?`<img src="${esc(row.flagUrl)}" alt="">`:""}${esc(row.name)}</strong></a>`).join('')}</div>`:'<p class="viewer-note">Practice, qualifying, sprint & feature race</p>'}<a class="home-game-centre" href="${series}.html?round=${race.round}">Weekend & performances →</a></article>`;
    }
    return {sportOf,hasAny,follows,key,outsideWindow,f2Summaries,renderF2};
});
