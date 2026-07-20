/* ===== 城渡船 釣果アナライザ : アプリ ===== */
const CATCHES = buildCatches(RECORDS);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const fmtH = h => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');

const PAGE_SIZE = 10;
const state = { axis: 'species', species: '', tide: '', from: '', to: '', metric: 'records',
                q: '', sortK: 'date', sortDir: -1, showAll: false };

/* ---------- HERO 装飾 ---------- */
(function bubbles() {
  const box = $('#bubbles');
  for (let i = 0; i < 26; i++) {
    const b = document.createElement('span');
    const sz = 4 + Math.random() * 16;
    b.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random() * 100}%;
      animation-duration:${9 + Math.random() * 16}s;animation-delay:${-Math.random() * 20}s;
      --dx:${(Math.random() - .5) * 90}px`;
    box.appendChild(b);
  }
})();

(function heroStats() {
  const days = new Set(CATCHES.map(c => c.date)).size;
  const sp = new Set(CATCHES.map(c => c.species)).size;
  const dates = CATCHES.map(c => c.date).sort();
  const stats = [
    [RECORDS.length, '釣果レポート'],
    [sp, '魚種'],
    [days, '釣行日'],
    [dates[0].replace(/-/g, '.'), '記録開始'],
  ];
  $('#heroStats').innerHTML = stats
    .map(([v, l]) => `<div class="hero-stat"><b>${v}</b><small>${l}</small></div>`).join('');
  $('#footCount').textContent = RECORDS.length;
})();

/* ---------- フィルタ ---------- */
function filtered() {
  return CATCHES.filter(c => {
    if (state.species && c.species !== state.species) return false;
    if (state.tide && c.tide !== state.tide) return false;
    if (state.from && c.date < state.from) return false;
    if (state.to && c.date > state.to) return false;
    return true;
  });
}
const val = c => state.metric === 'count' ? (c.count || 0) : 1;

function tally(rows, keyFn) {
  const m = new Map();
  rows.forEach(c => {
    const k = keyFn(c);
    if (k == null) return;
    m.set(k, (m.get(k) || 0) + val(c));
  });
  return m;
}

/* ---------- 描画ヘルパー ---------- */
/* 横棒グラフ。warm を省略すると現在の集計値（件数/総数）に応じて自動配色する。
   件数=寒色（アクア系）／総数=暖色（オレンジ系）で一目で区別できる。 */
function barChart(entries, opt = {}) {
  if (!entries.length) return '<div class="empty">該当するデータがありません。</div>';
  const warm = opt.warm != null ? opt.warm : state.metric === 'count';
  const unit = opt.unit != null ? opt.unit : UNIT();
  const max = Math.max(...entries.map(e => e[1])) || 1;
  const w = warm ? ' warm' : '';
  return '<div class="bars">' + entries.map(([k, v], i) => `
    <div class="bar-row">
      <span class="lab" title="${k}">${k}</span>
      <span class="bar-track"><i class="bar-fill${w}"
        style="width:${(v / max * 100).toFixed(1)}%;animation-delay:${Math.min(i * 25, 600)}ms"></i></span>
      <span class="val${w}">${v}${unit}</span>
    </div>`).join('') + '</div>';
}
const card = (title, sub, body) =>
  `<div class="chart-card"><h3>${title}</h3><p class="sub">${sub}</p>${body}</div>`;

/* ドーナツ（シェア）グラフ。entries = [[ラベル, 値], ...] */
const PIE_COLORS = ['#ff6b52', '#ffc63f', '#3fc8d8', '#7fe3d4', '#9b8cff', '#ff9ec4',
                    '#6ee7a0', '#f4a261', '#5aa9e6', '#c5d86d'];
function donut(entries, { centerLabel = '', centerSub = '', unit = '%' } = {}) {
  if (!entries.length) return '<div class="empty">データがありません。</div>';
  const total = entries.reduce((s, e) => s + e[1], 0) || 1;
  const R = 70, C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = entries.map(([, v], i) => {
    const frac = v / total, dash = frac * C;
    const seg = `<circle r="${R}" cx="100" cy="100" stroke="${PIE_COLORS[i % PIE_COLORS.length]}"
      stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}"
      stroke-dashoffset="${(-acc * C).toFixed(2)}" transform="rotate(-90 100 100)"></circle>`;
    acc += frac;
    return seg;
  }).join('');
  const legend = entries.map(([k, v], i) => `
    <div class="legend-item">
      <span class="legend-swatch" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
      <span class="legend-name" title="${k}">${k}</span>
      <span class="legend-val">${Math.round(v / total * 100)}${unit}</span>
    </div>`).join('');
  return `<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 200 200" width="200" height="200" role="img">
      <circle class="track" r="${R}" cx="100" cy="100"></circle>
      ${arcs}
      <g class="donut-center" text-anchor="middle">
        <text x="100" y="98" class="c-big">${centerLabel}</text>
        <text x="100" y="118" class="c-sub">${centerSub}</text>
      </g>
    </svg>
    <div class="legend">${legend}</div>
  </div>`;
}

/* ---------- 集計軸ごとの描画 ---------- */
const UNIT = () => state.metric === 'count' ? ' 匹' : ' 件';

const renderers = {
  species(rows) {
    const e = [...tally(rows, c => c.species)].sort((a, b) => b[1] - a[1]);
    return card('全魚種ランキング',
      `記録された魚種を${state.metric === 'count' ? '匹数' : '釣果件数'}で集計しています。`,
      barChart(e, { unit: UNIT() }));
  },

  size(rows) {
    const cm = [...tally(rows, sizeBucket)].sort((a, b) => sizeBucketOrder(a[0], b[0]));
    const kg = [...tally(rows, c => {
      if (!c.size || c.size.unit !== 'kg') return null;
      const b = Math.floor(c.size.max);
      return b + '〜' + (b + 1) + 'kg';
    })].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
    const noSize = rows.filter(c => !c.size).length;
    return card('サイズ分布（10cm刻み）',
      `cm 表記の記録を 10cm 単位で集計。大型魚は kg 表記のため別掲します。` +
      `サイズ未記載：${noSize} 件。`,
      barChart(cm) +
      (kg.length ? `<h3 style="margin:30px 0 6px;font-size:15px">kg 表記（大型魚）</h3>` +
        barChart(kg) : ''));
  },

  perSpecies(rows) {
    const bySp = new Map();
    rows.forEach(c => {
      if (!bySp.has(c.species)) bySp.set(c.species, []);
      bySp.get(c.species).push(c);
    });
    const sorted = [...bySp].sort((a, b) => b[1].length - a[1].length);
    if (!sorted.length) return '<div class="empty">該当するデータがありません。</div>';
    const body = sorted.map(([sp, cs]) => {
      const byMonth = new Array(12).fill(0);
      cs.forEach(c => byMonth[c.m - 1] += val(c));
      const rows = byMonth.map((v, i) => [(i + 1) + '月', v]).filter(r => r[1] > 0);
      const tides = [...tally(cs, c => c.tide)].sort((a, b) => b[1] - a[1]);
      const best = tides[0];
      const sizes = cs.map(c => c.size).filter(Boolean);
      const maxSz = sizes.length
        ? sizes.reduce((a, b) => (b.unit === 'kg' ? b.max * 100 : b.max) > (a.unit === 'kg' ? a.max * 100 : a.max) ? b : a)
        : null;
      return `<div class="mini">
        <h4>${sp}</h4>
        <p class="m-sub">${cs.length} 件 ／ 最大 ${maxSz ? maxSz.max + maxSz.unit : '—'}
          ／ 好調な潮 ${best ? best[0] + '(' + best[1] + ')' : '—'}</p>
        ${barChart(rows)}
      </div>`;
    }).join('');
    return card('魚種ごとの月別グラフ',
      '各魚種がどの月に釣れているかを横棒グラフで表示。狙う時期の目安になります。',
      `<div class="mini-grid">${body}</div>`);
  },

  hour(rows) {
    const withHour = rows.filter(c => c.hour != null);
    const e = [];
    for (let h = 0; h < 24; h++) {
      const v = withHour.filter(c => c.hour === h).reduce((s, c) => s + val(c), 0);
      if (v) e.push([String(h).padStart(2, '0') + '時台', v]);
    }
    const notice = `<div class="notice"><b>データについて：</b>
      元サイトの釣果レポートには <b>釣れた時刻の項目がありません</b>。
      ここではコメント欄の「朝マズメ」「〇時頃」などの表現から時刻を推定しています。
      該当は ${withHour.length} / ${rows.length} 件のみのため、参考値としてご覧ください。
      そのため時間帯の実績グラフは作れません。代わりに、釣果があった日の
      <b>マズメ時刻</b>（＝実際に狙うべき時間帯）を月別に算出して示します。</div>`;

    const chart = withHour.length
      ? card('時間帯別の釣果（コメントから推定）', '母数が小さいため参考値です。', barChart(e))
      : '';

    /* 月別の釣果件数を横棒で示しつつ、その月のマズメ時刻を併記する */
    const byMonth = {};
    rows.forEach(c => (byMonth[c.m] || (byMonth[c.m] = [])).push(c));
    const months = Object.keys(byMonth).map(Number).sort((a, b) => a - b);
    const maxV = Math.max(...months.map(mo => byMonth[mo].reduce((s, c) => s + val(c), 0))) || 1;
    const warm = state.metric === 'count';
    const mrows = months.map((mo, i) => {
      const a = byMonth[mo];
      const v = a.reduce((s, c) => s + val(c), 0);
      const avg = k => a.reduce((s, c) => s + sunTimes(c.y, c.m, c.d)[k], 0) / a.length;
      /* 狭い画面ではマズメ時刻がバーを押し潰さないよう、CSS 側で下段へ折り返す */
      return `<div class="bar-row sun-row">
        <span class="lab">${mo}月</span>
        <span class="bar-track"><i class="bar-fill${warm ? ' warm' : ''}"
          style="width:${(v / maxV * 100).toFixed(1)}%"></i></span>
        <span class="val${warm ? ' warm' : ''}">${v}${UNIT()}</span>
        <span class="sun-note">
          朝 <b>${fmtH(avg('sunrise') - .7)}〜${fmtH(avg('sunrise') + 1.5)}</b>
          ／ 夕 <b>${fmtH(avg('sunset') - 1.5)}〜${fmtH(avg('sunset') + .7)}</b>
        </span></div>`;
    }).join('');

    return notice + chart + card('月別の釣果と、その月の「狙うべき時間帯」',
      '棒は釣果、右はその月の日の出・日の入りから算出したマズメ時間帯です。',
      mrows ? `<div class="bars">${mrows}</div>` : '<div class="empty">該当なし</div>');
  },

  phase(rows) {
    const withHour = rows.filter(c => c.phase);
    const notice = `<div class="notice"><b>データについて：</b>
      「上げ7分／下げ3分」などの潮位段階は元データに含まれず、釣れた時刻も記録されていません
      （時刻を特定できたのは ${withHour.length} 件）。<b>よって「どの潮位段階で釣れたか」は算出できません。</b>
      代わりに、釣果があった日の <b>満潮・干潮の時刻分布</b> を示します。
      これは日付から推算できる実データ由来の情報です。</div>`;

    const pm = tally(withHour, c => c.phase);
    const chart = withHour.length
      ? card('潮汐（上げ／下げ n分）別の釣果', '母数が小さいため参考値です。',
             barChart(TIDE_PHASES.filter(p => pm.has(p)).map(p => [p, pm.get(p)])))
      : '';

    // 釣果日の満潮・干潮時刻を3時間帯ごとに集計
    const slot = h => `${String(Math.floor(h / 3) * 3).padStart(2, '0')}:00〜${String(Math.floor(h / 3) * 3 + 3).padStart(2, '0')}:00`;
    const hi = new Map(), lo = new Map();
    new Set(rows.map(c => c.date)).forEach(dt => {
      const [y, m2, d] = dt.split('-').map(Number);
      tideEvents(y, m2, d).forEach(ev => {
        const t = ev.type === '満潮' ? hi : lo;
        t.set(slot(ev.t), (t.get(slot(ev.t)) || 0) + 1);
      });
    });
    const srt = m2 => [...m2].sort((a, b) => a[0] < b[0] ? -1 : 1);
    return notice + chart +
      card('釣果があった日の「満潮」時刻の分布',
        '釣行日にどの時間帯で潮が満ちていたかの分布（推算）。時合を読む手がかりになります。',
        barChart(srt(hi), { unit: ' 回' })) +
      card('釣果があった日の「干潮」時刻の分布',
        '同じく干潮時刻の分布です。', barChart(srt(lo), { unit: ' 回' }));
  },

  tide(rows) {
    const order = ['大潮', '中潮', '小潮', '長潮', '若潮'];
    const m = tally(rows, c => c.tide);
    const e = order.filter(k => m.has(k)).map(k => [k, m.get(k)]);
    // 潮回りごとの「1日あたり」も出す（大潮/中潮は暦上の日数が多いため）
    const DAYS = { 大潮: 8, 中潮: 12, 小潮: 6, 長潮: 2, 若潮: 2 };
    const norm = e.map(([k, v]) => [k, +(v / DAYS[k] * 10).toFixed(1)]).sort((a, b) => b[1] - a[1]);
    return card('潮回り（大潮・中潮・小潮・長潮・若潮）別の釣果',
      '元データの「潮名」欄をそのまま集計しています。',
      barChart(e) +
      `<h3 style="margin:30px 0 6px;font-size:15px">暦日数で補正した釣果密度</h3>
       <p class="sub">1周期あたりの日数が潮ごとに違うため、日数で割って比較したものです（相対値）。</p>` +
      barChart(norm, { unit: '' }));
  },

  daily(rows) {
    const m = tally(rows, c => c.date);
    const e = [...m].sort((a, b) => a[0] < b[0] ? 1 : -1).slice(0, 40);
    return card('日別の釣果（直近40日分の記録）',
      '記録のある日のみを新しい順に表示しています。',
      barChart(e));
  },
};

/* ---------- KPI ---------- */
function renderKPI(rows) {
  const days = new Set(rows.map(c => c.date)).size;
  const sp = new Set(rows.map(c => c.species)).size;
  const total = rows.reduce((s, c) => s + (c.count || 0), 0);
  const tides = [...tally(rows, c => c.tide)].sort((a, b) => b[1] - a[1])[0];
  const kpi = [
    [rows.length, '該当レコード'],
    [sp, '魚種'],
    [days, '釣行日'],
    [total || '—', '匹数（判明分）'],
    [tides ? tides[0] : '—', '最も釣れている潮'],
  ];
  $('#kpis').innerHTML = kpi
    .map(([v, l]) => `<div class="kpi"><b>${v}</b><small>${l}</small></div>`).join('');
}

/* ---------- テーブル ---------- */
function renderTable(rows) {
  let r = rows;
  if (state.q) {
    const q = state.q.toLowerCase();
    r = r.filter(c => (c.species + c.comment + c.date + c.tide).toLowerCase().includes(q));
  }
  r = [...r].sort((a, b) => {
    const k = state.sortK;
    const av = a[k] ?? '', bv = b[k] ?? '';
    return (av < bv ? -1 : av > bv ? 1 : 0) * state.sortDir;
  });
  TABLE_ROWS = r;
  const shown = state.showAll ? r : r.slice(0, PAGE_SIZE);
  $('#tableCount').textContent = state.showAll || r.length <= PAGE_SIZE
    ? `${r.length} 件を表示`
    : `${r.length} 件中 ${shown.length} 件を表示`;
  const more = $('#btnMore');
  if (r.length <= PAGE_SIZE) more.hidden = true;
  else { more.hidden = false; more.textContent = state.showAll ? '折りたたむ' : `すべて表示（残り ${r.length - PAGE_SIZE} 件）`; }
  /* data-label はスマホでカード表示にしたとき、各セルの見出しとして使う */
  $('#db tbody').innerHTML = shown.map((c, i) => `
    <tr data-i="${i}">
      <td data-label="日付">${c.date.replace(/-/g, '/')}<span class="muted">（${c.dow}）</span></td>
      <td data-label="魚種" class="sp">${c.species}</td>
      <td data-label="サイズ">${c.sizeRaw || '<span class="muted">—</span>'}</td>
      <td data-label="匹数">${c.countRaw || '<span class="muted">—</span>'}</td>
      <td data-label="潮回り"><span class="tag${c.tide === '大潮' ? ' oshio' : ''}">${c.tide}</span></td>
      <td data-label="釣り人">${c.fisher || '<span class="muted">—</span>'}</td>
      <td data-label="コメント" class="cm">${c.comment || '—'}</td>
      <td data-label="写真">${c.imgs.length
        ? `<span class="photo-link">📷 写真 ${c.imgs.length}枚</span>`
        : '<span class="muted">写真なし</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="8" class="empty">該当なし</td></tr>';
}

/* ---------- 再描画 ---------- */
function render() {
  const rows = filtered();
  renderKPI(rows);
  $('#chartArea').innerHTML = renderers[state.axis](rows);
  renderTable(rows);
}

/* ---------- イベント ---------- */
$('#axisSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#axisSeg button').forEach(x => x.classList.toggle('on', x === b));
  state.axis = b.dataset.axis; render();
});
/* 件数 / 総数（匹数）の切り替え。グラフの配色も連動して変わる。 */
$('#metricSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#metricSeg button').forEach(x => x.classList.toggle('on', x === b));
  state.metric = b.dataset.metric; render();
});
const bind = (sel, key) => $(sel).addEventListener('input', e => {
  state[key] = e.target.value; state.showAll = false; render();
});
bind('#fSpecies', 'species'); bind('#fTide', 'tide'); bind('#fFrom', 'from');
bind('#fTo', 'to'); bind('#q', 'q');
$('#btnMore').addEventListener('click', () => { state.showAll = !state.showAll; renderTable(filtered()); });
$('#btnReset').addEventListener('click', () => {
  Object.assign(state, { species: '', tide: '', from: '', to: '', metric: 'records', q: '', showAll: false });
  ['#fSpecies', '#fTide', '#fFrom', '#fTo', '#q'].forEach(s => $(s).value = '');
  $$('#metricSeg button').forEach(x => x.classList.toggle('on', x.dataset.metric === 'records'));
  render();
});
/* 行クリック → 写真ライトボックス
   ※ 以前使っていた choka.jp/hp/chokaprint.php は fg_print=0 のため
     「印刷許可がありません」となる。API が返す実画像URLを直接表示する。 */
let TABLE_ROWS = [];
const lb = $('#lightbox');

function openLightbox(c) {
  if (!c.imgs.length) { window.open(c.url, '_blank', 'noopener'); return; }
  $('#lbTitle').textContent = `${c.date.replace(/-/g, '/')}（${c.dow}）　${c.species}`;
  $('#lbMeta').innerHTML =
    [c.sizeRaw && `サイズ ${c.sizeRaw}`, c.countRaw, `潮回り ${c.tide}`, c.fisher]
      .filter(Boolean).map(x => `<span class="tag">${x}</span>`).join(' ');
  $('#lbImgs').innerHTML = c.imgs.map(im =>
    `<a href="${im.full}" target="_blank" rel="noopener">
       <img src="${im.full}" alt="${c.species}の釣果写真" loading="lazy">
     </a>`).join('');
  $('#lbComment').textContent = c.comment || '';
  $('#lbSrc').href = c.url;
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLightbox() { lb.hidden = true; document.body.style.overflow = ''; }

$('#db tbody').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-i]');
  if (tr) openLightbox(TABLE_ROWS[+tr.dataset.i]);
});
lb.addEventListener('click', e => { if (e.target === lb || e.target.closest('.lb-close')) closeLightbox(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) closeLightbox(); });
$$('#db thead th[data-k]').forEach(th => th.addEventListener('click', () => {
  const k = th.dataset.k;
  state.sortDir = state.sortK === k ? -state.sortDir : -1;
  state.sortK = k; renderTable(filtered());
}));

/* セレクトの選択肢を実データから生成 */
(function fillSelects() {
  const sp = [...new Set(CATCHES.map(c => c.species))]
    .sort((a, b) => CATCHES.filter(c => c.species === b).length - CATCHES.filter(c => c.species === a).length);
  $('#fSpecies').insertAdjacentHTML('beforeend',
    sp.map(s => `<option>${s}</option>`).join(''));
  const td = ['大潮', '中潮', '小潮', '長潮', '若潮'].filter(t => CATCHES.some(c => c.tide === t));
  $('#fTide').insertAdjacentHTML('beforeend', td.map(t => `<option>${t}</option>`).join(''));
})();

render();

/* ============================================================
   釣果予想エンジン
   ============================================================ */
/* 天気：まず予報API、範囲外なら過去同時期の実績から最頻天気を求める */
async function getWeather(y, m, d) {
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const daysAhead = Math.round((new Date(iso) - new Date(new Date().toDateString())) / 86400000);

  if (daysAhead >= 0 && daysAhead <= 15) {
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum` +
        `&timezone=Asia%2FTokyo&start_date=${iso}&end_date=${iso}`;
      const j = await (await fetch(u)).json();
      if (j.daily && j.daily.weather_code && j.daily.weather_code[0] != null) {
        return {
          source: '気象予報', forecast: true, code: j.daily.weather_code[0],
          tmax: j.daily.temperature_2m_max[0], tmin: j.daily.temperature_2m_min[0],
          wind: j.daily.wind_speed_10m_max[0], rain: j.daily.precipitation_sum[0],
        };
      }
    } catch (e) { /* 過去実績にフォールバック */ }
  }

  // 予報がない → 過去10年の同月日（±3日）で最も多かった天気
  try {
    const yrs = [];
    for (let i = 1; i <= 10; i++) yrs.push(y - i);
    const reqs = yrs.map(yy => {
      const s = new Date(Date.UTC(yy, m - 1, d - 3)), e = new Date(Date.UTC(yy, m - 1, d + 3));
      const f = dt => dt.toISOString().slice(0, 10);
      return `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max` +
        `&timezone=Asia%2FTokyo&start_date=${f(s)}&end_date=${f(e)}`;
    });
    const res = await Promise.all(reqs.map(u => fetch(u).then(r => r.json()).catch(() => null)));
    const codes = [], tmax = [], tmin = [], wind = [];
    res.forEach(j => {
      if (!j || !j.daily) return;
      j.daily.weather_code.forEach((c, i) => {
        if (c == null) return;
        codes.push(c); tmax.push(j.daily.temperature_2m_max[i]);
        tmin.push(j.daily.temperature_2m_min[i]); wind.push(j.daily.wind_speed_10m_max[i]);
      });
    });
    if (!codes.length) return { source: '取得できず', code: null };
    /* 天気コードを「快晴/晴れ/曇り/雨…」の呼称単位にまとめてシェアを出す */
    const freq = {};
    codes.forEach(c => { const n = wmo(c)[0]; (freq[n] || (freq[n] = { n: 0, code: c })).n++; });
    const dist = Object.entries(freq).map(([name, o]) => [name, o.n, o.code])
      .sort((a, b) => b[1] - a[1]);
    const top = dist[0];
    const avg = a => a.filter(x => x != null).reduce((s, x) => s + x, 0) / a.filter(x => x != null).length;
    return {
      source: `過去10年の同時期実績（${codes.length}日分）`, code: top[2],
      forecast: false,
      tmax: +avg(tmax).toFixed(1), tmin: +avg(tmin).toFixed(1), wind: +avg(wind).toFixed(1),
      share: Math.round(top[1] / codes.length * 100),
      dist: dist.map(([name, n]) => [name, n]), sample: codes.length,
    };
  } catch (e) { return { source: '取得できず', code: null }; }
}

/* 魚種スコアリング：月の一致 × 潮回りの一致 × 直近性 */
function scoreSpecies(y, m, d) {
  const tn = tideName(y, m, d);
  const season = seasonOf(m);
  const bySp = {};
  CATCHES.forEach(c => {
    const s = bySp[c.species] || (bySp[c.species] = {
      total: 0, month: 0, near: 0, season: 0, tide: 0, sizes: [], dates: [], tides: {}
    });
    s.total++;
    s.dates.push(c.date);
    s.tides[c.tide] = (s.tides[c.tide] || 0) + 1;
    if (c.m === m) s.month++;
    const dm = Math.min(Math.abs(c.m - m), 12 - Math.abs(c.m - m));
    if (dm <= 1) s.near++;
    if (c.season === season) s.season++;
    if (c.tide === tn) s.tide++;
    if (c.size) s.sizes.push(c.size);
  });

  const out = Object.entries(bySp).map(([sp, s]) => {
    // 時期の一致度が主、潮の一致が従、全体の実績量を薄く加算
    const monthScore = s.month * 3 + (s.near - s.month) * 1.5 + s.season * 0.6;
    const tideScore = s.tide * 1.2;
    const baseScore = Math.log1p(s.total) * 1.5;
    const raw = monthScore * 2 + tideScore + baseScore;
    return { sp, raw, ...s };
  }).filter(x => x.raw > 0).sort((a, b) => b.raw - a.raw);

  const max = out.length ? out[0].raw : 1;
  out.forEach(o => o.pct = Math.round(o.raw / max * 100));
  return { list: out.slice(0, 6), tideName: tn };
}

/* 天候によるコメント補正 */
function weatherAdvice(w) {
  if (w.code == null) return '天候データが取得できませんでした。現地の予報をご確認ください。';
  const [name] = wmo(w.code);
  if ([95, 96, 99, 82].includes(w.code)) return '雷雨・強雨の予報。イカダ／カセは中止・変更の可能性が高いため、必ず事前に問い合わせを。';
  if (w.wind >= 30) return `最大風速 ${w.wind}km/h の予報。風裏のイカダを選ぶか、日程変更も検討を。`;
  if ([61, 63, 65, 80, 81].includes(w.code)) return '雨予報。濁りが入ると魚の警戒心が緩み、日中でも喰いが立つことがあります。雨具と防寒を。';
  if (w.code === 0 || w.code === 1) return `${name}・凪の予報。日中は喰いが渋りやすいので、朝夕マズメに勝負を。`;
  return `${name}の予報。曇天は光量が落ちて一日を通して口を使いやすい、釣り人にとって好条件です。`;
}

/* ---------- 予想の描画 ---------- */
async function predict(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const out = $('#predictOut');
  out.innerHTML = '<div class="loading">天候データを取得しています…</div>';

  const w = await getWeather(y, m, d);
  const { list, tideName: tn } = scoreSpecies(y, m, d);
  const sun = sunTimes(y, m, d);
  const ev = tideEvents(y, m, d);
  const age = moonAge(y, m, d);
  const [wName, wIcon] = wmo(w.code);
  const dow = '日月火水木金土'[new Date(y, m - 1, d).getDay()];

  /* 狙い目の時間帯：マズメ ∩ 潮が動く時間 */
  const windows = [];
  const push = (from, to, label, why) => windows.push({ from, to, label, why });
  ev.forEach(e => {
    const s = Math.max(0, e.t - 1.5), en = Math.min(24, e.t + 1.5);
    const near = t => Math.abs(t - sun.sunrise) < 2 || Math.abs(t - sun.sunset) < 2;
    push(s, en, `${fmtH(s)}〜${fmtH(en)}`,
      `${e.type}（${fmtH(e.t)}）前後の潮が動く時間帯` + (near(e.t) ? ' ＋ マズメと重なる最高の時合' : ''));
  });
  if (sun.sunrise) push(sun.sunrise - .7, sun.sunrise + 1.5,
    `${fmtH(sun.sunrise - .7)}〜${fmtH(sun.sunrise + 1.5)}`, `朝マズメ（日の出 ${fmtH(sun.sunrise)}）`);
  if (sun.sunset) push(sun.sunset - 1.5, sun.sunset + .7,
    `${fmtH(sun.sunset - 1.5)}〜${fmtH(sun.sunset + .7)}`, `夕マズメ（日の入り ${fmtH(sun.sunset)}）`);
  windows.sort((a, b) => a.from - b.from);

  /* 潮位カーブ SVG */
  const W = 900, H = 130;
  const yAt = h => {
    const a = moonAge(y, m, d);
    const first = (a * 0.8 + HIGH_WATER_INTERVAL) % TIDE_CYCLE;
    return Math.cos((h - first) / TIDE_CYCLE * 2 * Math.PI);
  };
  const amp = { 大潮: 1, 中潮: .78, 小潮: .5, 長潮: .38, 若潮: .45 }[tn] || .7;
  let path = '';
  for (let h = 0; h <= 24; h += .25) {
    const px = h / 24 * W, py = 20 + (1 - yAt(h) * amp) / 2 * (H - 45);
    path += (h ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1);
  }
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24].map(h =>
    `<text x="${(h / 24 * W).toFixed(0)}" y="${H - 4}" text-anchor="middle">${h}時</text>`).join('');
  const marks = ev.map(e =>
    `<circle cx="${(e.t / 24 * W).toFixed(1)}" cy="${(20 + (1 - yAt(e.t) * amp) / 2 * (H - 45)).toFixed(1)}"
       r="4" fill="${e.type === '満潮' ? 'var(--sun)' : 'var(--aqua)'}"/>
     <text x="${(e.t / 24 * W).toFixed(1)}" y="${e.type === '満潮' ? 14 : H - 18}" text-anchor="middle"
       fill="${e.type === '満潮' ? 'var(--sun)' : 'var(--aqua)'}">${e.type} ${fmtH(e.t)}</text>`).join('');
  const sunBands = [sun.sunrise, sun.sunset].filter(Boolean).map(t =>
    `<rect class="win" x="${((t - 1) / 24 * W).toFixed(0)}" y="16" width="${(2 / 24 * W).toFixed(0)}"
       height="${H - 38}" rx="4"/>`).join('');

  out.innerHTML = `
    <div class="pred-grid">
      <div class="pcard">
        <h4>対象日</h4>
        <div class="big">${m}<span style="font-size:18px">月</span> ${d}<span style="font-size:18px">日</span>
          <span style="font-size:20px">（${dow}）</span></div>
        <ul><li>${seasonOf(m)}／月齢 ${age.toFixed(1)}</li><li>日の出 ${fmtH(sun.sunrise)}　日の入り ${fmtH(sun.sunset)}</li></ul>
      </div>
      <div class="pcard">
        <h4>潮回り ／ 確定情報</h4>
        <div class="big"><span class="em">${tn}</span></div>
        <ul>${ev.map(e => `<li>${e.type} ${fmtH(e.t)}</li>`).join('')}</ul>
      </div>
      <div class="pcard">
        <h4>天候（${w.source}）</h4>
        <div class="big">${wIcon} <span style="font-size:26px">${wName}</span></div>
        <ul>
          ${w.tmax != null ? `<li>気温 ${w.tmin}℃ 〜 ${w.tmax}℃</li>` : ''}
          ${w.wind != null ? `<li>最大風速 ${w.wind} km/h</li>` : ''}
          ${w.forecast ? '<li>気象予報にもとづく確定的な予報です</li>'
            : w.share ? `<li>過去実績でこの天候が ${w.share}%</li>` : ''}
        </ul>
      </div>
    </div>

    <div class="chart-card">
      <h3>潮回り ／ この日の確定情報</h3>
      <p class="sub">潮回りは暦から決まるため、シェアではなく確定値として表示します（月齢による推算）。</p>
      <div class="pred-fact">
        <span class="fact-pill">潮回り <b>${tn}</b></span>
        <span class="fact-pill">月齢 <b>${age.toFixed(1)}</b></span>
        ${ev.map(e => `<span class="fact-pill${e.type === '満潮' ? ' sun' : ''}">${e.type} <b>${fmtH(e.t)}</b></span>`).join('')}
        <span class="fact-pill sun">日の出 <b>${fmtH(sun.sunrise)}</b></span>
        <span class="fact-pill sun">日の入り <b>${fmtH(sun.sunset)}</b></span>
      </div>
    </div>

    <div class="chart-card">
      <h3>気象${w.forecast ? '予報' : 'の見込み'}</h3>
      <p class="sub">${w.forecast
        ? '対象日は気象予報の範囲内のため、シェアではなく予報をそのまま表示しています。'
        : `予報がまだ出ていない日付のため、過去10年の同時期${w.sample ? `（${w.sample}日分）` : ''}の実績から天候の出現割合を示しています。`}</p>
      ${w.forecast
        ? `<div class="pred-fact">
             <span class="fact-pill" style="font-size:22px">${wIcon} <b>${wName}</b></span>
             ${w.tmax != null ? `<span class="fact-pill">気温 <b>${w.tmin}〜${w.tmax}℃</b></span>` : ''}
             ${w.wind != null ? `<span class="fact-pill">最大風速 <b>${w.wind} km/h</b></span>` : ''}
             ${w.rain != null ? `<span class="fact-pill">降水量 <b>${w.rain} mm</b></span>` : ''}
           </div>`
        : (w.dist && w.dist.length
            ? donut(w.dist, { centerLabel: wIcon, centerSub: wName + ' が最多' })
            : '<div class="empty">天候データを取得できませんでした。</div>')}
    </div>

    <div class="chart-card">
      <h3>潮位カーブと狙い目の時間帯（推算）</h3>
      <p class="sub">黄色の帯はマズメ時。丸印は満潮・干潮。潮が動き始める「上げ3分〜7分」「下げ3分〜7分」が時合です。</p>
      <svg class="tide-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        ${sunBands}
        <line class="axis" x1="0" y1="${H - 20}" x2="${W}" y2="${H - 20}"/>
        <path class="curve" d="${path}" fill="none"/>
        ${marks}${hours}
      </svg>
    </div>

    <div class="chart-card">
      <h3>この日の狙い目タイムテーブル</h3>
      <p class="sub">潮の動きと日の出・日の入りから算出しています。</p>
      <div class="bars">
        ${windows.map(win => `
          <div class="bar-row" style="grid-template-columns:130px 1fr">
            <span class="lab">${win.label}</span>
            <span style="font-size:13px;color:#cfe4ee">${win.why}</span>
          </div>`).join('')}
      </div>
    </div>

    <div class="chart-card">
      <h3>期待できる魚種（シェア）</h3>
      <p class="sub">過去の釣果 ${CATCHES.length} 件のうち、${m}月前後（±1ヶ月）と ${tn} まわりの実績を
        重み付けして期待値を算出し、その構成比を示しています。</p>
      ${donut(list.map(o => [o.sp, o.raw]),
              { centerLabel: list[0] ? list[0].sp : '—', centerSub: '最有力' })}
    </div>

    <div class="chart-card">
      <h3>魚種ごとの詳細</h3>
      <p class="sub">狙う時間帯とタナは、熊野灘のイカダ／カセ釣りの一般的な目安です。</p>
      <div class="score-list">
        ${list.map((o, i) => {
          const b = baitFor(o.sp);
          const topTide = Object.entries(o.tides).sort((a, b2) => b2[1] - a[1])[0];
          const last = o.dates.slice().sort().pop();
          const sizes = o.sizes.length
            ? o.sizes.reduce((a, x) => (x.unit === 'kg' ? x.max * 100 : x.max) > (a.unit === 'kg' ? a.max * 100 : a.max) ? x : a)
            : null;
          return `<div class="score">
            <div class="score-head">
              <span class="rank">${i + 1}</span><span class="name">${o.sp}</span>
              <span class="pct">期待度 ${o.pct}%</span>
            </div>
            <div class="score-bar"><i style="width:${o.pct}%;animation-delay:${i * 70}ms"></i></div>
            <dl class="score-detail">
              <div><dt>狙う時間帯</dt><dd>${b.time}</dd></div>
              <div><dt>タナ（狙う層）</dt><dd>${b.depth}</dd></div>
              <div><dt>過去の実績</dt><dd>通算 ${o.total} 件／${m}月に ${o.month} 件<br>
                得意な潮：${topTide ? topTide[0] : '—'}／最大 ${sizes ? sizes.max + sizes.unit : '—'}<br>
                直近：${last ? last.replace(/-/g, '/') : '—'}</dd></div>
              <div style="grid-column:1/-1"><dt>ひとこと</dt><dd>${b.note}</dd></div>
            </dl>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="notice">
      <b>天候アドバイス：</b>${weatherAdvice(w)}<br>
      <b>ご注意：</b>潮回り・満干時刻・日出没は本ツールの簡易推算です（潮名は実データと85%一致）。
      予約・出船可否は必ず<a href="https://zekkouchou.com/shirotosen/" target="_blank" rel="noopener">城渡船 公式サイト</a>でご確認ください。
    </div>`;
}

(function initPredict() {
  const t = new Date();
  const iso = d => d.toISOString().slice(0, 10);
  const inp = $('#pDate');
  inp.value = iso(t);
  inp.min = iso(new Date(t.getTime() - 365 * 86400000));
  inp.max = iso(new Date(t.getTime() + 92 * 86400000));
  $('#btnPredict').addEventListener('click', () => predict(inp.value));
  predict(inp.value);
})();
