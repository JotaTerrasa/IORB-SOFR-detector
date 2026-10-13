export const day = (d) => new Date(d).toISOString().slice(0, 10);
export const finite = (v) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v));
export function number(v) { return finite(v) ? Number(v) : null; }
export function csvSeries(text, column) {
  const lines = text.trim().split(/\r?\n/), head = lines.shift().split(',');
  const di = head.indexOf('observation_date'), vi = head.indexOf(column);
  if (di < 0 || vi < 0) throw new Error(`CSV ${column} inválido`);
  return lines.map(line => line.split(',')).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r[di]) && finite(r[vi]))
    .map(r => ({ date: r[di], value: Number(r[vi]) })).sort((a,b) => a.date.localeCompare(b.date));
}
export function atDate(series, date) {
  // Never backfill with a value from the future.
  let result = null;
  for (const r of series) { if (r.date > date) break; result = r; }
  return result;
}
export function pearson(x,y) {
  if (x.length !== y.length || x.length < 3 || !x.every(Number.isFinite) || !y.every(Number.isFinite)) return null;
  const mx=x.reduce((s,v)=>s+v,0)/x.length, my=y.reduce((s,v)=>s+v,0)/y.length;
  let xx=0, yy=0, xy=0;
  x.forEach((v,i)=>{xx+=(v-mx)**2; yy+=(y[i]-my)**2; xy+=(v-mx)*(y[i]-my);});
  return xx>1e-20 && yy>1e-20 ? Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))) : null;
}
export function correlations(candles, sofr, iorb, window=30) {
  const byDay=new Map(candles.map(c=>[c.date,c]));
  const pairs=sofr.flatMap(r=>{
    const rate=atDate(iorb,r.date), c=byDay.get(r.date);
    const prev=byDay.get(day(new Date(r.date+'T00:00:00Z').getTime()-86400000));
    return rate && c && prev ? [{date:r.date, spread:r.value-rate.value, ret:c.c/prev.c-1}] : [];
  }).slice(-window);
  return {value:pairs.length===window ? pearson(pairs.map(r=>r.ret),pairs.map(r=>r.spread)) : null,n:pairs.length};
}
export function liquidity(spread, band=5) {
  if (!Number.isFinite(spread)) return {label:'Sin datos', tone:'muted', detail:'No hay tasas verificadas para calcular el diferencial.'};
  if (spread>band) return {label:'Presión de financiación',tone:'warn',detail:'SOFR supera IORB por encima de la banda elegida. Conviene observar persistencia y otros indicadores.'};
  if (spread < -band) return {label:'SOFR por debajo de IORB',tone:'calm',detail:'La financiación repo cuesta menos que la remuneración de reservas. No implica una dirección para BTC.'};
  return {label:'Diferencial contenido',tone:'calm',detail:'SOFR está cerca de IORB dentro de la banda elegida. La banda es orientativa, no un umbral oficial de la Fed.'};
}
export function spreadRows(sofr,iorb) {
  return sofr.flatMap(r=>{const i=atDate(iorb,r.date); return i ? [{date:r.date,value:(r.value-i.value)*100}] : [];});
}
export function atr(candles, period=14) {
  return candles.map((c,i)=>{
    if (i<period) return null;
    const rows=candles.slice(i-period+1,i+1);
    if (rows.some((r,j)=>new Date(r.date)-new Date(candles[i-period+j].date)!==86400000)) return null;
    return rows.reduce((sum,r,j)=>{const prev=candles[i-period+j].c; return sum+Math.max(r.h-r.l,Math.abs(r.h-prev),Math.abs(r.l-prev));},0)/period;
  });
}
function observed(date) {
  const d=new Date(date+'T00:00:00Z'); if(d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()-1); if(d.getUTCDay()===0)d.setUTCDate(d.getUTCDate()+1); return day(d);
}
function nthMonday(y,m,n) {const d=new Date(Date.UTC(y,m,1)); d.setUTCDate(1+(8-d.getUTCDay())%7+7*(n-1)); return day(d);}
function easter(y) {
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=(h+l-7*m+114)%31+1;
  return new Date(Date.UTC(y,mo-1,da));
}
export function nextPublicationDate(date) {
  const d=new Date(date+'T00:00:00Z');
  do {
    d.setUTCDate(d.getUTCDate()+1); const y=d.getUTCFullYear(), e=easter(y); e.setUTCDate(e.getUTCDate()-2);
    const holidays=[observed(`${y}-01-01`),observed(`${y+1}-01-01`),nthMonday(y,0,3),nthMonday(y,1,3),day(e),nthMonday(y,8,1),nthMonday(y,9,2),nthMonday(y,10,4),observed(`${y}-06-19`),observed(`${y}-07-04`),observed(`${y}-11-11`),observed(`${y}-12-25`)];
    const memorial=new Date(Date.UTC(y,4,31)); while(memorial.getUTCDay()!==1) memorial.setUTCDate(memorial.getUTCDate()-1); holidays.push(day(memorial));
    if(d.getUTCDay()!==0 && d.getUTCDay()!==6 && !holidays.includes(day(d)))return day(d);
  } while(true);
}
export function staleSofr(date, now=new Date()) {
  if(!date) return true;
  // Allow the normal publication delay, weekends and US securities holidays.
  const expected=nextPublicationDate(nextPublicationDate(date));
  const ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const p=Object.fromEntries(ny.map(x=>[x.type,x.value])); const today=`${p.year}-${p.month}-${p.day}`;
  return today>expected || (today===expected && Number(p.hour)>=10);
}
export function hypothesis(rows,band=5) {
  if(rows.length<8)return {side:'NEUTRAL',delta:null,reason:'Faltan ocho observaciones de SOFR.'};
  const last=rows.at(-1), delta=last.value-rows.at(-8).value;
  if(Math.abs(last.value)>band)return {side:'NEUTRAL',delta,reason:'Fuera de la banda orientativa.'};
  if(Math.abs(delta)<0.5)return {side:'NEUTRAL',delta,reason:'El diferencial apenas ha cambiado.'};
  return {side:delta<0?'LONG':'SHORT',delta,reason:'Hipótesis experimental: diferencial descendente → LONG; ascendente → SHORT. No acredita capacidad predictiva.'};
}
export function riskPosition({side,equity,risk,leverage,entry,stop,target,fees=12,mmr=0.5,extra=0}) {
  if(!['LONG','SHORT'].includes(side))return {error:'Selecciona LONG o SHORT.'};
  if(![equity,risk,leverage,entry,stop,target,fees,mmr,extra].every(Number.isFinite))return {error:'Completa los valores numéricos.'};
  if(equity<=0 || entry<=0 || stop<=0 || target<=0 || risk<=0 || risk>100 || leverage<1 || leverage>125 || fees<0 || mmr<0 || mmr>=100/leverage || extra<0)return {error:'Revisa saldo, riesgo, precios, apalancamiento y márgenes.'};
  const dir=side==='LONG'?1:-1;
  if(dir*(entry-stop)<=0 || dir*(target-entry)<=0)return {error:'LONG requiere stop < entrada < objetivo; SHORT requiere objetivo < entrada < stop.'};
  const budget=equity*risk/100, distance=Math.abs(entry-stop);
  // Include entry and stop exit commissions in the budget, rather than adding them afterwards.
  const feePerBtc=(entry+stop)*fees/20000, qty=budget/(distance+feePerBtc), margin=qty*entry/leverage;
  const feeCost=qty*feePerBtc, reward=qty*(Math.abs(target-entry)-(entry+target)*fees/20000);
  const liq=side==='LONG' ? (entry-entry/leverage-extra/qty)/(1-mmr/100) : (entry+entry/leverage+extra/qty)/(1+mmr/100);
  const warnings=[];
  if(margin+extra>equity)warnings.push('El margen requerido supera tu saldo.');
  if(liq>0 && dir*(stop-liq)<=0)warnings.push('La liquidación estimada ocurre antes del stop.');
  return {qty,margin,budget,feeCost,reward,rr:reward/budget,liq:liq>0?liq:null,warnings};
}
export function backtest(candles,sofr,iorb,{band=5,fees=12}={}) {
  const a=atr(candles), rows=spreadRows(sofr,iorb).map(r=>({...r,available:nextPublicationDate(r.date)})), trades=[];
  for(let i=15;i<candles.length-1;i++) {
    const known=rows.filter(r=>r.available<=candles[i].date), h=hypothesis(known,band);
    // IORB change on the signal date must not invalidate the observed spread silently.
    if(h.side==='NEUTRAL' || !Number.isFinite(a[i]) || !known.length || new Date(candles[i].date)-new Date(known.at(-1).date)>7*86400000)continue;
    const dir=h.side==='LONG'?1:-1, entry=candles[i+1].o, distance=a[i]*1.5, stop=entry-dir*distance,target=entry+dir*distance*2;
    if(stop<=0 || target<=0)continue;
    let end=Math.min(i+7,candles.length-1), exit=candles[end].c, reason='7 días';
    for(let j=i+1;j<=end;j++) {
      const c=candles[j];
      if(j>i+1 && new Date(c.date)-new Date(candles[j-1].date)!==86400000){end=j-1;exit=candles[end].c;reason='Hueco de datos';break;}
      const gapStop=dir===1?c.o<=stop:c.o>=stop, gapTarget=dir===1?c.o>=target:c.o<=target;
      const hitStop=dir===1?c.l<=stop:c.h>=stop,hitTarget=dir===1?c.h>=target:c.l<=target;
      if(gapStop || gapTarget || hitStop || hitTarget){end=j;exit=gapStop||gapTarget?c.o:hitStop?stop:target;reason=gapStop||hitStop?'Stop':'Objetivo';break;}
    }
    if (end < i+7 && reason === '7 días') continue; // Unfinished positions are not counted as closed.
    const netR=(dir*(exit-entry)-(entry+exit)*fees/20000)/distance;
    trades.push({date:candles[i+1].date,exitDate:candles[end].date,side:h.side,entry,exit,netR,reason}); i=end;
  }
  let equity=0,peak=0,drawdown=0; trades.forEach(t=>{equity+=t.netR;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);});
  return {trades,winrate:trades.length?trades.filter(t=>t.netR>0).length/trades.length:null,expectancy:trades.length?equity/trades.length:null,drawdown};
}
