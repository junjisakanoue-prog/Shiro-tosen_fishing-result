/* 城渡船 釣果データ ハーベスタ
   使い方: node scrape.js
   出力  : data.js

   site 番号は catch.php 内の <script>site='4370';</script> に定義されている。
   API は select（月の選択）× page（ページ送り）で分割されているため、
   全 select について page を空になるまで辿り、choka_no で重複排除する。 */
const fs = require('fs');

const API = 'https://tsuribune.zekkouchou.com/pages/jsonget.php';
const SITE = '4370';
const MAX_SELECT = 30;   // 月セレクトの上限（空が続けば打ち切り）
const MAX_PAGE = 60;     // 1セレクトあたりのページ上限（安全弁）

async function post(select, page) {
  const body = new URLSearchParams({ site: SITE, page: String(page), select: String(select) });
  for (let retry = 0; retry < 3; retry++) {
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const txt = await r.text();
      if (!txt.trim()) return null;
      return JSON.parse(txt);
    } catch (e) {
      if (retry === 2) { console.warn(`  ! select=${select} page=${page} 失敗: ${e.message}`); return null; }
      await new Promise(r => setTimeout(r, 600));
    }
  }
}

const clean = s => (s || '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  const seen = new Map();
  let emptySelects = 0;

  for (let s = 0; s <= MAX_SELECT; s++) {
    let gotInSelect = 0;
    for (let p = 0; p < MAX_PAGE; p++) {
      const j = await post(s, p);
      const rows = j && Array.isArray(j.choka) ? j.choka : [];
      if (!rows.length) break;               // このセレクトはここで打ち止め
      let fresh = 0;
      rows.forEach(c => { if (!seen.has(c.choka_no)) { seen.set(c.choka_no, c); fresh++; } });
      gotInSelect += rows.length;
      process.stdout.write(`\r select=${s} page=${p}: ${rows.length}件 (新規${fresh}) / 累計 ${seen.size}   `);
      if (!fresh && p > 0) break;            // 同じページが返り続ける場合の保険
      await new Promise(r => setTimeout(r, 120)); // サーバ負荷への配慮
    }
    if (!gotInSelect) { emptySelects++; if (emptySelects >= 6) break; }
    else emptySelects = 0;
  }
  console.log('\n取得完了:', seen.size, '件');

  const records = [...seen.values()].map(c => {
    const d = c.choka_date.match(/(\d+)年(\d+)月(\d+)日（(.)）/);
    const imgs = (c.choka_img || []).map(i => ({
      thumb: i.url, full: i.url_ori || i.url, title: clean(i.title),
    }));
    return {
      no: c.choka_no,
      date: d ? `${d[1]}-${d[2]}-${d[3]}` : '',
      y: d ? +d[1] : 0, m: d ? +d[2] : 0, d: d ? +d[3] : 0, dow: d ? d[4] : '',
      choji: clean(c.choji),
      comment: clean(c.choka_comment),
      weather: clean(c.weather),
      wt: clean(c.water_temperature),
      ship: clean(c.ship_name),
      fisher: clean(c.fisher_ct),
      imgs,
      fish: (c.choka_fish || []).map(f => ({
        name: clean(f.name), size: clean(f.size), count: clean(f.count),
      })).filter(f => f.name),
      others: (c.choka_othres || []).map(o => clean(o.name || o)).filter(Boolean),
    };
  }).filter(r => r.date).sort((a, b) => a.date < b.date ? 1 : -1);

  const withImg = records.filter(r => r.imgs.length).length;
  const species = new Set(); records.forEach(r => r.fish.forEach(f => species.add(f.name)));
  console.log(`期間: ${records[records.length - 1].date} 〜 ${records[0].date}`);
  console.log(`写真あり: ${withImg}件 / 魚種: ${species.size}`);

  fs.writeFileSync('data.js',
    `/* 城渡船 釣果データ（https://zekkouchou.com/shirotosen/catch.php）\n` +
    `   取得日: ${new Date().toISOString().slice(0, 10)} / ${records.length}件 / 写真${withImg}件\n` +
    `   更新するには: node scrape.js */\n` +
    `const RECORDS = ${JSON.stringify(records)};\n`);
  console.log('→ data.js を書き出しました');
})();
