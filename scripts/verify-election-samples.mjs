import local8BasicDistrict from '../src/data/static/local_8_basic_district.json' with { type: 'json' };
import local8CouncilDistrict from '../src/data/static/local_8_council_district.json' with { type: 'json' };

const SERVICE_KEY = 'fcfb6899040b2dc7f9c3bf04402834c6a83364a827417cad9d2052178fce7591';
const NEC_BASE = 'https://apis.data.go.kr/9760000/VoteXmntckInfoInqireService2/getXmntckSttusInfoInqire';
const SEOUL = '서울특별시';
const SAMPLE_GU = ['양천구', '강서구', '송파구', '마포구', '종로구', '강남구'];
const SAMPLE_DONG = [
  '서울특별시|양천구|목2동',
  '서울특별시|양천구|목3동',
  '서울특별시|강서구|화곡3동',
  '서울특별시|송파구|잠실3동',
  '서울특별시|마포구|아현동',
  '서울특별시|강남구|역삼1동',
];

async function fetchDistrictRows(wiwName, sgTypecode) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: '1',
    numOfRows: '1000',
    resultType: 'json',
    sgId: '20220601',
    sgTypecode,
    sdName: SEOUL,
    wiwName,
  });

  const url = `${NEC_BASE}?${params}`;
  const json = await fetch(url).then((response) => response.json());
  const items = json?.response?.body?.items?.item;

  return {
    url,
    statusCode: json?.response?.header?.resultCode,
    items: !items ? [] : Array.isArray(items) ? items : [items],
  };
}

function printStaticSnapshot(title, dataset, areaName) {
  const rows = Object.entries(dataset).filter(([key]) => key.includes(`${SEOUL}|${areaName}|`));
  console.log(`\n[${title}] ${areaName} static rows=${rows.length}`);
  for (const [key, value] of rows.slice(0, 8)) {
    const names = value.candidates.map((candidate) => candidate.name).join(', ');
    console.log(`${key} => ${value.election_district} | ${names}`);
  }
}

console.log('서울 선거 데이터 표본 검증');

for (const area of SAMPLE_GU) {
  const basic = await fetchDistrictRows(area, '6');
  const council = await fetchDistrictRows(area, '5');

  console.log(`\n[NEC basic district] ${area} rows=${basic.items.length} status=${basic.statusCode}`);
  console.log(`requestUrl=${basic.url}`);
  for (const item of basic.items) {
    const names = ['hbj01', 'hbj02', 'hbj03', 'hbj04', 'hbj05']
      .map((key) => item[key])
      .filter(Boolean)
      .join(', ');
    console.log(`${item.sggName} | ${item.wiwName} | ${names}`);
  }

  console.log(`\n[NEC council district] ${area} rows=${council.items.length} status=${council.statusCode}`);
  console.log(`requestUrl=${council.url}`);
  for (const item of council.items) {
    const names = ['hbj01', 'hbj02', 'hbj03']
      .map((key) => item[key])
      .filter(Boolean)
      .join(', ');
    console.log(`${item.sggName} | ${item.wiwName} | ${names}`);
  }

  printStaticSnapshot('static basic district', local8BasicDistrict, area);
  printStaticSnapshot('static council district', local8CouncilDistrict, area);
}

console.log('\n[static exact dong samples]');
for (const key of SAMPLE_DONG) {
  const basic = local8BasicDistrict[key];
  const council = local8CouncilDistrict[key];
  if (basic) {
    console.log(`${key} => basic | ${basic.election_district} | ${basic.candidates.map((candidate) => candidate.name).join(', ')}`);
  }
  if (council) {
    console.log(`${key} => council | ${council.election_district} | ${council.candidates.map((candidate) => candidate.name).join(', ')}`);
  }
}
