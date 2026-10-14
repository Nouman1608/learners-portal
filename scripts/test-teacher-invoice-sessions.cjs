const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../backend/src/services/invoices.service.ts'), 'utf8');
const loop = source.slice(source.indexOf('    if (!isSalaried) for (const teacherCourse'), source.indexOf('    if (lineItemsData.length === 0)', source.indexOf('  async generateTeacherInvoice(')));
const ts = require('../backend/node_modules/typescript');
const js = ts.transpile(loop, { target: ts.ScriptTarget.ES2022 });
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const run = new AsyncFunction('db', 'enrollments', 'users', 'fees', 'eq', 'and', 'logger', 'feesService', 'manualSessions', 'input', 'teacherCourses', 'isSalaried', 'hasLocalConfig', 'hasOnlineConfig', 'localFeePercentage', 'onlineFixedAmountIg', 'onlineFixedAmountAlevel', `const lineItemsData=[];let totalAmount=0;${js};return {lineItemsData,totalAmount};`);
async function calculate(mode, count, storedFee, salaried=false) {
  const enrollment = { id:'enrollment', classType:'1-to-1', attendanceMode:mode, perSessionFee:'3500', student:{firstName:'Test',lastName:'Student'} };
  const responses = [[enrollment], storedFee ? [storedFee] : []];
  const query = () => { const q={}; for (const method of ['from','innerJoin','where','limit']) q[method]=()=>q; q.then=(resolve,reject)=>Promise.resolve(responses.shift()).then(resolve,reject);return q; };
  return run({select:query},{},{},{},()=>null,()=>null,{info(){}},{shouldGenerateFeeForMonth(){throw Error('One-to-one must not use cutoff');}},new Map(count===undefined?[]:[['enrollment',count]]),{month:10,year:2026},[{courseId:'course',course:{title:'Physics',courseLevel:'alevel'}}],salaried,true,true,70,6000,6000);
}
(async()=>{
  let result=await calculate('online',8,{id:'fee',amount:'0',sessionCount:0});
  assert.equal(result.totalAmount,6000);
  assert.equal(result.lineItemsData[0].metadata.sessionCount,'8');
  assert.equal(result.lineItemsData[0].metadata.sessionSource,'admin override');
  assert.equal(result.lineItemsData[0].feeId,null);
  assert.match(result.lineItemsData[0].description,/8 sessions/);
  result=await calculate('local',3,undefined);
  assert.equal(result.totalAmount,7350);
  assert.equal(result.lineItemsData[0].metadata.studentFee,'10500');
  result=await calculate('online',0,{id:'fee',amount:'28000',sessionCount:8});
  assert.equal(result.lineItemsData.length,0);
  result=await calculate('online',undefined,{id:'fee',amount:'28000',sessionCount:8});
  assert.equal(result.totalAmount,6000);
  assert.equal(result.lineItemsData[0].feeId,'fee');
  assert.equal(result.lineItemsData[0].metadata.sessionSource,undefined);
  result=await calculate('online',undefined,{id:'fee',amount:'0',sessionCount:0});
  assert.equal(result.totalAmount,0);
  result=await calculate('online',8,undefined,true);
  assert.equal(result.lineItemsData.length,0);
  const begin = source.indexOf('  async generateTeacherInvoice(');
  const validation = source.slice(source.indexOf('    const manualSessions', begin), source.indexOf('    // Check if latest invoice already exists', begin));
  const validate = new AsyncFunction('input', 'AppError', ts.transpile(validation, { target: ts.ScriptTarget.ES2022 }) + ';return manualSessions;');
  const context = { async getTeacher1to1Sessions() { return [{ enrollmentId: 'enrollment' }]; } };
  const input = sessionOverrides => ({ teacherId: 'teacher', month: 10, year: 2026, sessionOverrides });
  for (const overrides of [
    [{ enrollmentId: 'another-teacher-enrollment', sessionCount: 1 }],
    [{ enrollmentId: 'enrollment', sessionCount: -1 }],
    [{ enrollmentId: 'enrollment', sessionCount: 1.5 }],
    [{ enrollmentId: 'enrollment', sessionCount: 1 }, { enrollmentId: 'enrollment', sessionCount: 2 }],
  ]) await assert.rejects(() => validate.call(context, input(overrides), Error));
  const accepted = await validate.call(context, input([{ enrollmentId: 'enrollment', sessionCount: 0 }]), Error);
  assert.equal(accepted.get('enrollment'), 0);
  console.log('PASS: manual online/local counts, zero exclusion, snapshots, stored-fee fallback, salaried behavior');
})().catch(e=>{console.error(e);process.exitCode=1;});
