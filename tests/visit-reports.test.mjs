import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContactsWorkbook, buildNotesPdf, contactRows } from '../lib/visit-reports.ts';
const row={school:{name:'Escuela José',id:'001',address:'100 Main St',city:'Miami'},visit:{lastVisitedAt:'2026-11-02',sublocatorName:'=Literal name',sublocatorPhone:'+13055550123',sublocatorEmail:'test@example.com',notes:'Notas en español: atención.\n'.repeat(180),survey:{attendance:'no',dressCode:'yes',callback:'both',source:'sublocator_in_person',recordedBy:'staff@example.com'}}};
test('Excel preserves literal contact values and distinguishes missing survey answers',async()=>{
 const workbook=await buildContactsWorkbook([row,{...row,visit:{}}]);
 const bytes=await workbook.xlsx.writeBuffer();
 const ExcelJS=(await import('exceljs')).default;
 const recovered=new ExcelJS.Workbook();await recovered.xlsx.load(bytes);
 const sheet=recovered.getWorksheet('Sublocators');
 assert.equal(sheet.rowCount,3);
 assert.equal(sheet.getCell('D2').value,'=Literal name');
 assert.equal(sheet.getCell('E2').value,'+13055550123');
 assert.equal(sheet.getCell('J2').value,'Both');
 assert.equal(sheet.getCell('H3').value,'Not answered');
 assert.equal(sheet.getCell('K2').value,'Sublocator in person');
 assert.equal(sheet.views[0].state,'frozen');
 assert.equal(contactRows([{...row,visit:{survey:{...row.visit.survey,source:'staff_report'}}}])[0][10],'Staff entry - not confirmed by Sublocator');
});
test('PDF paginates long notes and excludes records without notes',async()=>{
 const pdf=await buildNotesPdf([row,{school:{...row.school,name:'SHOULD NOT APPEAR'},visit:{}}]);
 assert.ok(pdf.getNumberOfPages()>1);
 const data=pdf.output();
 assert.match(data,/Visit notes/);
 assert.match(data,/atenci/);
 assert.doesNotMatch(data,/SHOULD NOT APPEAR/);
 assert.ok(data.startsWith('%PDF-'));
});
