(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.HomeWelcome=api;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>api.init(document));else api.init(document);}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
    'use strict';
    const scopeKey = 'cgrillo-home-scope-v1';
    let choice = null;
    try { choice = root.localStorage?.getItem(scopeKey); } catch {}
    let events=[],weekends={};
    const empty=()=>({leagues:[],teams:[],drivers:[]});
    const snapshot=()=>root.ViewerFavourites?.get()||empty();
    function selectionCount(prefs={}){return ['leagues','teams','drivers'].reduce((sum,key)=>sum+(Array.isArray(prefs[key])?prefs[key].length:0),0);}
    function scopeFor(prefs,preferred){return selectionCount(prefs)&&preferred!=='all'?'following':'all';}
    function getScope(){return scopeFor(snapshot(),choice);}
    function setScope(value){if(!['all','following'].includes(value))return getScope();choice=value;try{root.localStorage?.setItem(scopeKey,value);}catch{}const scope=getScope();if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new root.CustomEvent('viewer-home-scope-change',{detail:{scope}}));return scope;}
    function startsIn(timestamp,now=Date.now()){
        const minutes=Math.ceil((timestamp-now)/60000);if(!Number.isFinite(minutes)||minutes<=0)return '';
        if(minutes<60)return `In ${minutes} min`;
        const hours=Math.floor(minutes/60),rest=minutes%60;if(hours<24)return `In ${hours}h${rest?` ${rest}m`:''}`;
        const days=Math.floor(hours/24);return `In ${days}d${hours%24?` ${hours%24}h`:''}`;
    }
    function nextEvent(games,{weekends={},now=Date.now(),progress=root.WeekendProgress}={}){
        const candidates=[],name=(sport,team)=>root.TeamNames?.label(sport,team)|| (typeof team==='string'?team:team?.name||'Team');
        for(const game of games||[]){
            const sport=game.sport||(game.race?'f1':'afl'),race=game.race||game.f2Race;
            if(race){
                if(game.race&&(race.status==='CONCLUDED'||race.results?.length))continue;
                const sessions=game.race?[...Object.entries(weekends[race.raceId]?.sessions||{}).map(([key,session])=>({...session,key})),{key:'race',label:'Race',startTime:race.startTime,date:race.date,results:race.results,status:race.status}]:(race.sessions||[]).map(session=>({...session,key:session.id||session.type,label:session.label||session.name||session.type}));
                const next=progress?.build(sessions.filter(session=>session.startTime),{now,timeZone:'Australia/Sydney'}).next;
                if(!Number.isFinite(next?.timestamp))continue;
                candidates.push({sport,timestamp:next.timestamp,title:race.officialName||race.name||'Race weekend',detail:next.label||'Session',provisional:Boolean(next.provisional),href:`${sport}.html?round=${encodeURIComponent(race.round)}&session=${encodeURIComponent(next.key)}`});
                continue;
            }
            const match=game.match||{},status=String(match.status||'').toLowerCase(),timestamp=new Date(game.startTime||match.startTime).getTime();
            if(!Number.isFinite(timestamp)||timestamp<=now||game.state?.isFinished||game.state?.isLive||game.state?.isTbc||/final|concluded|live|cancel|postpon|delay|suspend|abandon/.test(status))continue;
            const id=match.id??match.matchId;
            candidates.push({sport,timestamp,title:`${name(sport,match.home||match.homeTeam)} v ${name(sport,match.away||match.awayTeam)}`,detail:match.venue||'Scheduled fixture',href:id!=null?`sport-view.html?sport=${encodeURIComponent(sport)}&match=${encodeURIComponent(id)}`:`${sport}.html`});
        }
        return candidates.sort((a,b)=>a.timestamp-b.timestamp)[0]||null;
    }
    function setEvents(games,sessionWeekends={}){events=games||[];weekends=sessionWeekends;if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new root.CustomEvent('viewer-home-events-change'));}
    function aflState(match={},startTime,now=Date.now(),{stale=false}={}){
        const status=String(match.status||'SCHEDULED').toUpperCase();
        const start=startTime==null?NaN:new Date(startTime).getTime(),until=start-now;
        const hasScore=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
        const hasScores=hasScore(match.homeScore)&&hasScore(match.awayScore);
        const isFinished=['CONCLUDED','FINAL','FULL_TIME','COMPLETED'].includes(status);
        const isTbc=['CANCELLED','CANCELED','POSTPONED','DELAYED','SUSPENDED','ABANDONED','TBC','PLACEHOLDER','TO_BE_CONFIRMED'].includes(status);
        const staleLive=stale||Number.isFinite(start)&&(until>0||now-start>4*3600000);
        const isLive=!isTbc&&!isFinished&&!staleLive&&['LIVE','IN_PROGRESS','PLAYING'].includes(status);
        const isPending=!isFinished&&!isLive&&!isTbc&&(status==='PENDING'||Number.isFinite(start)&&until<=0);
        const isCountdown=!isFinished&&!isLive&&!isTbc&&!isPending&&until>0&&until<=10*60000;
        return{status,hasScores,isFinished,isTbc,isLive,isPending,isCountdown,isScheduled:!(isFinished||isTbc||isLive||isPending||isCountdown)};
    }
    function init(doc){
        const host=doc.querySelector('[data-home-welcome]');if(!host||host.dataset.ready)return;host.dataset.ready='true';
        const intro=host.querySelector('[data-home-intro]'),toggle=host.querySelector('[data-home-intro-toggle]'),summary=host.querySelector('[data-home-welcome-summary]');
        function renderNext(){
            const panel=host.querySelector('[data-home-next]');if(!panel)return;
            const next=nextEvent(events,{weekends});panel.hidden=!next;if(!next)return;
            const link=panel.querySelector('a');link.textContent=next.title;link.href=next.href;
            panel.querySelector('[data-home-next-sport]').textContent=next.sport.toUpperCase();
            const time=panel.querySelector('time');time.dateTime=new Date(next.timestamp).toISOString();time.textContent=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(next.timestamp)+' Sydney';
            panel.querySelector('[data-home-next-detail]').textContent=next.detail+(next.provisional?' · Provisional session time':'');panel.querySelector('[data-home-next-countdown]').textContent=next.provisional?'Provisional':startsIn(next.timestamp);
        }
        let collapsed=false;try{collapsed=root.localStorage.getItem('cgrillo-home-intro-v1')==='hidden';}catch{}
        function render(){
            const prefs=snapshot(),count=selectionCount(prefs),scope=getScope();
            intro.hidden=collapsed;toggle.textContent=collapsed?'Welcome & shortcuts ↓':'Hide introduction ↑';toggle.setAttribute('aria-expanded',String(!collapsed));
            summary.textContent=count?`${count} starred ${count===1?'selection':'selections'} · Saved only on this device.`:'No account needed. Your stars stay on this device.';
            doc.querySelectorAll('[data-home-scope]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.homeScope===scope));if(button.dataset.homeScope==='following')button.disabled=!count;});
            doc.querySelectorAll('[data-home-scope-count]').forEach(node=>{node.textContent=String(count);});
            const note=doc.querySelector('[data-home-scope-note]');if(note)note.hidden=scope!=='following';
        }
        toggle.addEventListener('click',()=>{collapsed=!collapsed;try{root.localStorage.setItem('cgrillo-home-intro-v1',collapsed?'hidden':'shown');}catch{}render();});
        doc.querySelectorAll('[data-home-scope]').forEach(button=>button.addEventListener('click',()=>setScope(button.dataset.homeScope)));
        root.addEventListener('viewer-favourites-change',render);root.addEventListener('viewer-home-scope-change',render);root.addEventListener('viewer-home-events-change',renderNext);render();renderNext();
        const timer=root.setInterval(renderNext,60000);root.addEventListener('pagehide',()=>root.clearInterval(timer),{once:true});
    }
    return{selectionCount,scopeFor,getScope,setScope,aflState,nextEvent,startsIn,setEvents,init};
});
