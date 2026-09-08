"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth, db } from "../../lib/firebase";

const ADMIN_EMAIL = "rodrigo.bermudez@kellyeducation.com";
type Role = "admin" | "management" | "in" | "recruiter" | "talent";
type Member = { email:string; role?:Role };
type RegisteredUser = { uid:string; email:string; displayName?:string; disabled:boolean; emailVerified:boolean; creationTime?:string; lastSignInTime?:string };
const FIXED:Record<string,Role> = {[ADMIN_EMAIL]:"admin","angie.miller@kellyeducation.com":"management","anthony.morales@kellyeducation.com":"management"};
const EDITABLE_ROLES:Role[] = ["management","in","recruiter","talent"];

export default function AdminPage(){
  const [user,setUser]=useState<User|null>(null); const [email,setEmail]=useState(ADMIN_EMAIL); const [password,setPassword]=useState("");
  const [members,setMembers]=useState<Member[]>([]); const [registered,setRegistered]=useState<RegisteredUser[]>([]); const [loading,setLoading]=useState(false); const [message,setMessage]=useState("");
  useEffect(()=>onAuthStateChanged(auth,setUser),[]); const isAdmin=user?.email?.toLowerCase()===ADMIN_EMAIL;
  useEffect(()=>{if(!isAdmin){setMembers([]);return}return onSnapshot(collection(db,"teamMembers"),snap=>{const rows:Member[]=[];snap.forEach(d=>{const x=d.data();rows.push({email:(x.email||d.id).toLowerCase(),role:x.role as Role})});setMembers(rows)})},[isAdmin]);
  const roleMap=useMemo(()=>{const m=new Map<string,Role>();Object.entries(FIXED).forEach(([e,r])=>m.set(e,r));members.forEach(x=>x.role&&m.set(x.email,x.role));return m},[members]);
  const loadUsers=async()=>{if(!isAdmin)return;setLoading(true);setMessage("");try{const fn=httpsCallable(getFunctions(undefined,"us-central1"),"listRegisteredUsers");const result:any=await fn();setRegistered(result.data.users||[])}catch(e:any){setMessage(e?.message||"Could not load registered users.")}finally{setLoading(false)}};
  useEffect(()=>{if(isAdmin)loadUsers()},[isAdmin]);
  const login=async()=>{setMessage("");try{await signInWithEmailAndPassword(auth,email.trim().toLowerCase(),password);setPassword("")}catch{setMessage("The email or password is incorrect.")}};
  const saveRole=async(memberEmail:string,role:Role)=>{if(!isAdmin||memberEmail===ADMIN_EMAIL)return;await setDoc(doc(db,"teamMembers",memberEmail),{email:memberEmail,role,updatedBy:user?.email,updatedAt:serverTimestamp()},{merge:true});setMessage(`Role updated for ${memberEmail}.`)};
  if(!user)return <main className="admin-page"><section className="admin-card"><p className="eyebrow">MIAMI SCHOOLS</p><h1>Admin Panel</h1><p>Sign in with the administrator account.</p><label>Admin email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}/></label><button className="primary" onClick={login}>Sign in</button>{message&&<p className="admin-message">{message}</p>}</section></main>;
  if(!isAdmin)return <main className="admin-page"><section className="admin-card"><h1>Admin access required</h1><button className="secondary" onClick={()=>signOut(auth)}>Sign out</button></section></main>;
  return <main className="admin-page"><section className="admin-shell"><header className="admin-header"><div><p className="eyebrow">MIAMI SCHOOLS</p><h1>Registered Users & Roles</h1><p>Firebase Authentication users appear here even when they do not have a role yet.</p></div><div className="admin-header-actions"><a href="/">← Back to map</a><button className="secondary" onClick={loadUsers}>{loading?"Loading...":"Refresh users"}</button><button className="secondary" onClick={()=>signOut(auth)}>Sign out</button></div></header>{message&&<p className="admin-message">{message}</p>}<section className="team-list"><div className="team-list-head"><strong>Registered users</strong><span>{registered.length} accounts</span></div>{registered.map(u=>{const current=roleMap.get(u.email);return <article className="team-row" key={u.uid}><div className="team-person"><span className="team-avatar">{(u.displayName||u.email).slice(0,2).toUpperCase()}</span><div><strong>{u.displayName||u.email}</strong>{u.displayName&&<small>{u.email}</small>}<small>{u.disabled?"Disabled":"Active"}{u.emailVerified?" · Verified":""}</small></div></div><div className="team-controls">{u.email===ADMIN_EMAIL?<span className="role-badge">Admin</span>:<select value={current||""} onChange={e=>e.target.value&&saveRole(u.email,e.target.value as Role)}><option value="">No role</option>{EDITABLE_ROLES.map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}</select>}</div></article>})}{!loading&&!registered.length&&<div className="empty-users">No registered users loaded.</div>}</section></section></main>;
}
