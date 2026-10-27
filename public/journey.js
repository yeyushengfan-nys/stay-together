// State boundaries shared by all browser views. Original v1 backups are retained.
(function(root){
 const city=s=>String(s||'').trim().replace(/市$/,'');
 function tripScope(trip={},people=[]){
  trip=trip&&typeof trip==='object'?trip:{};
  const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  const rooms=Number(trip.rooms??1),adults=Number(trip.adults??(people.length||2)),children=Number(trip.children??0);
  return city(trip.city)&&date(trip.checkin)&&date(trip.checkout)&&trip.checkout>trip.checkin&&Number.isInteger(rooms)&&rooms>=1&&rooms<=4&&Number.isInteger(adults)&&adults>=rooms&&adults<=8&&children===0?{city:city(trip.city),checkin:trip.checkin,checkout:trip.checkout,rooms,adults,children:0}:null;
 }
 function sameTrip(a,b,people=[]){const x=tripScope(a),y=tripScope(b,people);return !!x&&!!y&&Object.keys(x).every(k=>x[k]===y[k]);}
 function belongs(h,trip,people=[]){
  if(!h||city(h.city)!==city(trip.city)||!tripScope(trip,people))return false;
  return sameTrip(h.manualTripScope,trip,people)||(h.collectionAttempts||[]).some(a=>sameTrip(a.scope,trip,people))||(sameTrip(h.quoteBundle?.query,trip,people)&&!!root.StayQuoteEvidence?.clean(h.quoteBundle,{...tripScope(trip,people),city:h.quoteBundle.query.city},h.name)?.offers.length);
 }
 function join(h,trip,people=[]){
  const copy=structuredClone(h),scope=tripScope(trip,people),packageKeys=['price','referencePrice','nightly','total','taxConfirmed','breakfast','freeCancel','payment','cancellation'];
  return {...copy,manualTripScope:scope,previousQuoteBundle:copy.quoteBundle||copy.previousQuoteBundle||null,quoteBundle:null,previousManualPrice:copy.price!=null?{amount:copy.price,quoteDate:copy.quoteDate||'',source:copy.source||'',terms:copy.terms||''}:copy.previousManualPrice,price:null,referencePrice:null,priceBasis:null,quoteDate:'',terms:'旧报价已归档；请核对本次日期的房型、早餐和取消条件',facts:{...copy.facts,breakfast:null,freeCancel:null,twinBeds:null},evidence:(copy.evidence||[]).map(e=>packageKeys.some(k=>Object.hasOwn(e.claims||{},k))||/^【[^】]*(?:公开报价摘要|报价快照|房型报价|房型页|订单预览)/.test(e.text||'')?{...e,confirmed:false}:e)};
 }
 function inferCity(h,state){if(h.city)return h.city;const d=state.researchDossier;if(d?.result?.hotels?.some(r=>r.name===h.name))return d.city;return state.trip.city;}
 function migrate(old,people){
  const seed={version:1,mode:'trip',trip:{city:'',checkin:'',checkout:'',area:''},people:structuredClone(people).map(p=>({...p,requireSmart:false,requireLaundry:false,avoidMold:false,transitHard:false,conditions:[],newnessPolicy:{newWithin:3,oldAfter:8,allowRenovation:false},weights:{price:3,transit:3,newness:3,facilities:3}})),hotels:[],preferencesConfirmed:false};
  if(!old)return seed;
  const real=old.hotels.filter(h=>!h.demo).map(h=>({...h,city:inferCity(h,old),demo:false,evidence:h.evidence.filter(e=>!e.demo)}));
  const selected=real.filter(h=>old.hotelSelection?.includes(h.id));const activeCity=selected[0]?.city||real[0]?.city||'';
  const sameCity=city(old.trip.city)===city(activeCity);
  const next={...old,...seed,people:structuredClone(old.people),hotels:real,trip:sameCity?{...old.trip,city:activeCity}:{city:activeCity,checkin:'',checkout:'',area:''},hotelSelection:selected.length?selected.map(h=>h.id):undefined,researchDossier:old.researchDossier,researchDraft:old.researchDraft};delete next.aiResult;return next;
 }
 function scope(state,{selection=true,includeHistory=false}={}){
  const mode=state.mode||'trip';let hotels=state.hotels.filter(h=>(mode==='demo'?h.demo===true:h.demo!==true));
  if(mode==='trip')hotels=hotels.filter(h=>city(h.city)===city(state.trip.city));
  if(mode==='trip'&&!includeHistory)hotels=hotels.filter(h=>belongs(h,state.trip,state.people));
  if(selection&&Array.isArray(state.hotelSelection))hotels=hotels.filter(h=>state.hotelSelection.includes(h.id));
  return hotels;
 }
 function select(state,dossier,hotels){
  const next=structuredClone(state);if(city(next.trip.city)!==city(dossier.city))next.trip={city:dossier.city,checkin:'',checkout:'',area:''};
  if(dossier.query)next.trip={...next.trip,...dossier.query};
  next.mode='trip';for(const h of hotels){const added=join(h,next.trip,next.people),index=next.hotels.findIndex(x=>x.id===h.id);if(index===-1)next.hotels.push(added);else next.hotels[index]=added;}
  next.hotelSelection=hotels.map(h=>h.id);delete next.aiResult;return next;
 }
 const api={city,migrate,tripScope,sameTrip,belongs,join,scope,select};if(typeof module!=='undefined')module.exports=api;root.HotelJourney=api;
})(typeof globalThis!=='undefined'?globalThis:this);
