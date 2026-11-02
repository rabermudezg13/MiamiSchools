// Exports use only saved, role-authorized shared visit data. Incident records are excluded.
export type ReportRow = {
  school: { name:string; id:string; address:string; city:string };
  visit: { lastVisitedAt?:string; visitedByName?:string; visitedByEmail?:string; visitedBy?:string; notes?:string; sublocatorName?:string; sublocatorPhone?:string; sublocatorEmail?:string; sublocatorRating?:number; survey?: { attendance:string; dressCode:string; callback:string; source:string; recordedBy?:string } };
};
const answer=(value?:string)=>({yes:"Yes",no:"No",district:"District",kelly:"Kelly",both:"Both"}[value||""]||"Not answered");
export function contactRows(rows:ReportRow[]) {
  return rows.map(({school,visit:v})=>[school.name,school.id,v.lastVisitedAt||"",v.sublocatorName||"",v.sublocatorPhone||"",v.sublocatorEmail||"",v.sublocatorRating||"",answer(v.survey?.attendance),answer(v.survey?.dressCode),answer(v.survey?.callback),v.survey?(v.survey.source==="sublocator_in_person"?"Sublocator in person":"Staff entry - not confirmed by Sublocator"):"Not recorded",v.survey?.recordedBy||"",v.visitedByName||v.visitedByEmail||v.visitedBy||""]);
}
const date=()=>new Date().toISOString().slice(0,10);
export async function buildContactsWorkbook(rows:ReportRow[]) {
  const { default: ExcelJS }=await import("exceljs");
  const {Workbook}=ExcelJS;
  const workbook=new Workbook();workbook.creator="MiamiSchools";workbook.created=new Date();
  const sheet=workbook.addWorksheet("Sublocators",{views:[{state:"frozen",ySplit:1}]});
  const headers=["School","School ID","Visit date","Sublocator name","Phone","Email","Kelly rating (1-5)","Attendance issues","Dress code issues","Call requested","Response source","Survey recorded by","Visited by"];
  sheet.columns=headers.map((header,i)=>({header,width:[40,16,16,28,22,38,20,22,22,22,48,38,30][i]}));
  // Strings stay literal strings, including +phone numbers and values beginning with =.
  for(const row of contactRows(rows))sheet.addRow(row);
  sheet.autoFilter={from:"A1",to:"M1"};
  sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
  sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF14261F"}};
  sheet.getRow(1).height=32;
  sheet.eachRow(row=>{row.alignment={vertical:"top",wrapText:true}});
  return workbook;
}
export async function exportContacts(rows:ReportRow[]) {
  const workbook=await buildContactsWorkbook(rows);
  const data=await workbook.xlsx.writeBuffer();
  const url=URL.createObjectURL(new Blob([data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  const link=document.createElement("a");link.href=url;link.download=`MiamiSchools-sublocators-${date()}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function buildNotesPdf(rows:ReportRow[]) {
  const {jsPDF}=await import("jspdf");
  const pdf=new jsPDF({unit:"mm",format:"a4"});let y=20;
  const write=(text:string,size=11,bold=false)=>{
    pdf.setFont("helvetica",bold?"bold":"normal");pdf.setFontSize(size);
    // Standard PDF font supports Latin text; unsupported symbols are replaced explicitly.
    const safe=text.replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/gu,"?");
    const lines=pdf.splitTextToSize(safe,174) as string[];
    for(const line of lines){if(y>276){pdf.addPage();y=20}pdf.text(line,18,y);y+=size*0.45+1}
    y+=3;
  };
  write("MiamiSchools - Visit notes",18,true);write(`Generated ${date()}. Saved visits matching map filters. Incident notes excluded.`,10);
  for(const {school,visit:v} of rows.filter(r=>r.visit.notes?.trim())){
    if(y>240){pdf.addPage();y=20}
    write(school.name,14,true);write(`${school.address}, ${school.city}`,10);
    write(`Visit: ${v.lastVisitedAt||"Not recorded"} | By: ${v.visitedByName||v.visitedByEmail||v.visitedBy||"Not recorded"}`,10);
    write(`Sublocator: ${v.sublocatorName||"Not recorded"}`,10);write(v.notes||"");y+=5;
  }
  const count=pdf.getNumberOfPages();for(let i=1;i<=count;i++){pdf.setPage(i);pdf.setFontSize(9);pdf.text(`${i} / ${count}`,185,289,{align:"right"})}
  return pdf;
}
export async function exportNotes(rows:ReportRow[]) {
  const pdf=await buildNotesPdf(rows);
  pdf.save(`MiamiSchools-visit-notes-${date()}.pdf`);
}

export async function buildSurveyWorkbook(rows:ReportRow[]) {
  const {default:ExcelJS}=await import("exceljs");
  const workbook=new ExcelJS.Workbook();workbook.creator="MiamiSchools";workbook.created=new Date();
  const sheet=workbook.addWorksheet("Survey results",{views:[{state:"frozen",ySplit:1}]});
  const headers=["School","School ID","Visit date","Sublocator name","Attendance issues","Dress code issues","Call requested","Response source","Survey recorded by"];
  sheet.columns=headers.map((header,i)=>({header,width:[40,16,16,28,24,24,24,48,38][i]}));
  for(const {school,visit:v} of rows){
    if(!v.survey||!(v.survey.attendance||v.survey.dressCode||v.survey.callback))continue;
    sheet.addRow([school.name,school.id,v.lastVisitedAt||"",v.sublocatorName||"",answer(v.survey.attendance),answer(v.survey.dressCode),answer(v.survey.callback),v.survey.source==="sublocator_in_person"?"Sublocator in person":"Staff entry - not confirmed by Sublocator",v.survey.recordedBy||""]);
  }
  sheet.autoFilter={from:"A1",to:"I1"};sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
  sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF14261F"}};
  sheet.getRow(1).height=32;sheet.eachRow(row=>{row.alignment={vertical:"top",wrapText:true}});
  return workbook;
}
export async function exportSurvey(rows:ReportRow[]) {
  const workbook=await buildSurveyWorkbook(rows);
  const data=await workbook.xlsx.writeBuffer();
  const url=URL.createObjectURL(new Blob([data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
  const link=document.createElement("a");link.href=url;link.download=`MiamiSchools-survey-results-${date()}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
