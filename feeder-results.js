(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FeederResults=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    function lapSeconds(value){
        const text=String(value??'').trim().replace(/^\+/,'').replace(/s$/i,'');
        if(!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(text))return null;
        const seconds=text.split(':').reduce((total,part)=>total*60+Number(part),0);
        return Number.isFinite(seconds)&&seconds>0?seconds:null;
    }
    const best=row=>lapSeconds(row.bestLap);
    const defaultGap=session=>session?.type==='Race'?'interval':'leader';
    const fastest=session=>[...(session?.results||[])].filter(row=>best(row)!=null).sort((a,b)=>best(a)-best(b))[0]||null;
    const hasFastestLaps=session=>(session?.results||[]).some(row=>best(row)!=null);
    const gridText=value=>/^(pit[ -]?lane|pl)$/i.test(String(value||'').trim())?'Pit lane':Number.isInteger(Number(value))&&Number(value)>0?String(value):'—';
    const gapSeconds=value=>{const text=String(value??'').trim().replace(/^\+/,'').replace(/s$/i,'');return /^\d+(?:\.\d+)?$/.test(text)?Number(text):null;};
    const format=value=>value!=null&&Number.isFinite(value)&&value>=-0.0005?`+${Math.max(0,value).toFixed(3)}`:'—';
    function rows(session,options={}){
        const order=options.order==='fastest'?'fastest':'finish',gap=options.gap||defaultGap(session),source=session?.results||[];
        const ordered=[...source];if(order==='fastest')ordered.sort((a,b)=>(best(a)??Infinity)-(best(b)??Infinity));
        const quick=fastest(session),leaderLap=quick?best(quick):null;
        return ordered.map((row,index)=>{
            const lap=best(row),previous=ordered[index-1];let gapText='—';
            if(order==='fastest'||session.type!=='Race'){
                const reference=gap==='interval'?(previous?best(previous):null):leaderLap;
                gapText=lap==null?'—':index===0?(order==='fastest'?'Fastest':gap==='interval'?'Interval':'Leader'):reference==null?'—':format(lap-reference);
                if(lap==null&&order!=='fastest')gapText=gap==='leader'?(row.gap||'—'):(row.interval||'—');
            }else if(index===0)gapText=gap==='interval'?'Interval':'Leader';
            else if(gap==='leader')gapText=row.gap||'—';
            else if(row.interval!=null&&row.interval!=='')gapText=row.interval;
            else {const current=gapSeconds(row.gap),before=gapSeconds(previous?.gap);gapText=current!=null&&before!=null?format(current-before):row.gap||'—';}
            return {...row,gapText,isFastest:lap!=null&&lap===leaderLap,lapSeconds:lap};
        });
    }
    function validateSnapshot(data) {
        const records = value => Array.isArray(value) && value.every(row => row && typeof row === 'object' && !Array.isArray(row));
        if (!Number.isInteger(data?.season) || !records(data.drivers) || !records(data.teams) || !records(data.races) ||
            data.races.some(race => !Number.isInteger(race.round) || !records(race.sessions) || race.sessions.some(session => !records(session.results)))) {
            throw new Error('Invalid feeder-series snapshot');
        }
        return data;
    }
    return {lapSeconds,defaultGap,fastest,hasFastestLaps,gridText,rows,validateSnapshot};
});
