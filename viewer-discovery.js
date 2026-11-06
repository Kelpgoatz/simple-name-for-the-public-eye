(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else{root.ViewerDiscovery=api;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>api.init(document));else api.init(document);}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const labels={afl:'AFL',aflw:'AFLW',f1:'Formula 1',f2:'Formula 2',f3:'Formula 3',nrl:'NRL',nrlw:'NRLW',nba:'NBA',wnba:'WNBA',nbl:'NBL',nfl:'NFL',tennis:'Tennis'};
    const names=typeof module==='object'&&module.exports?require('./team-names.js'):typeof TeamNames!=='undefined'?TeamNames:{label:(_,team)=>typeof team==='string'?team:team?.name};
    const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const canonical=value=>{const key=normalize(value).replace(/ /g,'');return({adelaide:'adelaidecrows',geelong:'geelongcats',goldcoast:'goldcoastsuns',greaterwesternsydney:'gwsgiants',sydney:'sydneyswans',westcoast:'westcoasteagles',fremantledockers:'fremantle'})[key]||key;};
    const clubAliases={melbourne:'Melbourne Demons',carlton:'Carlton Blues',hawthorn:'Hawthorn Hawks',northmelbourne:'North Melbourne Kangaroos',richmond:'Richmond Tigers',collingwood:'Collingwood Magpies',essendon:'Essendon Bombers',fremantle:'Fremantle Dockers',portadelaide:'Port Adelaide Power',stkilda:'St Kilda Saints'};
    function href(sport,kind,id){
        if(!Object.hasOwn(labels,sport)||!['league','team','driver'].includes(kind))return '';
        if(kind==='league')return `${sport}.html`;
        return ['f1','f2','f3'].includes(sport)?`${sport}.html?${kind}=${encodeURIComponent(id)}`:`sport-view.html?sport=${encodeURIComponent(sport)}&team=${encodeURIComponent(id)}`;
    }
    const list=value=>Array.isArray(value)?value:[];
    function buildIndex(sources={}){
        const entries=new Map();
        function add(sport,kind,id,name,description='',aliases=''){
            if(!Object.hasOwn(labels,sport)||id==null||!String(id).trim()||!name||/^(?:winner|loser|tbc|tbd|to be confirmed)\b/i.test(String(name)))return;
            const identifier=String(id),key=`${sport}:${kind}:${identifier}`;
            const previous=entries.get(key);
            const entry={key,sport,kind,id:identifier,name:String(name).trim(),description:String(description||''),href:href(sport,kind,identifier)};
            entry.terms=normalize(`${sport} ${labels[sport]} ${entry.name} ${entry.description} ${aliases} ${previous?.terms||''}`);
            if(!previous||entry.description.length>previous.description.length)entries.set(key,entry);
            else previous.terms=entry.terms;
        }
        Object.entries(labels).forEach(([sport,label])=>add(sport,'league',sport,label,['f1','f2','f3'].includes(sport)?'Race weekends & championships':sport==='tennis'?'Grand Slam singles':'Fixtures, results & standings'));
        const addTeam=(sport,team)=>{
            if(!team||typeof team!=='object'||!team.name)return;
            const identifier=team.id??team.name;
            add(sport,'team',identifier,names.label(sport,team),sport==='tennis'?'Tennis player':`${labels[sport]} team`,`${team.abbreviation||''} ${clubAliases[canonical(team.name)]||''}`);
        };
        list(sources.afl).forEach(round=>list(round.matches).forEach(match=>[match.homeTeam,match.awayTeam].filter(Boolean).forEach(name=>addTeam('afl',{id:canonical(name),name}))));
        for(const sport of ['aflw','nrl','nrlw','nba','wnba','nbl','nfl','tennis']){
            const source=sources[sport];
            list(source?.standings).forEach(group=>list(group.rows).forEach(row=>addTeam(sport,row.team)));
            list(source?.groups).forEach(group=>list(group.matches).forEach(match=>{addTeam(sport,match.home);addTeam(sport,match.away);}));
        }
        list(sources.f1drivers?.drivers_championship).forEach(row=>{
            const name=[row.driver?.name,row.driver?.surname].filter(Boolean).join(' ');
            add('f1','driver',row.driverId,name,row.team?.teamName||row.teamId||'F1 driver',row.driver?.shortName);
            if(row.teamId)add('f1','team',row.teamId,row.team?.teamName||row.teamId,'F1 constructor');
        });
        list(sources.f1teams?.constructors_championship).forEach(row=>add('f1','team',row.teamId,row.team?.teamName||row.teamId,'F1 constructor'));
        for(const sport of ['f2','f3']){
            list(sources[sport]?.teams).forEach(team=>add(sport,'team',team.id,team.name,`${labels[sport]} team`));
            list(sources[sport]?.drivers).forEach(driver=>add(sport,'driver',driver.id,driver.name,driver.teamName||`${labels[sport]} driver`,driver.nationality));
        }
        return [...entries.values()];
    }
    function search(index,query='',options={}){
        const words=normalize(query).split(' ').filter(Boolean),sport=options.sport,kind=options.kind;
        if(sport&&!Object.hasOwn(labels,sport))return [];
        return list(index).filter(entry=>(!sport||entry.sport===sport)&&(!kind||entry.kind===kind)&&(!words.length?Boolean(sport||kind)||entry.kind==='league':words.every(word=>entry.terms.includes(word)))).map(entry=>{
            const name=normalize(entry.name),needle=words.join(' ');
            const score=name===needle?0:name.startsWith(needle)?1:words.every(word=>name.split(' ').includes(word))?2:words.every(word=>name.split(' ').some(token=>token.startsWith(word)))?3:name.includes(needle)?4:5;
            return {entry,score};
        }).sort((a,b)=>a.score-b.score||a.entry.name.localeCompare(b.entry.name)||a.entry.sport.localeCompare(b.entry.sport)).map(item=>item.entry);
    }
    function following(snapshot={}){
        const entries=[];
        [...new Set(list(snapshot.leagues))].forEach(sport=>{if(Object.hasOwn(labels,sport))entries.push({sport,kind:'league',id:sport,name:labels[sport],description:'Competition',href:href(sport,'league',sport)});});
        for(const [key,kind] of [['teams','team'],['drivers','driver']])for(const row of list(snapshot[key])){
            if(!row||!Object.hasOwn(labels,row.sport)||row.id==null||typeof row.name!=='string')continue;
            entries.push({sport:row.sport,kind,id:String(row.id),name:kind==='team'?names.label(row.sport,row.name):row.name,description:labels[row.sport],href:href(row.sport,kind,row.id)});
        }
        return [...new Map(entries.map(entry=>[`${entry.sport}:${entry.kind}:${entry.id}`,entry])).values()];
    }
    function rowMarkup(entry,selected=false){
        const type=entry.kind==='league'?'Competition':entry.kind==='driver'?'Driver':entry.sport==='tennis'?'Player':'Team';
        return `<li class="discovery-result"><a href="${escape(entry.href)}"><span class="discovery-result__sport">${escape(labels[entry.sport])} · ${type}</span><strong>${escape(entry.name)}</strong><small>${escape(entry.description)}</small></a><button type="button" class="discovery-star" data-discovery-kind="${entry.kind}" data-discovery-sport="${entry.sport}" data-discovery-id="${escape(entry.id)}" data-discovery-name="${escape(entry.name)}" aria-pressed="${selected}" aria-label="${selected?'Unstar':'Star'} ${escape(entry.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg></button></li>`;
    }
    function init(doc){
        if(!doc.body||doc.getElementById('viewer-discovery'))return;
        const dialog=doc.createElement('dialog');dialog.id='viewer-discovery';dialog.className='viewer-discovery';dialog.setAttribute('aria-labelledby','viewer-discovery-title');
        dialog.innerHTML='<div class="discovery-head"><div><p>Find your sport</p><h2 id="viewer-discovery-title">Explore the game.</h2></div><button type="button" class="discovery-close" aria-label="Close search">×</button></div><div class="discovery-tabs" role="group" aria-label="Explore view"><button type="button" data-discovery-tab="search" aria-pressed="true">Search sport</button><button type="button" data-discovery-tab="following" aria-pressed="false">Following <span data-following-count>0</span></button></div><section data-discovery-search><label class="discovery-search-label" for="discovery-query">Competition, team or driver</label><input id="discovery-query" class="discovery-query" type="search" autocomplete="off" placeholder="Try Melbourne, Hamilton or NBA…"><div class="discovery-filters"><label>Competition<select data-discovery-sport-filter><option value="">All competitions</option>'+Object.entries(labels).map(([sport,label])=>`<option value="${sport}">${label}</option>`).join('')+'</select></label><label>Show<select data-discovery-kind-filter><option value="">All results</option><option value="league">Competitions</option><option value="team">Teams & players</option><option value="driver">Racing drivers</option></select></label></div></section><section class="discovery-following-intro" data-discovery-following hidden><p>Your stars shape the homepage. Manage them here, or star a result to follow something new.</p><button type="button" class="discovery-clear">Clear all stars</button></section><p class="discovery-status" role="status" aria-live="polite"></p><ul class="discovery-results"></ul><p class="discovery-privacy">Search stays in this browser. Stars are saved only on this device.</p>';
        doc.body.appendChild(dialog);
        const query=dialog.querySelector('#discovery-query'),results=dialog.querySelector('.discovery-results'),status=dialog.querySelector('.discovery-status');
        const sportFilter=dialog.querySelector('[data-discovery-sport-filter]'),kindFilter=dialog.querySelector('[data-discovery-kind-filter]');
        const favourites=()=>typeof ViewerFavourites!=='undefined'?ViewerFavourites:null;
        const snapshot=()=>favourites()?.get()||{leagues:[],teams:[],drivers:[]};
        let mode='search',index=buildIndex(),loading=false,loaded=false,failed=[],trigger,lastFocus;
        const selected=entry=>entry.kind==='league'?snapshot().leagues.includes(entry.sport):list(snapshot()[entry.kind==='driver'?'drivers':'teams']).some(item=>item.sport===entry.sport&&String(item.id)===entry.id);
        function render(){
            const prefs=snapshot(),saved=following(prefs);
            dialog.querySelector('[data-following-count]').textContent=String(saved.length);
            dialog.querySelectorAll('[data-discovery-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.discoveryTab===mode)));
            dialog.querySelector('[data-discovery-search]').hidden=mode!=='search';dialog.querySelector('[data-discovery-following]').hidden=mode!=='following';
            dialog.querySelector('.discovery-clear').disabled=!saved.length||!favourites();
            const matches=mode==='following'?saved:search(index,query.value,{sport:sportFilter.value,kind:kindFilter.value});
            results.innerHTML=matches.slice(0,60).map(entry=>rowMarkup(entry,selected(entry))).join('');
            if(mode==='following')status.textContent=saved.length?`${saved.length} starred ${saved.length===1?'selection':'selections'}.`:'No stars yet. Browse or search, then select a star to personalise your homepage.';
            else if(loading)status.textContent='Loading the latest saved teams and drivers…';
            else if(!query.value.trim()&&!sportFilter.value&&!kindFilter.value)status.textContent='Browse a competition, or start typing to find a team or driver.';
            else status.textContent=matches.length?`${matches.length} ${matches.length===1?'result':'results'}${matches.length>60?' · Showing the first 60; narrow your search.':'.'}`:'No matches found. Try a surname, team abbreviation or another competition.';
            if(mode==='search'&&failed.length&&!loading)status.textContent+=` Some saved lists are unavailable (${failed.map(sport=>labels[sport]||sport).join(', ')}). Competition links still work.`;
        }
        async function load(){
            if(loaded||loading)return;loading=true;render();
            const files={afl:'afl-fixtures.json',f1drivers:'drivers-championship.json',f1teams:'constructors-championship.json',f2:'f2-data.json',f3:'f3-data.json',...Object.fromEntries(['aflw','nrl','nrlw','nba','wnba','nbl','nfl','tennis'].map(sport=>[sport,`sports-data/${sport}.json`]))};
            const sources={};failed=[];
            await Promise.all(Object.entries(files).map(async([key,file])=>{try{const response=await fetch(file,{cache:'no-cache'});if(!response.ok)throw new Error('Unavailable');sources[key]=await response.json();}catch{failed.push(key.startsWith('f1')?'f1':key);}}));
            failed=[...new Set(failed)];index=buildIndex(sources);loading=false;loaded=true;render();
        }
        function open(view='search',origin){
            lastFocus=origin||doc.activeElement;mode=view;
            const others=[...doc.querySelectorAll('#viewer-sports-drawer[open],#viewer-guide[open]')];others.forEach(other=>other.close());
            const show=()=>{if(!dialog.open)dialog.showModal();doc.body.classList.add('discovery-open');render();if(mode==='search')query.focus();else dialog.querySelector('[data-discovery-tab="following"]').focus();load();};
            if(others.length)requestAnimationFrame(show);else show();
        }
        doc.querySelectorAll('[data-discovery-open]').forEach(button=>{button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);});
        doc.addEventListener('click',event=>{const button=event.target.closest?.('[data-discovery-open]');if(button)open(button.dataset.discoveryOpen==='following'?'following':'search',button);});
        const makeTrigger=(text,view='search')=>{const button=doc.createElement('button');button.type='button';button.className='viewer-discovery-trigger';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span>'+text+'</span>';button.addEventListener('click',()=>open(view,button));return button;};
        trigger=makeTrigger('Search sport');
        const topbar=doc.querySelector('.topbar-actions')||doc.querySelector('.topbar');topbar?.prepend(trigger);
        const drawer=doc.querySelector('.viewer-sports-drawer');
        if(drawer){const actions=doc.createElement('div');actions.className='discovery-drawer-actions';actions.append(makeTrigger('Search sport'),makeTrigger('Manage stars','following'));const head=drawer.querySelector('.viewer-sports-drawer__head');head?head.after(actions):drawer.prepend(actions);}
        dialog.querySelector('.discovery-close').addEventListener('click',()=>dialog.close());
        dialog.addEventListener('click',event=>{
            const tab=event.target.closest('[data-discovery-tab]');if(tab){mode=tab.dataset.discoveryTab;render();return;}
            const star=event.target.closest('[data-discovery-kind]');if(star){const api=favourites();if(!api){status.textContent='Stars are unavailable in this browser. Search links still work.';return;}const {discoveryKind:kind,discoverySport:sport,discoveryId:id,discoveryName:name}=star.dataset;if(kind==='league')api.toggleLeague(sport);else if(kind==='driver')api.toggleDriver(sport,id,name);else api.toggleTeam(sport,id,name);render();const replacement=[...dialog.querySelectorAll('[data-discovery-kind]')].find(node=>node.dataset.discoveryKind===kind&&node.dataset.discoverySport===sport&&node.dataset.discoveryId===id);(replacement||dialog.querySelector('[data-discovery-tab="following"]')).focus();return;}
            if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}
        });
        dialog.querySelector('.discovery-clear').addEventListener('click',()=>{favourites()?.clear();render();});
        query.addEventListener('input',render);sportFilter.addEventListener('change',render);kindFilter.addEventListener('change',render);
        dialog.addEventListener('close',()=>{doc.body.classList.remove('discovery-open');const drawer=doc.querySelector('.viewer-sports-drawer');if(lastFocus?.isConnected&&!lastFocus.closest('dialog:not([open])'))lastFocus.focus();else if(drawer&&!drawer.open)doc.querySelector('.viewer-mobile-nav button')?.focus();else trigger?.focus();});
        window.addEventListener('viewer-favourites-change',()=>{if(dialog.open)render();});
        doc.addEventListener('keydown',event=>{if(event.key!=='/'||event.ctrlKey||event.metaKey||event.altKey||dialog.open||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;event.preventDefault();open('search',doc.activeElement);});
    }
    return{labels,normalize,href,buildIndex,search,following,rowMarkup,init};
});
