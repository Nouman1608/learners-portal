const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const ts = require('../backend/node_modules/typescript');
const src = fs.readFileSync(__dirname + '/../backend/src/services/invoices.service.ts', 'utf8').replace(/\r\n/g, '\n');
const method = src.slice(src.indexOf('  async generateTeacherInvoice('), src.indexOf('\n  /**\n   * Get invoices with filtering'));
const js = ts.transpile('const service = {' + method + '};', {target: ts.ScriptTarget.ES2022});
async function run({count=8, level='ig', rate='2000', group=false, amount='24000', manual=false, local=false}={}) {
  const teacher={role:'teacher',firstName:'Test',lastName:'Teacher',localStudentFeePercentage:'75',onlineStudentFixedAmountIg:'6000',onlineStudentFixedAmountAlevel:'7000',oneToOneClassRate:rate};
  const enrollment={id:'enrollment',classType:group?'online':'1-to-1',attendanceMode:local?'local':'online',perSessionFee:'3000',customFeePerMonth:'24000',student:{firstName:'Test',lastName:'Student'}};
  const queue=[[],[teacher],[{courseId:'course',course:{title:'Physics',courseLevel:level}}],[enrollment],[{id:'fee',amount,sessionCount:count}]];
  const inserted=[];
  function chain(result){const q=new Proxy({}, {get(_,key){if(key==='then') return (ok,bad)=>Promise.resolve(result).then(ok,bad);return ()=>q;}}); return q;}
  const db={select:()=>chain(queue.shift()),insert:()=>({values(data){inserted.push(data);return chain(Array.isArray(data)?data:[{id:'invoice',...data}]);}}),update:()=>chain([{id:'invoice'}])};
  const table=new Proxy({}, {get:(_,k)=>k});
  class AppError extends Error{constructor(status,message){super(message);this.status=status;}}
  const context={teacherOneToOneRates:rate===null?{default:2000}:{default:2000,teacher:Number(rate)},db,users:table,invoices:table,invoiceLineItems:table,enrollments:table,fees:table,courses:table,courseTeachers:table,courseEvents:table,eq:()=>true,and:()=>true,AppError,logger:{info(){},warn(){}},feesService:{shouldGenerateFeeForMonth:()=>true}};
  vm.createContext(context); vm.runInContext(js+';globalThis.service=service;',context);
  Object.assign(context.service,{getTeacher1to1Sessions:async()=>[{enrollmentId:'enrollment'}],getNextSequence:async()=>1,generateInvoiceNumber:()=> 'TEST',generateTeacherInvoicePDF:async()=>'',generateSimplifiedTeacherInvoicePDF:async()=>''});
  await context.service.generateTeacherInvoice({teacherId:'teacher',month:10,year:2026,...(manual?{sessionOverrides:[{enrollmentId:'enrollment',sessionCount:count}]}:{})});
  return inserted[1][0];
}
(async()=>{
  for(const level of ['ig','alevel']){const line=await run({level});assert.equal(Number(line.amount),16000);assert.equal(Number(line.quantity),8);assert.equal(Number(line.unitPrice),2000);}
  const override=await run({manual:true,count:5});assert.equal(Number(override.amount),10000);
  assert.equal(Number((await run({group:true})).amount),6000);
  assert.equal(Number((await run({group:true,level:'alevel'})).amount),7000);
  assert.equal(Number((await run({group:true,amount:'12000'})).amount),3000);
  assert.equal(Number((await run({local:true})).amount),16000);
  assert.equal(Number((await run({local:true,group:true})).amount),18000);
  assert.equal(Number((await run({rate:'2500'})).amount),20000);
  assert.equal(Number((await run({rate:'2500',local:true})).amount),20000);
  assert.equal(Number((await run({rate:null})).amount),16000);
  await assert.rejects(run({count:0,amount:'0'}), /No earnings/);
  console.log('PASS: IG and A Level rates, manual counts, group rates, proration, local percentage, missing rate, zero sessions');
})().catch(e=>{console.error(e);process.exitCode=1});



