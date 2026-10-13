import {begin,range,upstream,fail} from './_shared.js';
export default async function handler(req,res) {
  if(!begin(req,res,'nyfed'))return;
  let url;
  if(req.query.kind==='sofr_last')url='https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json';
  else if(req.query.kind==='sofr_search'&&range(String(req.query.startDate),String(req.query.endDate)))url=`https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?${new URLSearchParams({startDate:req.query.startDate,endDate:req.query.endDate})}`;
  else {res.status(400).json({error:'Consulta o fechas inválidas.'});return;}
  try{const data=await upstream(url);if(!Array.isArray(data.refRates))throw new Error('Datos inválidos');res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=60');res.status(200).json(data);}catch{fail(res);}
}
