"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

const ADMIN_EMAIL = "rodrigo.bermudez@kellyeducation.com";
type Role = "admin" | "management" | "in" | "recruiter" | "talent";
type Member = { email:string; role:Role };
const FIXED:Member[] = [
  {email:ADMIN_EMAIL, role:"admin"},
  {email:"angie.miller@kellyeducation.com", role:"management"},
  {email:"anthony.morales@kellyeducation.com", role:"management"},
];
const EDITABLE_ROLES:Role[] = ["management","in","recruiter","talent"];

export default function AdminPage(){
  const [user,setUser]=useState<User|null>(null);
  const [email,setEmail]=useState(ADMIN_EMAIL);
  const [password,setPassword]=useState("");
  const [members,setMembers]=useState<Member[]>([]);
  const [newEmail,setNewEmail]=useState("");
  const [newRole,setNewRole]=useState<Role>("recruiter");
  const [message,setMessage]=useState("");

  useEffect(()=>onAuthStateChanged(auth,setUser),[]);
  const isAdmin=user?.email?.toLowerCase()===ADMIN_EMAIL;
  useEffect(()=>{
    if(!isAdmin){setMembers([]);return;}
    return onSnapshot(collection(db,"teamMembers"),snap=>{
      const rows:Member[]=[];
      snap.forEach(d=>{const data=d.data();rows.push({email:(data.email||d.id).toLowerCase(),role:data.role as Role})});
      setMembers(rows.sort((a,b)=>a.email.localeCompare(b.email)));
    });
  },[isAdmin]);

  const allMembers=useMemo(()=>{
    const map=new Map<string,Member>();
    FIXED.forEach(m=>map.set(m.email,m));
    members.forEach(m=>map.set(m.email,m));
    return [...map.values()].sort((a,b)=>a.email.localeCompare(b.email));
  },[members]);

  const login=async()=>{setMessage("");try{await signInWithEmailAndPassword(auth,email.trim().toLowerCase(),password);setPassword("")}catch{setMessage("The email or password is incorrect.")}};
  const saveRole=async(memberEmail:string,role:Role)=>{
    if(!isAdmin||memberEmail===ADMIN_EMAIL)return;
    await setDoc(doc(db,"teamMembers",memberEmail),{email:memberEmail,role,updatedBy:user?.email,updatedAt:serverTimestamp()},{merge:true});
    setMessage(`Role updated for ${memberEmail}.`);
  };
  const addMember=async()=>{
    const normalized=newEmail.trim().toLowerCase(); if(!normalized||!isAdmin)return;
    await saveRole(normalized,newRole); setNewEmail("");
  };
  const removeMember=async(memberEmail:string)=>{
    if(!isAdmin||FIXED.some(m=>m.email===memberEmail))return;
    if(!window.confirm(`Remove ${memberEmail} from the team role list?`))return;
    await deleteDoc(doc(db,"teamMembers",memberEmail));
    setMessage(`${memberEmail} removed from the team role list.`);
  };

  if(!user)return <main className="admin-page"><section className="admin-card"><p className="eyebrow">MIAMI SCHOOLS</p><h1>Admin Panel</h1><p>Sign in with the administrator account.</p><label>Admin email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}/></label><button className="primary" onClick={login}>Sign in</button>{message&&<p className="admin-message">{message}</p>}</section></main>;
  if(!isAdmin)return <main className="admin-page"><section className="admin-card"><h1>Admin access required</h1><p>This page is only available to the MiamiSchools administrator.</p><button className="secondary" onClick={()=>signOut(auth)}>Sign out</button></section></main>;

  return <main className="admin-page"><section className="admin-shell"><header className="admin-header"><div><p className="eyebrow">MIAMI SCHOOLS</p><h1>Team & Roles</h1><p>View team members and assign access roles.</p></div><div className="admin-header-actions"><a href="/">← Back to map</a><button className="secondary" onClick={()=>signOut(auth)}>Sign out</button></div></header>
    <section className="add-member"><h2>Add / assign team member</h2><div className="add-member-row"><input type="email" placeholder="name@kellyeducation.com" value={newEmail} onChange={e=>setNewEmail(e.target.value)}/><select value={newRole} onChange={e=>setNewRole(e.target.value as Role)}>{EDITABLE_ROLES.map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}</select><button className="primary" onClick={addMember}>Assign role</button></div><small>Firebase Authentication accounts are created separately. This panel manages application access and roles.</small></section>
    {message&&<p className="admin-message">{message}</p>}
    <section className="team-list"><div className="team-list-head"><strong>Users</strong><span>{allMembers.length} listed</span></div>{allMembers.map(m=>{const fixed=FIXED.some(f=>f.email===m.email);return <article className="team-row" key={m.email}><div className="team-person"><span className="team-avatar">{m.email.slice(0,2).toUpperCase()}</span><div><strong>{m.email}</strong><small>{fixed?"Core account":"Team member"}</small></div></div><div className="team-controls">{m.email===ADMIN_EMAIL?<span className="role-badge">Admin</span>:<select value={m.role} onChange={e=>saveRole(m.email,e.target.value as Role)}>{EDITABLE_ROLES.map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}</select>}{!fixed&&<button className="remove-member" onClick={()=>removeMember(m.email)}>Remove</button>}</div></article>})}</section>
  </section></main>;
}
