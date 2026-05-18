import xlsx from 'xlsx';
import fs from 'fs';

const workbook = xlsx.readFile('@제8회_전국동시지방선거_당선인명단_게시.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const SIDO_QUOTA_NAMES = {
  '서울특별시': '서울',
  '부산광역시': '부산',
  '대구광역시': '대구',
  '인천광역시': '인천',
  '광주광역시': '광주',
  '대전광역시': '대전',
  '울산광역시': '울산',
  '세종특별자치시': '세종',
  '경기도': '경기',
  '강원도': '강원',
  '충청북도': '충북',
  '충청남도': '충남',
  '전라북도': '전북',
  '전라남도': '전남',
  '경상북도': '경북',
  '경상남도': '경남',
  '제주특별자치도': '제주',
};

const quotaMapPath = 'src/data/electionQuotaMap.json';
const quotaMap = JSON.parse(fs.readFileSync(quotaMapPath, 'utf8'));

let matchCount = 0;
const counts = {};

for (let i = 3; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length < 6) continue;
  
  const electionName = row[0];
  if (electionName !== '구·시·군의회의원선거') continue;

  const sido = row[1];
  const sigungu = row[2];
  const district = row[3];
  
  const city = SIDO_QUOTA_NAMES[sido];
  if (!city) continue;

  const key = `8_${city}_basic_${district}`;
  counts[key] = (counts[key] || 0) + 1;
}

for (const [key, count] of Object.entries(counts)) {
  quotaMap.quotas[key] = count;
  matchCount++;
}

fs.writeFileSync(quotaMapPath, JSON.stringify(quotaMap, null, 2));
console.log(`Updated quotas for ${matchCount} basic districts in 8th election based on exact winner count.`);
