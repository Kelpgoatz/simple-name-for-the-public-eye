(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WeekendProgress=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    const states={complete:'Classified',awaiting:'Awaiting results',next:'Up next',scheduled:'Scheduled',unconfirmed:'Time TBC',unavailable:'Unavailable',cancelled:'Cancelled'};
    function dayInZone(now,timeZone){
        const parts=new Intl.DateTimeFormat('en-CA',{...(timeZone?{timeZone}:{}),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
        const part=type=>parts.find(item=>item.type===type)?.value;
        return `${part('year')}-${part('month')}-${part('day')}`;
    }
    function build(sessions,{selected=null,now=Date.now(),timeZone}={}){
        const today=dayInZone(now,timeZone);
        const items=(sessions||[]).map((session,index)=>{
            const key=session.key??String(index);
            const exact=typeof session.startTime==='string'&&/T\d{2}:\d{2}/i.test(session.startTime)?Date.parse(session.startTime):NaN;
            const timestamp=Number.isFinite(exact)?exact:null;
            const rawDay=session.date||session.startTime;
            const day=typeof rawDay==='string'&&/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(rawDay)&&Number.isFinite(Date.parse(rawDay.slice(0,10)))?rawDay.slice(0,10):null;
            const status=String(session.status||session.state||'').toLowerCase();
            const cancelled=/^cancelled$|^canceled$/.test(status);
            const inProgress=/^(?:live|in_progress|in-progress|running|started|ongoing)$/.test(status);
            const complete=Array.isArray(session.results)&&session.results.length>0&&!inProgress&&!cancelled;
            const awaiting=!complete&&!cancelled&&(inProgress||status==='completed'||status==='concluded'||timestamp!==null&&timestamp<now||timestamp===null&&day&&day<today);
            const state=complete?'complete':cancelled?'cancelled':awaiting?'awaiting':timestamp!==null?'scheduled':status==='unavailable'&&!day?'unavailable':'unconfirmed';
            return {...session,key,timestamp,day,state,selected:String(key)===String(selected)};
        });
        const future=items.filter(item=>!['complete','awaiting','cancelled','unavailable'].includes(item.state)&&(item.timestamp!==null?item.timestamp>=now:item.day&&item.day>=today))
            .sort((a,b)=>(a.day||'9999').localeCompare(b.day||'9999')||(a.timestamp??Infinity)-(b.timestamp??Infinity));
        const counts=new Map();
        for(const item of future)if(item.timestamp!==null)counts.set(item.timestamp,(counts.get(item.timestamp)||0)+1);
        for(const item of future)item.provisional=item.timestamp!==null&&counts.get(item.timestamp)>1;
        const next=future[0]||null;
        if(next)next.state='next';
        return {items,next,provisionalTimes:future.some(item=>item.provisional),completed:items.filter(item=>item.state==='complete').length,total:items.length,awaiting:items.filter(item=>item.state==='awaiting'),cancelled:items.filter(item=>item.state==='cancelled')};
    }
    function formatStart(session,{timeZone,locale='en-AU'}={}){
        const timestamp=typeof session.timestamp==='number'?session.timestamp:typeof session.startTime==='string'&&/T\d{2}:\d{2}/i.test(session.startTime)?Date.parse(session.startTime):NaN;
        if(Number.isFinite(timestamp))return new Intl.DateTimeFormat(locale,{...(timeZone?{timeZone}:{}),weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(timestamp));
        const day=session.day||session.date||session.startTime;
        if(typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))){
            return `${new Intl.DateTimeFormat(locale,{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(new Date(`${day}T12:00:00Z`))} · Time TBC`;
        }
        return 'Time to be confirmed';
    }
    function summary(progress,options={}){
        if(progress.next)return {title:`Up next · ${progress.next.label||progress.next.title||'Session'}`,detail:formatStart(progress.next,options),note:progress.awaiting.length?`${progress.awaiting.length} earlier ${progress.awaiting.length===1?'classification':'classifications'} pending`:''};
        if(progress.total&&progress.completed===progress.total)return {title:'Weekend complete',detail:'Every session has a saved classification.',note:''};
        if(progress.awaiting.length)return {title:'Results pending',detail:`${progress.awaiting.length} ${progress.awaiting.length===1?'session is':'sessions are'} awaiting classification.`,note:''};
        if(progress.cancelled.length&&progress.completed+progress.cancelled.length===progress.total)return {title:'Weekend finished',detail:`${progress.cancelled.length} ${progress.cancelled.length===1?'session was':'sessions were'} cancelled.`,note:''};
        return {title:'Timetable pending',detail:'Session times will appear when published.',note:''};
    }
    function overviewMarkup(progress,options={}){
        const cue=summary(progress,options),percent=progress.total?progress.completed/progress.total*100:0;
        return `<div class="weekend-overview"><div class="weekend-overview__head"><span>Weekend progress</span><strong>${progress.completed} / ${progress.total} classified</strong></div><div class="weekend-overview__track" aria-hidden="true"><span style="width:${percent}%"></span></div><p class="weekend-overview__cue"><strong>${esc(cue.title)}</strong><span>${esc(cue.detail)}</span>${cue.note?`<small>${esc(cue.note)}</small>`:''}</p>${progress.provisionalTimes?'<p class="weekend-overview__warning">Some session times are provisional. Check the official timetable as the weekend approaches.</p>':''}<p class="weekend-overview__zone">${options.timeZone==='Australia/Sydney'?'Sydney time':'Your local time'} · Select a session below</p></div>`;
    }
    function tabMarkup(item,options={}){
        return `<span class="weekend-tab__label"><span class="weekend-tab__dot" aria-hidden="true">${item.state==='complete'?'✓':''}</span>${esc(item.label||item.title||'Session')}</span><span class="weekend-tab__time">${esc(formatStart(item,options))}</span><span class="weekend-tab__state">${esc(states[item.state]||'Time TBC')}</span>`;
    }
    return {build,formatStart,summary,overviewMarkup,tabMarkup,stateLabel:state=>states[state]||'Time TBC'};
});
