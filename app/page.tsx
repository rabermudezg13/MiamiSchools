"use client";

import { useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type School = { id: string; name: string; type: "Elementary" | "K-8" | "Middle" | "High"; city: string; address: string; region: "North" | "Central" | "South" };
type Visit = { visited: boolean; lastVisitedAt?: string; notes?: string };

const schools: School[] = [
  { id:"coral-gables-senior", name:"Coral Gables Senior High School", type:"High", city:"Coral Gables", address:"450 Bird Rd, Coral Gables, FL 33146", region:"Central" },
  { id:"coral-reef-senior", name:"Coral Reef Senior High School", type:"High", city:"Miami", address:"10101 SW 152nd St, Miami, FL 33157", region:"South" },
  { id:"miami-beach-senior", name:"Miami Beach Senior High School", type:"High", city:"Miami Beach", address:"2231 Prairie Ave, Miami Beach, FL 33139", region:"Central" },
  { id:"miami-senior", name:"Miami Senior High School", type:"High", city:"Miami", address:"2450 SW 1st St, Miami, FL 33135", region:"Central" },
  { id:"north-miami-senior", name:"North Miami Senior High School", type:"High", city:"North Miami", address:"13110 NE 8th Ave, North Miami, FL 33161", region:"North" },
  { id:"john-ferguson", name:"John A. Ferguson Senior High School", type:"High", city:"Miami", address:"15900 SW 56th St, Miami, FL 33185", region:"South" },
  { id:"southwest-miami", name:"Southwest Miami Senior High School", type:"High", city:"Miami", address:"8855 SW 50th Terrace, Miami, FL 33165", region:"South" },
  { id:"mast-academy", name:"MAST Academy", type:"High", city:"Key Biscayne", address:"3979 Rickenbacker Cswy, Miami, FL 33149", region:"Central" },
  { id:"george-carver-middle", name:"George W. Carver Middle School", type:"Middle", city:"Miami", address:"4901 Lincoln Dr, Miami, FL 33133", region:"Central" },
  { id:"north-dade-middle", name:"North Dade Middle School", type:"Middle", city:"Miami Gardens", address:"1840 NW 157th St, Miami Gardens, FL 33054", region:"North" },
  { id:"south-miami-middle", name:"South Miami Middle School", type:"Middle", city:"South Miami", address:"6750 SW 60th St, South Miami, FL 33143", region:"South" },
  { id:"ada-merritt", name:"Ada Merritt K-8 Center", type:"K-8", city:"Miami", address:"660 SW 3rd St, Miami, FL 33130", region:"Central" },
  { id:"coral-way-k8", name:"Coral Way K-8 Center", type:"K-8", city:"Miami", address:"1950 SW 13th Ave, Miami, FL 33145", region:"Central" },
  { id:"citrus-grove-k8", name:"Citrus Grove K-8 Center", type:"K-8", city:"Miami", address:"2121 NW 5th St, Miami, FL 33125", region:"Central" },
  { id:"frances-tucker", name:"Frances S. Tucker K-8 Center", type:"K-8", city:"Miami", address:"3500 Douglas Rd, Miami, FL 33133", region:"Central" },
  { id:"shenandoah-elementary", name:"Shenandoah Elementary School", type:"Elementary", city:"Miami", address:"1023 SW 21st Ave, Miami, FL 33135", region:"Central" },
  { id:"sunset-elementary", name:"Sunset Elementary School", type:"Elementary", city:"Miami", address:"5120 SW 72nd St, Miami, FL 33143", region:"South" },
  { id:"north-hialeah-elementary", name:"North Hialeah Elementary School", type:"Elementary", city:"Hialeah", address:"4251 E 5th Ave, Hialeah, FL 33013", region:"North" },
];

const daysAgo = (date?: string) => date ? Math.max(0, Math.floor((Date.now() - new Date(date + "T12:00:00").getTime()) / 86400000)) : null;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [visits, setVisits] = useState<Record<string, Visit>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [selected, setSelected] = useState<School | null>(null);
  const [draft, setDraft] = useState<Visit>({ visited: false, lastVisitedAt: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!user) { setVisits({}); return; }
    return onSnapshot(collection(db, "users", user.uid, "schoolVisits"), snap => {
      const next: Record<string, Visit> = {}; snap.forEach(d => next[d.id] = d.data() as Visit); setVisits(next);
    });
  }, [user]);

  const filtered = useMemo(() => schools.filter(s => {
    const q = search.toLowerCase();
    const matches = s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q) || s.address.toLowerCase().includes(q);
    const status = filter === "Todos" || (filter === "Visitados" && visits[s.id]?.visited) || (filter === "Pendientes" && !visits[s.id]?.visited) || filter === s.type;
    return matches && status;
  }), [search, filter, visits]);

  const visitedCount = schools.filter(s => visits[s.id]?.visited).length;
  const openSchool = (school: School) => { setSelected(school); setDraft(visits[school.id] || { visited:false, lastVisitedAt:"", notes:"" }); };
  const save = async () => {
    if (!selected || !user) return;
    setSaving(true);
    await setDoc(doc(db, "users", user.uid, "schoolVisits", selected.id), { ...draft, schoolName:selected.name, updatedAt:serverTimestamp() }, { merge:true });
    setSaving(false); setSelected(null);
  };

  return <main>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Miami Schools inicio"><span className="brandmark">MS</span><span>MIAMI <b>SCHOOLS</b></span></a>
      <div className="account">
        {user ? <><span className="userName">{user.displayName || user.email}</span><button className="button ghost" onClick={() => signOut(auth)}>Salir</button></> : <button className="button dark" onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}>Continuar con Google</button>}
      </div>
    </header>

    <section className="hero" id="top">
      <div><p className="eyebrow">DIRECTORIO · MIAMI-DADE COUNTY</p><h1>Cada colegio.<br/><em>Cada visita.</em> Bajo control.</h1><p className="lede">Organiza tu recorrido por los colegios públicos de Miami, guarda notas y vuelve a contactar en el momento preciso.</p></div>
      <div className="scorecard"><span>PROGRESO DE VISITAS</span><strong>{visitedCount}<small> / {schools.length}</small></strong><div className="progress"><i style={{width:`${visitedCount / schools.length * 100}%`}}/></div><p>{schools.length - visitedCount} colegios pendientes</p></div>
    </section>

    {!user && <section className="notice"><div><b>Tu seguimiento, privado y sincronizado.</b><span>Inicia sesión para marcar visitas, guardar fechas y escribir notas.</span></div><button className="button coral" onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}>Activar seguimiento</button></section>}

    <section className="toolbar">
      <label className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar colegio, ciudad o dirección..."/></label>
      <div className="filters">{["Todos","Pendientes","Visitados","Elementary","K-8","Middle","High"].map(f=><button key={f} className={filter===f?"active":""} onClick={()=>setFilter(f)}>{f}</button>)}</div>
    </section>

    <section className="directory">
      <div className="sectionhead"><div><p className="eyebrow">COLEGIOS</p><h2>Directorio de campo</h2></div><span>{filtered.length} resultados</span></div>
      <div className="schoolgrid">{filtered.map((school, i) => {
        const visit = visits[school.id]; const ago = daysAgo(visit?.lastVisitedAt);
        return <article className="schoolcard" key={school.id}>
          <div className="cardtop"><span className="index">{String(i+1).padStart(2,"0")}</span><span className={`status ${visit?.visited?"done":""}`}>{visit?.visited?"Visitado":"Pendiente"}</span></div>
          <div><p className="type">{school.type} · {school.region}</p><h3>{school.name}</h3><p className="address">{school.address}</p></div>
          {visit?.notes && <p className="note">“{visit.notes}”</p>}
          <div className="cardfoot"><div>{visit?.visited?<><b>{ago === 0 ? "Hoy" : `Hace ${ago} días`}</b><small>{visit.lastVisitedAt}</small></>:<><b>Sin visitar</b><small>Agrega tu primera visita</small></>}</div><button onClick={()=>user ? openSchool(school) : signInWithPopup(auth,new GoogleAuthProvider())}>{visit?.visited?"Actualizar":"Registrar"} →</button></div>
        </article>
      })}</div>
    </section>

    {selected && <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="visit-title" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><form className="modal" onSubmit={e=>{e.preventDefault();save()}}>
      <button type="button" className="close" onClick={()=>setSelected(null)} aria-label="Cerrar">×</button><p className="eyebrow">REGISTRO DE CAMPO</p><h2 id="visit-title">{selected.name}</h2><p className="modalAddress">{selected.address}</p>
      <label className="check"><input type="checkbox" checked={draft.visited} onChange={e=>setDraft({...draft,visited:e.target.checked})}/><span>Este colegio ya fue visitado</span></label>
      <label>Fecha de la visita<input type="date" value={draft.lastVisitedAt || ""} max={new Date().toISOString().slice(0,10)} onChange={e=>setDraft({...draft,lastVisitedAt:e.target.value,visited:Boolean(e.target.value)})}/></label>
      <label>Notas y próximos pasos<textarea rows={5} value={draft.notes || ""} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Ej. Hablar con la directora, enviar propuesta el viernes..."/></label>
      <div className="modalActions"><button type="button" className="button ghost" onClick={()=>setSelected(null)}>Cancelar</button><button className="button coral" disabled={saving}>{saving?"Guardando...":"Guardar visita"}</button></div>
    </form></div>}
    <footer><span>MIAMI SCHOOLS · FIELD TRACKER</span><span>Datos de seguimiento privados por usuario</span></footer>
  </main>;
}
