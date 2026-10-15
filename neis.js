// NEIS 교육정보 개방포털 OPEN API 호출 (메인 프로세스에서 실행 — CORS 없음)
const { net } = require('electron');

const BASE = 'https://open.neis.go.kr/hub';

function get(path, params) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  return new Promise((resolve, reject) => {
    const req = net.request({ url: url.toString(), method: 'GET' });
    let body = '';
    req.on('response', res => {
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('NEIS 응답 해석 실패')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

// 응답 공통 풀기: { rows:[...], error:'...' }
function unpack(json, name) {
  if (json.RESULT) {
    const code = json.RESULT.CODE || '';
    if (code === 'INFO-200') return { rows: [] };         // 데이터 없음
    return { rows: [], error: `${code} ${json.RESULT.MESSAGE || ''}`.trim() };
  }
  const block = json[name];
  if (!block) return { rows: [], error: '알 수 없는 응답' };
  const head = block[0]?.head?.[1]?.RESULT;
  if (head && head.CODE !== 'INFO-000') return { rows: [], error: `${head.CODE} ${head.MESSAGE}` };
  return { rows: block[1]?.row || [] };
}

const common = (key) => ({ KEY: key, Type: 'json', pIndex: 1, pSize: 100 });

async function searchSchool(key, name) {
  const j = await get('/schoolInfo', { ...common(key), SCHUL_NM: name });
  const r = unpack(j, 'schoolInfo');
  r.rows = r.rows.map(s => ({
    code: s.SD_SCHUL_CODE, name: s.SCHUL_NM, office: s.ATPT_OFCDC_SC_CODE,
    officeName: s.ATPT_OFCDC_NM, kind: s.SCHUL_KND_SC_NAME, addr: s.ORG_RDNMA,
  }));
  return r;
}

// ymd: 'YYYYMMDD'
async function meals(key, office, code, ymd) {
  const j = await get('/mealServiceDietInfo', { ...common(key), ATPT_OFCDC_SC_CODE: office, SD_SCHUL_CODE: code, MLSV_YMD: ymd });
  const r = unpack(j, 'mealServiceDietInfo');
  r.rows = r.rows.map(m => ({
    type: m.MMEAL_SC_NM, typeCode: m.MMEAL_SC_CODE, date: m.MLSV_YMD,
    dishes: parseDishes(m.DDISH_NM), cal: (m.CAL_INFO || '').trim(),
    origin: (m.ORPLC_INFO || '').split('<br/>').map(s => s.trim()).filter(Boolean),
    nutrition: (m.NTR_INFO || '').split('<br/>').map(s => s.trim()).filter(Boolean),
  }));
  return r;
}

// 월 단위 급식 날짜(달력 점 표시용)
async function mealDays(key, office, code, yyyymm) {
  const j = await get('/mealServiceDietInfo', { ...common(key), pSize: 1000, ATPT_OFCDC_SC_CODE: office, SD_SCHUL_CODE: code, MLSV_FROM_YMD: yyyymm + '01', MLSV_TO_YMD: yyyymm + '31' });
  const r = unpack(j, 'mealServiceDietInfo');
  return { ...r, rows: [...new Set(r.rows.map(m => m.MLSV_YMD))] };
}

// 학사일정: 월 단위로 받아 날짜별 묶음
async function schedule(key, office, code, yyyymm) {
  const j = await get('/SchoolSchedule', { ...common(key), pSize: 1000, ATPT_OFCDC_SC_CODE: office, SD_SCHUL_CODE: code, AA_FROM_YMD: yyyymm + '01', AA_TO_YMD: yyyymm + '31' });
  const r = unpack(j, 'SchoolSchedule');
  const byDate = {};
  r.rows.forEach(e => {
    const name = (e.EVENT_NM || '').trim();
    if (!name) return;
    (byDate[e.AA_YMD] ||= []).push({
      name, grades: ['ONE', 'TW', 'THREE', 'FR', 'FIV', 'SIX'].map((g, i) => e[`${g}_GRADE_EVENT_YN`] === 'Y' ? i + 1 : null).filter(Boolean),
      kind: e.SBTR_DD_SC_NM || '',
    });
  });
  return { rows: byDate, error: r.error };
}

// "기장밥 <br/>돈까스 (1.2.5.6)<br/>..." → [{name, allergy:[1,2,5,6]}]
function parseDishes(str) {
  return (str || '').split('<br/>').map(s => s.trim()).filter(Boolean).map(s => {
    const nums = [];
    const name = s.replace(/\(([\d.\s,]+)\)\s*$/, (_, g) => {
      g.split(/[.,\s]+/).forEach(n => n && nums.push(+n)); return '';
    }).replace(/\s*\.$/, '').trim();
    return { name, allergy: nums };
  });
}

module.exports = { searchSchool, meals, mealDays, schedule };
