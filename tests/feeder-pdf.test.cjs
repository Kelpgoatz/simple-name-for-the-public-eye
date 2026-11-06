const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const api=import('../scripts/lib/fia-feeder-pdf.mjs');
const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
test('timing PDF rows use explicit column headers and never confuse race times with fastest laps',async()=>{
    const {classificationItems}=await api;
    const items=[item('NO',41,650),item('DRIVER',61,650),item('NAT TEAM',156,650),item('TIME',339,650),item('FASTEST',495,650),item('ON',537,650),item('1',31,630),item('7',49,630),item('Alex EXAMPLE',61,630),item('Team',174,630),item('51:05.855',334,630),item('1:33.031',495,630),item('27',537,630)];
    const [row]=classificationItems(items,'Race');
    assert.equal(row.Nr,'7');assert.equal(row.Driver,'Alex EXAMPLE');assert.equal(row['Best lap'],'1:33.031');assert.equal(row['Best lap lap'],'27');assert.equal(row.grid,undefined);
    assert.deepEqual(classificationItems(items.filter(item=>item.str!=='FASTEST'),'Race'),[]);
});
test('only directly labelled PDF classifications can enrich the corresponding race in multi-race weekends',async()=>{
    const {classificationPdfLinks}=await api;
    const html='<a href="/2026_x_f2_sprintraceprovisionalclassification.pdf">Sprint</a><a href="/2026_x_f2_featureraceprovisionalclassification.pdf">Feature</a><a href="/2026_x_f2_featureracelaptimes.pdf">Laps</a>';
    assert.equal(classificationPdfLinks(html,{type:'Race',label:'Sprint Race'},[]).length,1);
    assert.equal(classificationPdfLinks(html,{type:'Race',label:'Feature Race'},[{label:'Feature Race'}]).length,1);
    assert.equal(classificationPdfLinks(html,{type:'Race',label:'Feature Race 2'},[{label:'Feature Race 1'},{label:'Feature Race 2'}]).length,0);
});
test('saved F2 and F3 race sessions contain sourced fastest laps including the Monza PDF fallback',()=>{
    for(const series of ['f2','f3']){
        const data=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..',series+'-data.json')));
        const races=data.races.flatMap(race=>race.sessions).filter(session=>session.type==='Race'&&session.results.length);
        assert.ok(races.length);
        for(const session of races)assert.ok(session.results.some(row=>/^\d+:\d{2}\.\d+$/.test(row.bestLap||'')),`${series} ${session.label} has recorded lap times`);
        if(series==='f2')for(const session of data.races.find(race=>race.round===10).sessions.filter(session=>session.type==='Race'))assert.match(session.pdfTimingSource,/^https:\/\/www\.fia\.com\/.*\.pdf$/);
    }
});
