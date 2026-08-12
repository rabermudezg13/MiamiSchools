"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { User, isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail, signInWithEmailLink, signOut } from "firebase/auth";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import Papa from "papaparse";
import { auth, db } from "../lib/firebase";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

type Kind = "elementary" | "middle" | "high" | "k8" | "other";
type School = { key:string; id:string; name:string; address:string; city:string; state:string; zipcode:string; phone:string; type:string; grades:string; latitude:number; longitude:number; kind:Kind; search:string };
type Visit = { visited:boolean; lastVisitedAt?:string; notes?:string };

const classify = (r:Record<string,string>):Kind => {
  const text = `${r.type||""} ${r.grades||""} ${r.name||""}`.toLowerCase();
  if (/k[-– ]?8|pk[-– ]?8/.test(text)) return "k8";
  if (/elementary|elem|primary|^e$/.test(text)) return "elementary";
  if (/middle|junior|^m$/.test(text)) return "middle";
  if (/senior high|high school|\bhigh\b|^s$|^sr$/.test(text)) return "high";
  return "other";
};
const ago = (date?:string) => date ? Math.max(0, Math.floor((Date.now()-new Date(`${date}T12:00:00`).getTime())/86400000)) : null;
const PILOT_EMAIL = "rodrigo.bermudez@kellyeducation.com";

export default function Home(){
  const mapNode = useRef<HTMLDivElement>(null); const mapState = useRef<any>(null);
  const [schools,setSchools]=useState<School[]>([]); const [visits,setVisits]=useState<Record<string,Visit>>({});
  const [user,setUser]=useState<User|null>(null); const [query,setQuery]=useState(""); const [kind,setKind]=useState<Kind|"all">("all");
  const [visitFilter,setVisitFilter]=useState<"all"|"pending"|"visited">("all"); const [selected,setSelected]=useState<School|null>(null);
  const [draft,setDraft]=useState<Visit>({visited:false,lastVisitedAt:"",notes:""}); const [saving,setSaving]=useState(false); const [menu,setMenu]=useState(false);
  const [authError,setAuthError]=useState("");
  const [email,setEmail]=useState(PILOT_EMAIL); const [linkSent,setLinkSent]=useState(false);

  const login = async () => {
    setAuthError("");
    const normalized=email.trim().toLowerCase();
    if(normalized!==PILOT_EMAIL){setAuthError("This email is not on the approved access list.");return}
    try {
      await sendSignInLinkToEmail(auth,normalized,{url:window.location.origin,handleCodeInApp:true});
      window.localStorage.setItem("emailForSignIn",normalized); setLinkSent(true);
    }
    catch (error:any) {
      const messages:Record<string,string>={
        "auth/operation-not-allowed":"Passwordless email sign-in is not enabled in Firebase Authentication yet.",
        "auth/unauthorized-domain":"This website domain is not authorized in Firebase Authentication.",
        "auth/invalid-email":"Enter a valid email address.",
        "auth/too-many-requests":"Too many attempts. Wait a moment and try again."
      };
      setAuthError(messages[error?.code]||"We could not send the sign-in link. Please try again.");
    }
  };

  useEffect(()=>{
    if(isSignInWithEmailLink(auth,window.location.href)){
      const saved=window.localStorage.getItem("emailForSignIn")||window.prompt("Confirm the email that received this link:")||"";
      if(saved.toLowerCase()===PILOT_EMAIL) signInWithEmailLink(auth,saved,window.location.href).then(()=>{window.localStorage.removeItem("emailForSignIn");window.history.replaceState({},document.title,window.location.origin)}).catch(()=>setAuthError("This sign-in link is invalid or has expired."));
      else setAuthError("This email is not on the approved access list.");
    }
    return onAuthStateChanged(auth,next=>{if(next?.email?.toLowerCase()!==PILOT_EMAIL){if(next)signOut(auth);setUser(null)}else setUser(next)});
  },[]);
  useEffect(()=>{ fetch("/schools.csv").then(r=>r.text()).then(csv=>{ const parsed=Papa.parse<Record<string,string>>(csv,{header:true,skipEmptyLines:true,transformHeader:h=>h.trim().replace(/^\uFEFF/,"")}); const data=parsed.data.map((r,i)=>{const latitude=Number(r.latitude),longitude=Number(r.longitude); if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return null; const k=classify(r); const key=`${r.id||i}-${latitude.toFixed(5)}-${longitude.toFixed(5)}`.replace(/[^a-zA-Z0-9_-]/g,"_"); return {...r,key,latitude,longitude,kind:k,search:[r.name,r.address,r.city,r.zipcode,r.grades,r.type].join(" ").toLowerCase()} as School}).filter(Boolean) as School[]; setSchools(data)}) },[]);
  useEffect(()=>{if(!user){setVisits({});return} return onSnapshot(collection(db,"users",user.uid,"schoolVisits"),s=>{const n:Record<string,Visit>={};s.forEach(d=>n[d.id]=d.data() as Visit);setVisits(n)})},[user]);

  const visible=useMemo(()=>schools.filter(s=>(kind==="all"||s.kind===kind)&&(!query||s.search.includes(query.toLowerCase()))&&(visitFilter==="all"||(visitFilter==="visited"?visits[s.key]?.visited:!visits[s.key]?.visited))),[schools,kind,query,visitFilter,visits]);
  const open=(s:School)=>{setSelected(s);setDraft(visits[s.key]||{visited:false,lastVisitedAt:"",notes:""})};

  useEffect(()=>{if(!mapNode.current||!schools.length)return; let cancelled=false; (async()=>{
    const L=(await import("leaflet")).default; await import("leaflet.markercluster"); if(cancelled)return;
    if(!mapState.current){const map=L.map(mapNode.current!,{zoomControl:false}).setView([25.7617,-80.35],10);L.control.zoom({position:"topright"}).addTo(map);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);mapState.current={map,cluster:(L as any).markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:48}),L};map.addLayer(mapState.current.cluster)}
    const {map,cluster}=mapState.current;cluster.clearLayers();
    const labels={elementary:"E",middle:"M",high:"H",k8:"K",other:"S"};
    visible.forEach(s=>{const done=visits[s.key]?.visited;const icon=L.divIcon({className:"",html:`<div class="school-marker ${s.kind} ${done?"visited":""}">${done?"✓":labels[s.kind]}</div>`,iconSize:[34,34],iconAnchor:[17,17],popupAnchor:[0,-15]}); const marker=L.marker([s.latitude,s.longitude],{icon,title:s.name});const days=ago(visits[s.key]?.lastVisitedAt);const address=`${s.address}, ${s.city}, ${s.state} ${s.zipcode}`;const popup=document.createElement("div");popup.className="popup";popup.innerHTML=`<span class="popup-type">${s.grades?`GRADES ${s.grades}`:s.type}</span><h3>${s.name}</h3><p>📍 ${address}</p>${s.phone?`<p>☎ <a href="tel:${s.phone}">${s.phone}</a></p>`:""}${done?`<p class="visit-line">✓ Visited ${days===0?"today":`${days} days ago`}</p>`:""}<div class="popup-actions"><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}">Directions ↗</a><button>${done?"Update":"Log visit"}</button></div>`;popup.querySelector("button")?.addEventListener("click",()=>user?open(s):login());marker.bindPopup(popup);cluster.addLayer(marker)});
  })();return()=>{cancelled=true}},[schools,visible,visits,user]);

  const locate=()=>navigator.geolocation?.getCurrentPosition(({coords})=>{const {map,L}=mapState.current||{};if(!map)return;L.circleMarker([coords.latitude,coords.longitude],{radius:9,weight:4,color:"#fff",fillColor:"#14261f",fillOpacity:1}).addTo(map).bindPopup("Your location").openPopup();map.setView([coords.latitude,coords.longitude],13)},()=>alert("We could not get your location. Check your browser permission."),{enableHighAccuracy:true,timeout:10000});
  const save=async()=>{if(!user||!selected)return;setSaving(true);await setDoc(doc(db,"users",user.uid,"schoolVisits",selected.key),{...draft,schoolName:selected.name,schoolId:selected.id,updatedAt:serverTimestamp()},{merge:true});setSaving(false);setSelected(null)};
  const visited=schools.filter(s=>visits[s.key]?.visited).length;

  return <main className="map-app">
    <aside className={`map-sidebar ${menu?"open":""}`}>
      <header className="brand-row"><span className="brandmark">MS</span><div><p className="eyebrow">MIAMI-DADE COUNTY</p><h1>Miami Schools</h1></div></header>
      <p className="intro">Find public schools, plan your route, and keep track of every visit.</p>
      <div className="auth-row">{user?<><div className="signed"><b>{user.email}</b><small>Tracking synchronized</small></div><button className="text-btn" onClick={()=>signOut(auth)}>Sign out</button></>:<div className="email-login"><label htmlFor="loginEmail">Approved work email</label><input id="loginEmail" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/><button className="primary full" onClick={login}>Email me a sign-in link</button></div>}</div>
      {linkSent&&<p className="auth-success" role="status">Check your inbox. We sent you a one-time sign-in link.</p>}
      {authError&&<p className="auth-error" role="alert">{authError}</p>}
      <label className="field-label">Search schools</label><div className="map-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, address, or ZIP…"/><button onClick={()=>setQuery("")}>×</button></div>
      <div className="filter-title"><span>School type</span><button className="text-btn" onClick={()=>{setKind("all");setVisitFilter("all");setQuery("")}}>Reset</button></div>
      <div className="filter-grid">{([['all','All'],['elementary','Elementary'],['middle','Middle'],['high','High'],['k8','K–8'],['other','Other']] as const).map(([k,n])=><button key={k} className={kind===k?"active":""} onClick={()=>setKind(k)}>{n}</button>)}</div>
      <div className="filter-title"><span>Visit status</span></div><div className="visit-tabs"><button className={visitFilter==="all"?"active":""} onClick={()=>setVisitFilter("all")}>All</button><button className={visitFilter==="pending"?"active":""} onClick={()=>setVisitFilter("pending")}>Pending</button><button className={visitFilter==="visited"?"active":""} onClick={()=>setVisitFilter("visited")}>Visited</button></div>
      <div className="stats"><div><strong>{visible.length}</strong><span>visible</span></div><div><strong>{schools.length}</strong><span>loaded</span></div><div><strong>{visited}</strong><span>visited</span></div></div>
      <button className="primary full" onClick={locate}>◎ Schools near me</button><p className="status">{visible.length?`${visible.length} schools match your search.`:"No schools match those filters."}</p>
      <footer>Directory imported from MiamiSchoolsMap.<br/>Map © OpenStreetMap contributors.</footer>
    </aside>
    <section className="map-panel"><div ref={mapNode} id="map"/><button className="mobile-menu" onClick={()=>setMenu(!menu)}>☰ Filters</button><div className="map-legend"><span><i className="elementary"/>Elementary</span><span><i className="middle"/>Middle</span><span><i className="high"/>High</span><span><i className="k8"/>K–8</span><span><i className="visited"/>Visited</span></div></section>
    {selected&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><form className="modal" onSubmit={e=>{e.preventDefault();save()}}><button type="button" className="close" onClick={()=>setSelected(null)}>×</button><p className="eyebrow">FIELD VISIT</p><h2>{selected.name}</h2><p className="modalAddress">{selected.address}, {selected.city}</p><label className="check"><input type="checkbox" checked={draft.visited} onChange={e=>setDraft({...draft,visited:e.target.checked})}/><span>This school has been visited</span></label><label>Visit date<input type="date" max={new Date().toISOString().slice(0,10)} value={draft.lastVisitedAt||""} onChange={e=>setDraft({...draft,lastVisitedAt:e.target.value,visited:Boolean(e.target.value)})}/></label><label>Notes and next steps<textarea rows={5} value={draft.notes||""} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="E.g. Send proposal, call the principal..."/></label><div className="modalActions"><button type="button" className="secondary" onClick={()=>setSelected(null)}>Cancel</button><button className="primary" disabled={saving}>{saving?"Saving...":"Save visit"}</button></div></form></div>}
  </main>
}
