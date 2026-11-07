(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.HomeControls=api;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>api.init(document));else api.init(document);}})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const labels={afl:'AFL',aflw:'AFLW',f1:'F1',f2:'F2',f3:'F3',nrl:'NRL',nrlw:'NRLW',nba:'NBA',wnba:'WNBA',nbl:'NBL',nfl:'NFL',tennis:'Tennis'};
    const categories = {
        Motorsport: ['f1', 'f2', 'f3'],
        'Australian rules football': ['afl', 'aflw'],
        'Rugby league': ['nrl', 'nrlw'],
        Basketball: ['nba', 'wnba', 'nbl'],
        'American football': ['nfl'],
        Tennis: ['tennis']
    };
    const tabs={all:'All',live:'Live',upcoming:'Upcoming',results:'Results'};
    function matchesFilter(game,filter={}){return(!filter.league||game.sport===filter.league)&&(!filter.type||filter.type==='all'||game.type===filter.type);}
    function counts(games,league=''){
        const result={all:0,live:0,upcoming:0,results:0};
        for(const game of games||[]){if(league&&game.sport!==league)continue;result.all++;if(Object.hasOwn(result,game.type)&&game.type!=='all')result[game.type]++;}
        return result;
    }
    function init(doc){
        const host=doc.querySelector('[data-afl-games]');if(!host||doc.querySelector('.home-controls'))return;
        const toolbar=doc.createElement('div');toolbar.className='home-controls';toolbar.setAttribute('aria-label','Homepage game filters');
        toolbar.innerHTML='<div class="home-controls__tabs" role="group" aria-label="Game status">'+Object.entries(tabs).map(([key,label])=>`<button type="button" data-home-filter="${key}" aria-pressed="${key==='all'}"><span>${label}</span> <b data-home-count="${key}">0</b></button>`).join('')+'</div><label class="home-controls__league">Competition<select aria-label="Filter homepage competition"><option value="">All shown</option></select></label><p class="home-controls__status" role="status" aria-live="polite"></p>';
        host.before(toolbar);
        const empty=doc.createElement('div');empty.className='home-controls-empty';empty.hidden=true;empty.innerHTML='<p data-home-empty-title>No events match these filters right now.</p><p data-home-empty-hint>The homepage shows a short window. Open a competition to browse its complete fixtures.</p><button type="button">Reset filters</button> <a href="about.html#competitions">Browse full fixtures →</a>';host.after(empty);
        const windowNote=doc.createElement('details');windowNote.className='home-window-note';windowNote.innerHTML='<summary>Which events are shown?</summary><p>The default view shows live events, upcoming starts within 24 hours (16 hours for NBA and WNBA), and recent results. Formula 1 looks five days ahead. Show full week includes fixtures and results for the Monday–Sunday range above. Following can also show your next or latest event outside the selected window.</p>';toolbar.appendChild(windowNote);
        const select=toolbar.querySelector('select'),status=toolbar.querySelector('.home-controls__status');
        let filter={type:'all',league:''},records=[],pending=false,optionSignature='';
        const text=(node,value)=>{if(node.textContent!==String(value))node.textContent=String(value);};
        const sportOf=card=>card.closest('.home-league-games[data-league]')?.dataset.league||card.dataset.sport||(card.classList.contains('f1-game')?'f1':'afl');
        function apply(){
            const filtered=filter.type!=='all'||Boolean(filter.league),summary=counts(records,filter.league);
            toolbar.querySelectorAll('[data-home-filter]').forEach(button=>{const key=button.dataset.homeFilter;const count=summary[key];button.setAttribute('aria-pressed',String(key===filter.type));button.setAttribute('aria-label',`${tabs[key]} ${count} ${count===1?'event':'events'}`);text(button.querySelector('b'),count);});
            let visible=0;
            records.forEach(record=>{const show=matchesFilter(record,filter);record.element.hidden=!show;record.element.classList.remove('home-controls-wide');if(show)visible++;});
            host.querySelectorAll('.home-league-games').forEach(group=>{const shown=records.filter(record=>group.contains(record.element)&&!record.element.hidden);group.hidden=filtered&&!shown.length;if(filtered&&shown.length%2&&!shown.some(record=>record.element.classList.contains('home-game--expanded')))shown[0]?.element.classList.add('home-controls-wide');});
            host.querySelectorAll('.afl-games__section').forEach(section=>{
                section.querySelectorAll('.home-league-heading').forEach(heading=>{const slug=heading.querySelector('a')?.getAttribute('href')?.replace(/\.html.*$/,'');heading.hidden=filtered&&!records.some(record=>section.contains(record.element)&&record.sport===slug&&!record.element.hidden);});
                section.hidden=filtered&&!records.some(record=>section.contains(record.element)&&!record.element.hidden);
            });
            host.querySelectorAll(':scope > .afl-games__empty').forEach(element=>{element.hidden=filtered;});
            const busy = host.getAttribute('aria-busy')==='true';
            empty.hidden=!filtered||visible>0||busy;
            const scope=filter.league?labels[filter.league]:'all shown competitions';
            text(status,busy?'Loading games and races…':filtered?`${visible} ${visible===1?'event':'events'} · ${tabs[filter.type]} · ${scope}`:`${records.length} events · Sydney time`);
            text(empty.querySelector('[data-home-empty-title]'),filter.type==='live'?'No live events in this view right now.':filter.type==='results'?'No recent results in this view right now.':filter.type==='upcoming'?'No upcoming events in this view right now.':'No events match this competition right now.');
        }
        function scan(){
            records=[...host.querySelectorAll('.afl-game')].map(element=>({element,sport:sportOf(element),type:element.dataset.homeEventType}));
            const countBySport = new Map();
            for (const record of records) countBySport.set(record.sport, (countBySport.get(record.sport) || 0) + 1);
            const signature = JSON.stringify([...countBySport]);
            if(signature!==optionSignature){
                optionSignature=signature;select.replaceChildren();
                const all=doc.createElement('option');all.value='';all.textContent=`All shown (${records.length})`;select.appendChild(all);
                for (const [category, leagues] of Object.entries(categories)) {
                    const group = doc.createElement('optgroup');
                    group.label = category;
                    for (const sport of leagues) {
                        if (['f2', 'f3'].includes(sport) && !countBySport.has(sport) && sport !== filter.league) continue;
                        const option = doc.createElement('option');
                        option.value = sport;
                        option.textContent = `${labels[sport]} (${countBySport.get(sport) || 0})`;
                        group.appendChild(option);
                    }
                    select.appendChild(group);
                }
            }
            select.value=filter.league||'';
            apply();
        }
        toolbar.addEventListener('click',event=>{const button=event.target.closest('[data-home-filter]');if(!button)return;filter={...filter,type:button.dataset.homeFilter};apply();});
        select.addEventListener('change',()=>{filter={...filter,league:select.value};apply();});
        empty.querySelector('button').addEventListener('click',()=>{filter={type:'all',league:''};select.value='';apply();toolbar.querySelector('[data-home-filter="all"]').focus();});
        const observer=new MutationObserver(changes=>{if(pending||!changes.some(change=>change.target===host))return;pending=true;requestAnimationFrame(()=>{pending=false;scan();});});observer.observe(host,{childList:true,attributes:true,attributeFilter:['aria-busy']});scan();
    }
    return{labels,matchesFilter,counts,init};
});
