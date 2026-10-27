// State boundaries shared by all browser views. Original v1 backups are retained.
(function(root){
 const city=s=>String(s||'').trim().replace(/市$/,'');
 function inferCity(h,state){if(h.city)return h.city;const d=state.researchDossier;if(d?.result?.hotels?.some(r=>r.name===h.name))return d.city;return state.trip.city;}
 function migrate(old,people){
  const seed={version:1,mode:'trip',trip:{city:'',checkin:'',checkout:'',area:''},people:structuredClone(people).map(p=>({...p,requireSmart:false,requireLaundry:false,avoidMold:false,transitHard:false,conditions:[],newnessPolicy:{newWithin:3,oldAfter:8,allowRenovation:false},weights:{price:3,transit:3,newness:3,facilities:3}})),hotels:[],preferencesConfirmed:false};
  if(!old)return seed;
  const real=old.hotels.filter(h=>!h.demo).map(h=>({...h,city:inferCity(h,old),demo:false,evidence:h.evidence.filter(e=>!e.demo)}));
  const selected=real.filter(h=>old.hotelSelection?.includes(h.id));const activeCity=selected[0]?.city||real[0]?.city||'';
  const sameCity=city(old.trip.city)===city(activeCity);
  const next={...old,...seed,people:structuredClone(old.people),hotels:real,trip:sameCity?{...old.trip,city:activeCity}:{city:activeCity,checkin:'',checkout:'',area:''},hotelSelection:selected.length?selected.map(h=>h.id):undefined,researchDossier:old.researchDossier,researchDraft:old.researchDraft};delete next.aiResult;return next;
 }
 function scope(state,{selection=true}={}){
  const mode=state.mode||'trip';let hotels=state.hotels.filter(h=>(mode==='demo'?h.demo===true:h.demo!==true));
  if(mode==='trip')hotels=hotels.filter(h=>city(h.city)===city(state.trip.city));
  if(selection&&Array.isArray(state.hotelSelection))hotels=hotels.filter(h=>state.hotelSelection.includes(h.id));
  return hotels;
 }
 function select(state,dossier,hotels){
  const next=structuredClone(state);if(city(next.trip.city)!==city(dossier.city))next.trip={city:dossier.city,checkin:'',checkout:'',area:''};
  next.mode='trip';for(const h of hotels){const index=next.hotels.findIndex(x=>x.id===h.id);if(index===-1)next.hotels.push(h);else next.hotels[index]=structuredClone(h);}
  next.hotelSelection=hotels.map(h=>h.id);delete next.aiResult;return next;
 }
 const api={city,migrate,scope,select};if(typeof module!=='undefined')module.exports=api;root.HotelJourney=api;
})(typeof globalThis!=='undefined'?globalThis:this);
