"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import Papa from "papaparse";
import { auth, db } from "../lib/firebase";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

type Kind = "elementary" | "middle" | "high" | "k8" | "other";
type School = { key:string; id:string; name:string; address:string; city:string; state:string; zipcode:string; phone:string; type:string; grades:string; latitude:number; longitude:number; kind:Kind; search:string };
type Visit = { visited:boolean; lastVisitedAt?:string; notes?:string; incident?:boolean; incidentNotes?:string };
type Incident = { active:boolean; notes?:string; updatedBy?:string };
type Role = "admin" | "management" | "in" | "recruiter" | "talent";
type ActivityFilter = "all" | "yesterday" | "7days" | "month" | "notes" | "incidents";

const classify = (r:Record<string,string>):Kind => {
  const text = `${r.type||""} ${r.grades||""} ${r.name||""}`.toLowerCase();
  if (/k[-– ]?8|pk[-– ]?8/.test(text)) return "k8";
  if (/elementary|elem|primary|^e$/.test(text)) return "elementary";
  if (/middle|junior|^m$/.test(text)) return "middle";
  if (/senior high|high school|\bhigh\b|^s$|^sr$/.test(text)) return "high";
  return "other";
};
const ago = (date?:string) => date ? Math.max(0, Math.floor((Date.now()-new Date(`${date}T12:00:00`).getTime())/86400000)) : null;
const ADMIN_EMAIL = "rodrigo.bermudez@kellyeducation.com";
const USER_ROLES:Record<string,Role> = { [ADMIN_EMAIL]:"admin", "angie.miller@kellyeducation.com":"management", "anthony.morales@kellyeducation.com":"management" };

export default function Home(){
  const mapNode = useRef<HTMLDivElement>(null); const mapState = useRef<any>(null);
  const [schools,setSchools]=useState<School[]>([]); const [visits,setVisits]=useState<Record<string,Visit>>({});
  const [incidents,setIncidents]=useState<Record<string,Incident>>({});
  const [user,setUser]=useState<User|null>(null); const [query,setQuery]=useState(""); const [kind,setKind]=useState<Kind|"all">("all");
  const [visitFilter,setVisitFilter]=useState<"all"|"pending"|"visited">("all"); const [selected,setSelected]=useState<School|null>(null); const [activityFilter,setActivityFilter]=useState<ActivityFilter>("all");
  const [draft,setDraft]=useState<Visit>({visited:false,lastVisitedAt:"",notes:"",incident:false,incidentNotes:""}); const [saving,setSaving]=useState(false); const [menu,setMenu]=useState(false); const [sidebarHidden,setSidebarHidden]=useState(false);
  const [authError,setAuthError]=useState("");
  const [email,setEmail]=useState(ADMIN_EMAIL); const [password,setPassword]=useState("");
  const [assignedRole,setAssignedRole]=useState<Role|null>(null); const [rolesOpen,setRolesOpen]=useState(false); const [memberEmail,setMemberEmail]=useState(""); const [memberRole,setMemberRole]=useState<Role>("recruiter"); const [roleSaved,setRoleSaved]=useState(false);
  const role:Role|null=user?.email?USER_ROLES[user.email.toLowerCase()]||assignedRole:null;
  const canSeeIncidents=role==="admin"||role==="management"||role==="in";

  const login = async () => {
    setAuthError("");
    const normalized=email.trim().toLowerCase();
    if(!password){setAuthError("Enter your MiamiSchools password.");return}
    try { await signInWithEmailAndPassword(auth,normalized,password); setPassword(""); }
    catch (error:any) {
      const messages:Record<string,string>={
        "auth/operation-not-allowed":"Email and password sign-in is not enabled in Firebase Authentication yet.",
        "auth/invalid-email":"Enter a valid email address.",
        "auth/invalid-credential":"The email or password is incorrect.",
        "auth/user-disabled":"This account has been disabled.",
        "auth/too-many-requests":"Too many attempts. Wait a moment and try again."
      };
      setAuthError(messages[error?.code]||"We could not sign you in. Please try again.");
    }
  };

  useEffect(()=>onAuthStateChanged(auth,setUser),[]);
  useEffect(()=>{setAssignedRole(null);if(!user?.email||USER_ROLES[user.email.toLowerCase()])return;return onSnapshot(doc(db,"teamMembers",user.email.toLowerCase()),s=>setAssignedRole(s.exists()?(s.data().role as Role):null))},[user]);
  useEffect(()=>{ fetch("/schools.csv").then(r=>r.text()).then(csv=>{ const parsed=Papa.parse<Record<string,string>>(csv,{header:true,skipEmptyLines:true,transformHeader:h=>h.trim().replace(/^\uFEFF/,"")}); const data=parsed.data.map((r,i)=>{const latitude=Number(r.latitude),longitude=Number(r.longitude); if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return null; const k=classify(r); const key=`${r.id||i}-${latitude.toFixed(5)}-${longitude.toFixed(5)}`.replace(/[^a-zA-Z0-9_-]/g,"_"); return {...r,key,latitude,longitude,kind:k,search:[r.name,r.address,r.city,r.zipcode,r.grades,r.type].join(" ").toLowerCase()} as School}).filter(Boolean) as School[]; setSchools(data)}) },[]);
  useEffect(()=>{if(!user||!role){setVisits({});return} return onSnapshot(collection(db,"sharedVisits"),s=>{const n:Record<string,Visit>={};s.forEach(d=>n[d.id]=d.data() as Visit);setVisits(n)},()=>setAuthError("Your account does not have permission to view visits."))},[user,role]);
  useEffect(()=>{if(!user||!canSeeIncidents){setIncidents({});return}return onSnapshot(collection(db,"incidents"),s=>{const n:Record<string,Incident>={};s.forEach(d=>n[d.id]=d.data() as Incident);setIncidents(n)},()=>setAuthError("Your role does not have permission to view incidents."))},[user,canSeeIncidents]);
  useEffect(()=>{if(user?.email?.toLowerCase()!==ADMIN_EMAIL)return;(async()=>{const legacy=await getDocs(collection(db,"users",user.uid,"schoolVisits"));for(const old of legacy.docs)await setDoc(doc(db,"sharedVisits",old.id),old.data(),{merge:true})})().catch(()=>{})},[user]);
  useEffect(()=>{if(role!=="admin")return;(async()=>{for(const [id,visit] of Object.entries(visits)){if(visit.incident){await setDoc(doc(db,"incidents",id),{active:true,notes:visit.incidentNotes||"",updatedBy:user?.email,updatedAt:serverTimestamp()},{merge:true});await updateDoc(doc(db,"sharedVisits",id),{incident:deleteField(),incidentNotes:deleteField()})}}})().catch(()=>{})},[role,visits,user]);

  const visible=useMemo(()=>schools.filter(s=>{const visit=visits[s.key];const days=ago(visit?.lastVisitedAt);const activityMatch=activityFilter==="all"||(activityFilter==="yesterday"&&days===1)||(activityFilter==="7days"&&days!==null&&days<=7)||(activityFilter==="month"&&days!==null&&days<=30)||(activityFilter==="notes"&&Boolean(visit?.notes?.trim()))||(activityFilter==="incidents"&&canSeeIncidents&&Boolean(incidents[s.key]?.active));return(kind==="all"||s.kind===kind)&&(!query||s.search.includes(query.toLowerCase()))&&(visitFilter==="all"||(visitFilter==="visited"?visit?.visited:!visit?.visited))&&activityMatch}),[schools,kind,query,visitFilter,activityFilter,visits,incidents,canSeeIncidents]);
  const open=(s:School)=>{setSelected(s);setDraft({...visits[s.key]||{visited:false,lastVisitedAt:"",notes:""},incident:Boolean(incidents[s.key]?.active),incidentNotes:incidents[s.key]?.notes||""})};

  useEffect(()=>{if(!mapNode.current||!schools.length)return; let cancelled=false; (async()=>{
    const L=(await import("leaflet")).default; await import("leaflet.markercluster"); if(cancelled)return;
    if(!mapState.current){const map=L.map(mapNode.current!,{zoomControl:false}).setView([25.7617,-80.35],10);L.control.zoom({position:"topright"}).addTo(map);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(map);mapState.current={map,cluster:(L as any).markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:48}),L};map.addLayer(mapState.current.cluster)}
    const {map,cluster}=mapState.current;cluster.clearLayers();
    const labels={elementary:"E",middle:"M",high:"H",k8:"K",other:"S"};
    visible.forEach(s=>{const visit=visits[s.key];const done=visit?.visited;const incident=canSeeIncidents&&incidents[s.key]?.active;const icon=L.divIcon({className:"",html:`<div class="school-marker ${s.kind} ${done?"visited":""} ${incident?"incident":""}">${incident?"!":done?"✓":labels[s.kind]}</div>`,iconSize:[34,34],iconAnchor:[17,17],popupAnchor:[0,-15]}); const marker=L.marker([s.latitude,s.longitude],{icon,title:s.name});const days=ago(visit?.lastVisitedAt);const address=`${s.address}, ${s.city}, ${s.state} ${s.zipcode}`;const popup=document.createElement("div");popup.className="popup";popup.innerHTML=`<span class="popup-type">${s.grades?`GRADES ${s.grades}`:s.type}</span><h3>${s.name}</h3><p>📍 ${address}</p>${s.phone?`<p>☎ <a href="tel:${s.phone}">${s.phone}</a></p>`:""}${done?`<p class="visit-line">✓ Visited ${days===0?"today":`${days} days ago`}</p>`:""}${incident?`<p class="incident-line">! Incident reported</p>`:""}<div class="popup-actions"><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}">Directions ↗</a><button>${visit?"Update":"Log visit"}</button></div>`;popup.querySelector("button")?.addEventListener("click",()=>user?open(s):login());marker.bindPopup(popup);cluster.addLayer(marker)});
  })();return()=>{cancelled=true}},[schools,visible,visits,incidents,canSeeIncidents,user]);
  useEffect(()=>{const timer=window.setTimeout(()=>mapState.current?.map?.invalidateSize(),250);return()=>window.clearTimeout(timer)},[sidebarHidden,menu]);

  const locate=()=>navigator.geolocation?.getCurrentPosition(({coords})=>{const {map,L}=mapState.current||{};if(!map)return;L.circleMarker([coords.latitude,coords.longitude],{radius:9,weight:4,color:"#fff",fillColor:"#14261f",fillOpacity:1}).addTo(map).bindPopup("Your location").openPopup();map.setView([coords.latitude,coords.longitude],13)},()=>alert("We could not get your location. Check your browser permission."),{enableHighAccuracy:true,timeout:10000});
  const save=async()=>{if(!user||!role||!selected)return;setSaving(true);await setDoc(doc(db,"sharedVisits",selected.key),{visited:draft.visited,lastVisitedAt:draft.lastVisitedAt||"",notes:draft.notes||"",schoolName:selected.name,schoolId:selected.id,updatedBy:user.email,updatedAt:serverTimestamp()},{merge:true});if(canSeeIncidents)await setDoc(doc(db,"incidents",selected.key),{active:Boolean(draft.incident),notes:draft.incidentNotes||"",schoolName:selected.name,updatedBy:user.email,updatedAt:serverTimestamp()},{merge:true});setSaving(false);setSelected(null)};
  const removeVisit=async()=>{if(!user||user.email?.toLowerCase()!==ADMIN_EMAIL||!selected||!visits[selected.key])return;if(!window.confirm(`Delete the visit record for ${selected.name}? This will remove its date and notes.`))return;setSaving(true);await deleteDoc(doc(db,"sharedVisits",selected.key));setSaving(false);setSelected(null)};
  const assignRole=async()=>{const normalized=memberEmail.trim().toLowerCase();if(role!=="admin"||!normalized)return;await setDoc(doc(db,"teamMembers",normalized),{email:normalized,role:memberRole,updatedBy:user?.email,updatedAt:serverTimestamp()},{merge:true});setMemberEmail("");setRoleSaved(true);window.setTimeout(()=>setRoleSaved(false),2500)};
  const visited=schools.filter(s=>visits[s.key]?.visited).length;

  return <main className={`map-app ${sidebarHidden?"sidebar-hidden":""}`}>
    <aside className={`map-sidebar ${menu?"open":""}`}>
      <header className="brand-row"><span className="brandmark">MS</span><div><p className="eyebrow">MIAMI-DADE COUNTY</p><h1>Miami Schools</h1></div><button className="hide-sidebar" onClick={()=>{setSidebarHidden(true);setMenu(false)}} aria-label="Hide filters" title="Hide filters">‹</button></header>
      <p className="intro">Find public schools, plan your route, and keep track of every visit.</p>
      <div className="auth-row">{user?<><div className="signed"><b>{user.email}</b><small>{role?role.charAt(0).toUpperCase()+role.slice(1):"No role"}</small></div><button className="text-btn" onClick={()=>signOut(auth)}>Sign out</button></>:<div className="email-login"><label htmlFor="loginEmail">Approved work email</label><input id="loginEmail" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/><label htmlFor="loginPassword">MiamiSchools password</label><input id="loginPassword" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" onKeyDown={e=>{if(e.key==="Enter")login()}}/><button className="primary full" onClick={login}>Sign in</button></div>}</div>
      {authError&&<p className="auth-error" role="alert">{authError}</p>}
      {user&&!role&&<p className="auth-error" role="alert">Your account is signed in, but an administrator has not assigned a role yet.</p>}
      {role==="admin"&&<><button className="role-toggle" onClick={()=>setRolesOpen(!rolesOpen)}>⚙ {rolesOpen?"Close role manager":"Manage team roles"}</button>{rolesOpen&&<div className="role-manager"><label>Team member email<input type="email" value={memberEmail} onChange={e=>setMemberEmail(e.target.value)} placeholder="name@kellyeducation.com"/></label><label>Role<select value={memberRole} onChange={e=>setMemberRole(e.target.value as Role)}><option value="management">Management</option><option value="in">IN</option><option value="recruiter">Recruiter</option><option value="talent">Talent</option></select></label><button className="primary full" onClick={assignRole}>Assign role</button>{roleSaved&&<small>Role saved successfully.</small>}</div>}</>}
      <label className="field-label">Search schools</label><div className="map-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, address, or ZIP…"/><button onClick={()=>setQuery("")}>×</button></div>
      <div className="filter-title"><span>School type</span><button className="text-btn" onClick={()=>{setKind("all");setVisitFilter("all");setActivityFilter("all");setQuery("")}}>Reset</button></div>
      <div className="filter-grid">{([['all','All'],['elementary','Elementary'],['middle','Middle'],['high','High'],['k8','K–8'],['other','Other']] as const).map(([k,n])=><button key={k} className={kind===k?"active":""} onClick={()=>setKind(k)}>{n}</button>)}</div>
      <div className="filter-title"><span>Visit status</span></div><div className="visit-tabs"><button className={visitFilter==="all"?"active":""} onClick={()=>setVisitFilter("all")}>All</button><button className={visitFilter==="pending"?"active":""} onClick={()=>setVisitFilter("pending")}>Pending</button><button className={visitFilter==="visited"?"active":""} onClick={()=>setVisitFilter("visited")}>Visited</button></div>
      <div className="filter-title"><span>Activity</span></div><div className="activity-grid">{([['all','Any time'],['yesterday','Yesterday'],['7days','Last 7 days'],['month','Last 30 days'],['notes','Has notes'],...(canSeeIncidents?[["incidents","Incidents"]] as const:[])] as readonly (readonly [ActivityFilter,string])[]).map(([value,label])=><button key={value} className={activityFilter===value?"active":""} onClick={()=>setActivityFilter(value)}>{label}</button>)}</div>
      <div className="stats"><div><strong>{visible.length}</strong><span>visible</span></div><div><strong>{schools.length}</strong><span>loaded</span></div><div><strong>{visited}</strong><span>visited</span></div></div>
      <button className="primary full" onClick={locate}>◎ Schools near me</button><p className="status">{visible.length?`${visible.length} schools match your search.`:"No schools match those filters."}</p>
      <footer>Directory imported from MiamiSchoolsMap.<br/>Map © OpenStreetMap contributors.<span className="credit">Created by Cafe Cultura LLC for Kelly Education Miami-Dade, with lots of love. ♥</span></footer>
    </aside>
    <section className="map-panel"><div ref={mapNode} id="map"/><button className="show-sidebar" onClick={()=>{setSidebarHidden(false);setMenu(true)}} aria-label="Show filters">☰ Filters</button><div className="map-legend"><span><i className="elementary"/>Elementary</span><span><i className="middle"/>Middle</span><span><i className="high"/>High</span><span><i className="k8"/>K–8</span><span><i className="visited"/>Visited</span>{canSeeIncidents&&<span><i className="incident"/>Incident</span>}</div></section>
    {selected&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><form className="modal" onSubmit={e=>{e.preventDefault();save()}}><button type="button" className="close" onClick={()=>setSelected(null)}>×</button><p className="eyebrow">FIELD VISIT</p><h2>{selected.name}</h2><p className="modalAddress">{selected.address}, {selected.city}</p><label className="check"><input type="checkbox" checked={draft.visited} onChange={e=>setDraft({...draft,visited:e.target.checked})}/><span>This school has been visited</span></label><label>Visit date<input type="date" max={new Date().toISOString().slice(0,10)} value={draft.lastVisitedAt||""} onChange={e=>setDraft({...draft,lastVisitedAt:e.target.value,visited:Boolean(e.target.value)})}/></label><label>Notes and next steps<textarea rows={4} value={draft.notes||""} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="E.g. Send proposal, call the principal..."/></label>{canSeeIncidents&&<section className={`incident-box ${draft.incident?"active":""}`}><label className="check incident-check"><input type="checkbox" checked={Boolean(draft.incident)} onChange={e=>setDraft({...draft,incident:e.target.checked})}/><span>Report an incident at this school</span></label>{draft.incident&&<label>Incident notes<textarea rows={3} required value={draft.incidentNotes||""} onChange={e=>setDraft({...draft,incidentNotes:e.target.value})} placeholder="Describe what happened and any follow-up needed..."/></label>}</section>}<div className="modalActions">{visits[selected.key]&&role==="admin"&&<button type="button" className="danger" onClick={removeVisit} disabled={saving}>Delete visit</button>}<span className="action-spacer"/><button type="button" className="secondary" onClick={()=>setSelected(null)}>Close</button><button className="primary" disabled={saving}>{saving?"Saving...":"Save visit"}</button></div></form></div>}
  </main>
}
