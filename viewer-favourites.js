(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.ViewerFavourites=api;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>api.init(document));else api.init(document);}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
    const key='cgrillo-favourites-v1';
    const sports=['afl','aflw','f1','f2','nrl','nrlw','nba','wnba','nbl','nfl','tennis'];
    const labels={afl:'AFL',aflw:'AFLW',f1:'Formula 1',f2:'Formula 2',nrl:'NRL',nrlw:'NRLW',nba:'NBA',wnba:'WNBA',nbl:'NBL',nfl:'NFL',tennis:'Tennis'};
    const empty=()=>({leagues:[],teams:[],drivers:[]});let memory=empty(),persisted=true,memoryOnly=false;
    function clean(input){
        if(!input||typeof input!=='object'||Array.isArray(input))return empty();
        const leagues=[...new Set((Array.isArray(input.leagues)?input.leagues:[]).filter(sport=>sports.includes(sport)))];
        const identities=items=>{const seen=new Set();return(Array.isArray(items)?items:[]).filter(item=>item&&typeof item==='object'&&sports.includes(item.sport)&&['string','number'].includes(typeof item.id)&&String(item.id).trim().length>0&&String(item.id).length<=150&&typeof item.name==='string').map(item=>({sport:item.sport,id:String(item.id).trim(),name:item.name.trim().slice(0,160)})).filter(item=>{const id=item.sport+':'+item.id;if(seen.has(id))return false;seen.add(id);return true;}).slice(0,100);};
        return{leagues,teams:identities(input.teams),drivers:identities(input.drivers)};
    }
    function get(){if(memoryOnly)return clean(memory);let raw;try{raw=root.localStorage.getItem(key);}catch{memoryOnly=true;return clean(memory);}try{memory=raw?clean(JSON.parse(raw)):empty();}catch{memory=empty();}return clean(memory);}
    function save(snapshot){memory=clean(snapshot);persisted=true;try{root.localStorage.setItem(key,JSON.stringify(memory));memoryOnly=false;}catch{persisted=false;memoryOnly=true;}if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new root.CustomEvent('viewer-favourites-change',{detail:clean(memory)}));return clean(memory);}
    const isLeague=sport=>get().leagues.includes(sport);
    const isTeam=(sport,id)=>get().teams.some(item=>item.sport===sport&&item.id===String(id));
    const isDriver=(sport,id)=>get().drivers.some(item=>item.sport===sport&&item.id===String(id));
    function toggleLeague(sport){if(!sports.includes(sport))return get();const snapshot=get();snapshot.leagues=snapshot.leagues.includes(sport)?snapshot.leagues.filter(item=>item!==sport):[...snapshot.leagues,sport];return save(snapshot);}
    function toggleIdentity(kind,sport,id,name){if(!sports.includes(sport)||!['string','number'].includes(typeof id)||!String(id).trim())return get();const snapshot=get(),identifier=String(id);const exists=snapshot[kind].some(item=>item.sport===sport&&item.id===identifier);snapshot[kind]=exists?snapshot[kind].filter(item=>item.sport!==sport||item.id!==identifier):[...snapshot[kind],{sport,id:identifier,name:String(name||id)}];return save(snapshot);}
    const toggleTeam=(sport,id,name)=>toggleIdentity('teams',sport,id,name);
    const toggleDriver=(sport,id,name)=>toggleIdentity('drivers',sport,id,name);
    const hasAny=()=>{const value=get();return Boolean(value.leagues.length||value.teams.length||value.drivers.length);};
    const clear=()=>save(empty());
    function init(doc){
        if(!doc.body||doc.body.dataset.favouritesReady)return;doc.body.dataset.favouritesReady='true';
        const route=()=>{const slug=location.pathname.split('/').pop()?.replace(/\.html$/,'');const query=new URLSearchParams(location.search);return{sport:sports.includes(slug)?slug:sports.includes(query.get('sport'))?query.get('sport'):null,query};};
        const button=(kind,sport,id,name)=>{const node=doc.createElement('button');node.type='button';node.className='viewer-star';node.dataset.favouriteKind=kind;node.dataset.favouriteSport=sport;node.dataset.favouriteId=id||'';node.dataset.favouriteName=name;node.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg>';return node;};
        const updateButtons=()=>{const snapshot=get();doc.querySelectorAll('[data-favourite-kind]').forEach(node=>{const {favouriteKind:kind,favouriteSport:sport,favouriteId:id,favouriteName:name}=node.dataset;const selected=kind==='league'?snapshot.leagues.includes(sport):snapshot[kind==='driver'?'drivers':'teams'].some(item=>item.sport===sport&&item.id===id);node.setAttribute('aria-pressed',String(selected));const label=`${selected?'Unstar':'Star'} ${name}`;node.setAttribute('aria-label',label);node.title=label+' · Saved on this device only';});};
        function decorate(){
            const {sport,query}=route();
            const heading=sport&&(doc.querySelector('.sports-heading h2')||doc.querySelector(`#${sport}-fixtures-title`));
            if(heading&&!heading.querySelector('[data-favourite-kind="league"]'))heading.appendChild(button('league',sport,sport,labels[sport]));
            doc.querySelectorAll('.home-league-heading a').forEach(anchor=>{const slug=anchor.getAttribute('href')?.replace(/\.html.*$/,'');if(sports.includes(slug)&&!anchor.parentElement.querySelector('[data-favourite-kind="league"]'))anchor.parentElement.appendChild(button('league',slug,slug,labels[slug]));});
            const profile=doc.querySelector('#f1-profile-heading')||doc.querySelector('.viewer-profile-head h2');
            const identityKind=query.has('team')?'team':query.has('driver')?'driver':null;
            if(sport&&identityKind&&profile&&!profile.querySelector('.viewer-star'))profile.appendChild(button(identityKind,sport,query.get(identityKind),profile.textContent.trim()));
            doc.querySelectorAll('.ladder-card a[href], .standings-panel a[href], .f2-results a[href]').forEach(anchor=>{
                if(anchor.dataset.favouriteDecorated||anchor.closest('.viewer-star'))return;
                let target;try{target=new URL(anchor.href,location.href);}catch{return;}
                const targetSlug=target.pathname.split('/').pop();const team=target.searchParams.get('team');const driver=target.searchParams.get('driver');
                const targetSport=targetSlug==='sport-view.html'?target.searchParams.get('sport'):targetSlug==='f1.html'?'f1':targetSlug==='f2.html'?'f2':null;
                if(!sports.includes(targetSport)||(!team&&!driver))return;
                const name=anchor.title||anchor.textContent.trim().replace(/\s+/g,' ');if(!name)return;
                anchor.dataset.favouriteDecorated='true';const wrap=doc.createElement('span');wrap.className='viewer-favourite-link';anchor.before(wrap);wrap.appendChild(anchor);wrap.appendChild(button(team?'team':'driver',targetSport,team||driver,name));
            });
            updateButtons();
        }
        const toast=doc.createElement('p');toast.className='viewer-favourites-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');toast.hidden=true;doc.body.appendChild(toast);let timer;
        doc.addEventListener('click',event=>{const target=event.target.closest?.('[data-favourite-kind]');if(!target)return;const {favouriteKind:kind,favouriteSport:sport,favouriteId:id,favouriteName:name}=target.dataset;event.preventDefault();if(kind==='league')toggleLeague(sport);else if(kind==='driver')toggleDriver(sport,id,name);else toggleTeam(sport,id,name);clearTimeout(timer);toast.textContent=persisted?'Preferences saved on this device only.':'Preferences are kept for this visit; browser storage is unavailable.';toast.hidden=false;timer=setTimeout(()=>{toast.hidden=true;},3200);});
        root.addEventListener('viewer-favourites-change',updateButtons);
        root.addEventListener('storage',event=>{if(event.key===key||event.key===null){memory=empty();memoryOnly=false;const snapshot=get();root.dispatchEvent(new root.CustomEvent('viewer-favourites-change',{detail:snapshot}));}});
        let pending=false;const observer=new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;decorate();});});observer.observe(doc.body,{childList:true,subtree:true});decorate();
    }
    return{get,toggleLeague,toggleTeam,toggleDriver,isLeague,isTeam,isDriver,hasAny,clear,init,clean,storageKey:key};
});
