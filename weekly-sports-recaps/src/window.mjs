const partsFor=(timestamp,timeZone)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
const dateOf=parts=>`${parts.year}-${parts.month}-${parts.day}`;
export function shiftDate(date,days){return new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);}
export function localInstant(date,hour,timeZone='Australia/Sydney'){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(hour)||hour<0||hour>23)throw new Error('Use a valid YYYY-MM-DD date and hour');
    const [year,month,day]=date.split('-').map(Number),target=Date.UTC(year,month-1,day,hour);
    if(new Date(target).toISOString().slice(0,10)!==date)throw new Error('Invalid calendar date');
    let guess=target;
    for(let step=0;step<4;step++){
        const p=partsFor(guess,timeZone),wall=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));
        const adjustment=target-wall;if(!adjustment)return guess;guess+=adjustment;
    }
    throw new Error('Cannot resolve the local reporting boundary');
}
export function reportingWindow({now=Date.now(),weekEnding,timeZone='Australia/Sydney',hour=18}={}){
    const timestamp=new Date(now).getTime();if(!Number.isFinite(timestamp))throw new Error('Invalid current time');
    const today=dateOf(partsFor(timestamp,timeZone));
    let endDate=weekEnding;
    if(!endDate){const weekday=new Date(`${today}T12:00:00Z`).getUTCDay();endDate=shiftDate(today,-((weekday+6)%7));if(localInstant(endDate,hour,timeZone)>timestamp)endDate=shiftDate(endDate,-7);}
    const end=localInstant(endDate,hour,timeZone),startDate=shiftDate(endDate,-7),start=localInstant(startDate,hour,timeZone);
    if(end>timestamp)throw new Error('The requested reporting week has not finished yet');
    const label=new Intl.DateTimeFormat('en-AU',{timeZone,weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(end);
    return {id:endDate,start:new Date(start).toISOString(),end:new Date(end).toISOString(),timeZone,startLocalDate:startDate,endLocalDate:endDate,endingHour:hour,label:`Week ending ${label}, ${hour===18?'6 pm':`${String(hour).padStart(2,'0')}:00`} Sydney time`};
}
