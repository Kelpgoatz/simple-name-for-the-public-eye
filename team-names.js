(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TeamNames=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
    const women=new Set(['aflw','nrlw','wnba']);
    const afl={stkilda:'St Kilda Saints',carlton:'Carlton Blues',hawthorn:'Hawthorn Hawks',melbourne:'Melbourne Demons',northmelbourne:'North Melbourne Kangaroos',richmond:'Richmond Tigers',collingwood:'Collingwood Magpies',essendon:'Essendon Bombers',fremantle:'Fremantle Dockers',portadelaide:'Port Adelaide Power'};
    const nrl={sharks:'Cronulla-Sutherland Sharks',titans:'Gold Coast Titans',roosters:'Sydney Roosters',dragons:'St George Illawarra Dragons',cowboys:'North Queensland Cowboys',eels:'Parramatta Eels',warriors:'New Zealand Warriors',bulldogs:'Canterbury-Bankstown Bulldogs'};
    function label(sport,team){
        const raw=String(typeof team==='string'?team:team?.name||'To be confirmed');
        if(!women.has(sport)||/^(winner|loser|to be confirmed|tbc)\b/i.test(raw))return raw;
        const base=raw.replace(/\s+(women(?:[’']s)?|woman(?:[’']s)?)$/i,'');
        const key=base.toLowerCase().replace(/[^a-z]/g,'');
        return `${(sport==='aflw'?afl[key]:sport==='nrlw'?nrl[key]:null)||base} Women’s`;
    }
    return {label};
});
