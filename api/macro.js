import {begin,upstream} from './_shared.js';
import {csvSeries} from '../lib/analytics.js';
export default async function handler(req,res) {
  if(!begin(req,res,'macro'))return;
  const end=new Date().toISOString().slice(0,10), start=new Date(Date.now()-500*86400000).toISOString().slice(0,10);
  const definitions=[['tga','WTREGEN','millions'],['reserves','WRESBAL','millions'],['rrp','RRPONTSYD','billions']];
  const entries=await Promise.all(definitions.map(async([key,id,unit])=>{
    try {
      const text=await upstream(`https://fred.stlouisfed.org/graph/fredgraph.csv?${new URLSearchParams({id,cosd:start,coed:end})}`,'text');
      const rows=csvSeries(text,id).map(r=>({...r,value:unit==='millions'?r.value/1000:r.value}));
      if(!rows.length)throw new Error('Sin observaciones');
      return [key,{id,rows,unit:'miles de millones USD',source:`https://fred.stlouisfed.org/series/${id}`}];
    }catch{return [key,{id,error:'Fuente temporalmente no disponible',rows:[]}];}
  }));
  res.setHeader('Cache-Control',entries.every(([,v])=>!v.error)?'public, s-maxage=900, stale-while-revalidate=300':'no-store');res.status(200).json({generatedAt:new Date().toISOString(),...Object.fromEntries(entries)});
}
