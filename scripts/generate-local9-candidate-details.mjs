import fs from 'node:fs/promises';

const ELECTION_ID = '0020260603';
const BASE_URL = 'https://info.nec.go.kr';
const OUT_PATH = 'src/data/static/local_9_candidate_details.json';
const INDEX_PATH = 'src/data/static/local_9_candidate_index.json';

const CITY_CODE_BY_SIDO_CODE = {
  '11': '1100',
  '21': '2600',
  '22': '2700',
  '23': '2800',
  '24': '2900',
  '25': '3000',
  '26': '3100',
  '29': '5100',
  '31': '4100',
  '32': '5200',
  '33': '4300',
  '34': '4400',
  '35': '5300',
  '36': '4600',
  '37': '4700',
  '38': '4800',
  '39': '4900',
};

const ELECTION_CODE_BY_SUB_TYPE = {
  metro_mayor: '3',
  mayor: '4',
  council_district: '5',
  basic_district: '6',
  council_pr: '8',
  basic_pr: '9',
};

const REPORT_PATH = '/electioninfo/electionInfo_report.xhtml';

function normalizeKey(value = '') {
  return `${value}`.replace(/\s+/g, '').trim();
}

function normalizeText(value = '') {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value = '') {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractSigunguFromDistrictName(districtName = '') {
  let work = districtName.trim();
  work = work.replace(/(제(\d+|[일이삼사오육칠팔구십]+)|[가-힣])선거구$/, '');
  work = work.replace(/선거구$/, '');
  work = work.replace(/제(\d+|[일이삼사오육칠팔구십]+)$/, '');
  work = work.replace(/\d+$/, '');
  if (!work) return '';
  const guMatch = work.match(/^(.+?시)(.+구)$/);
  return guMatch ? guMatch[2] : work;
}

function detailKey(localSubType, party, name, district) {
  return [
    localSubType,
    normalizeKey(party),
    normalizeKey(name),
    normalizeKey(district),
  ].join('|');
}

async function postText(path, params) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
    },
    body: new URLSearchParams(params),
  });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.text();
}

async function selectbox(path, params) {
  const text = await postText(path, params);
  return JSON.parse(text).jsonResult?.body ?? [];
}

async function report(params) {
  return postText(REPORT_PATH, {
    electionId: ELECTION_ID,
    requestURI: '/electioninfo/0020260603/cp/cpri03.jsp',
    topMenuId: 'CP',
    secondMenuId: 'CPRI03',
    menuId: 'CPRI03',
    dateCode: '0',
    ...params,
  });
}

function parseCandidateRows(html, localSubType) {
  const tableMatch = html.match(/<table id="table01"[\s\S]*?<\/table>/);
  if (!tableMatch) return [];

  return [...tableMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((match) => {
      const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]);
      if (cells.length < 11 || normalizeText(cells[0]).includes('검색된 결과가 없습니다')) return null;

      const nameCell = cells[4];
      const nameMatch = nameCell.match(/<a\b[^>]*>([\s\S]*?)<br\s*\/?>/i);
      const name = normalizeText(nameMatch?.[1] ?? nameCell.replace(/\(.+\)/, ''));
      if (!name) return null;

      const birthAge = normalizeText(cells[6]);
      const age = Number(birthAge.match(/\((\d+)세\)/)?.[1] ?? 0);
      const party = normalizeText(cells[3]) || '무소속';
      if ((localSubType === 'council_pr' || localSubType === 'basic_pr') && party === '계') return null;

      return {
        key: detailKey(localSubType, party, name, normalizeText(cells[0])),
        value: {
          age: Number.isFinite(age) ? age : 0,
          gender: normalizeText(cells[5]) || '-',
          job: normalizeText(cells[8]) || '-',
          education: normalizeText(cells[9]) || '-',
          career: normalizeText(cells[10]) || '-',
        },
      };
    })
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = [];
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function getTownRows(electionCode, cityCode) {
  const path = electionCode === '5'
    ? '/bizcommon/selectbox/selectbox_townCodeByCityIntgSgJson.json'
    : '/bizcommon/selectbox/selectbox_townCodeBySgJson.json';
  return selectbox(path, { electionId: ELECTION_ID, electionCode, cityCode });
}

async function getSggCityRows(electionCode, cityCode) {
  return selectbox('/bizcommon/selectbox/selectbox_getSggCityCodeJson.json', {
    electionId: ELECTION_ID,
    electionCode,
    cityCode,
  });
}

function addParsedRows(details, html, localSubType) {
  for (const row of parseCandidateRows(html, localSubType)) {
    details[row.key] = row.value;
  }
}

async function main() {
  const index = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8'));
  const details = {};

  const bySubType = new Map();
  for (const entry of index) {
    const localSubType = entry.electionHint?.localSubType;
    if (!localSubType) continue;
    if (!bySubType.has(localSubType)) bySubType.set(localSubType, []);
    bySubType.get(localSubType).push(entry);
  }

  const metroSidoCodes = unique((bySubType.get('metro_mayor') ?? []).map((entry) => entry.adm_cd.slice(0, 2)));
  await mapWithConcurrency(metroSidoCodes, 4, async (sidoCode) => {
    const electionCode = ELECTION_CODE_BY_SUB_TYPE.metro_mayor;
    const cityCode = CITY_CODE_BY_SIDO_CODE[sidoCode];
    if (!cityCode) return;
    const html = await report({
      statementId: `CPRI03_#${electionCode}`,
      electionCode,
      cityCode,
    });
    addParsedRows(details, html, 'metro_mayor');
  });

  for (const localSubType of ['mayor', 'basic_pr']) {
    const electionCode = ELECTION_CODE_BY_SUB_TYPE[localSubType];
    const groups = new Map();
    for (const entry of bySubType.get(localSubType) ?? []) {
      const cityCode = CITY_CODE_BY_SIDO_CODE[entry.adm_cd.slice(0, 2)];
      const districtName = entry.district;
      if (!cityCode || !districtName) continue;
      const groupKey = `${cityCode}|${districtName}`;
      groups.set(groupKey, { cityCode, districtName });
    }

    const rowsByCity = new Map();
    await mapWithConcurrency(unique([...groups.values()].map((group) => group.cityCode)), 4, async (cityCode) => {
      rowsByCity.set(cityCode, await getSggCityRows(electionCode, cityCode));
    });

    await mapWithConcurrency([...groups.values()], 6, async ({ cityCode, districtName }, index) => {
      const code = rowsByCity.get(cityCode)?.find((row) => normalizeKey(row.NAME) === normalizeKey(districtName))?.CODE;
      if (!code) return;
      const html = await report({
        statementId: `CPRI03_#${electionCode}`,
        electionCode,
        cityCode,
        sggCityCode: code,
      });
      addParsedRows(details, html, localSubType);
      if ((index + 1) % 50 === 0) console.log(`${localSubType}: ${index + 1}/${groups.size}`);
    });
  }

  for (const localSubType of ['council_district', 'basic_district']) {
    const electionCode = ELECTION_CODE_BY_SUB_TYPE[localSubType];
    const groups = new Map();
    for (const entry of bySubType.get(localSubType) ?? []) {
      const cityCode = CITY_CODE_BY_SIDO_CODE[entry.adm_cd.slice(0, 2)];
      const townName = entry.sigungu_nm || extractSigunguFromDistrictName(entry.district);
      if (!cityCode || !townName) continue;
      const groupKey = `${cityCode}|${townName}`;
      groups.set(groupKey, { cityCode, townName });
    }

    const rowsByCity = new Map();
    await mapWithConcurrency(unique([...groups.values()].map((group) => group.cityCode)), 4, async (cityCode) => {
      rowsByCity.set(cityCode, await getTownRows(electionCode, cityCode));
    });

    await mapWithConcurrency([...groups.values()], 6, async ({ cityCode, townName }, index) => {
      const townCode = rowsByCity.get(cityCode)?.find((row) => normalizeKey(row.NAME) === normalizeKey(townName))?.CODE;
      if (!townCode) return;
      const html = await report({
        statementId: `CPRI03_#${electionCode}`,
        electionCode,
        cityCode,
        townCode,
        sggTownCode: '0',
      });
      addParsedRows(details, html, localSubType);
      if ((index + 1) % 50 === 0) console.log(`${localSubType}: ${index + 1}/${groups.size}`);
    });
  }

  await fs.writeFile(OUT_PATH, `${JSON.stringify(details)}\n`);
  console.log(`Wrote ${Object.keys(details).length} candidate details to ${OUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
