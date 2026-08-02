/* ===== 城渡船 釣果アナライザ : 共通ロジック ===== */

/* --- 月齢・潮名（推算） ---------------------------------------------
   実データ 97件の「潮名」と照合してオフセットを較正済み（一致率 85%）。
   あくまで簡易推算であり、正式な潮汐表ではありません。            */
const SYNODIC = 29.530588853;
const MOON_REF = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
const MOON_OFFSET = 0.9; // 実データで較正

const TIDE_TABLE = ['大潮','大潮','大潮','中潮','中潮','中潮','小潮','小潮','小潮','長潮',
                    '若潮','中潮','中潮','中潮','大潮','大潮','大潮','大潮','中潮','中潮',
                    '中潮','小潮','小潮','小潮','長潮','若潮','中潮','中潮','中潮','大潮'];

function moonAge(y, m, d) {
  const t = Date.UTC(y, m - 1, d, 3, 0) / 86400000;
  let a = (t - MOON_REF + MOON_OFFSET) % SYNODIC;
  if (a < 0) a += SYNODIC;
  return a;
}
function tideName(y, m, d) {
  return TIDE_TABLE[Math.min(30, Math.floor(moonAge(y, m, d)) + 1) - 1];
}

/* 満干時刻の推算。熊野灘の高潮間隔（約5.3h）＋月齢×0.8h の古典近似。 */
const HIGH_WATER_INTERVAL = 5.3;
const TIDE_CYCLE = 12.4206; // 半日周期(h)

function tideEvents(y, m, d) {
  const age = moonAge(y, m, d);
  let first = (age * 0.8 + HIGH_WATER_INTERVAL) % TIDE_CYCLE;
  const ev = [];
  for (let t = first - TIDE_CYCLE; t < 25; t += TIDE_CYCLE) {
    if (t >= -TIDE_CYCLE / 2) ev.push({ t, type: '満潮' });
    const lo = t + TIDE_CYCLE / 2;
    if (lo >= -TIDE_CYCLE / 2) ev.push({ t: lo, type: '干潮' });
  }
  return ev.filter(e => e.t >= 0 && e.t < 24).sort((a, b) => a.t - b.t);
}

/* 任意時刻の「上げ7分」「下げ3分」表記を返す */
function tidePhaseAt(y, m, d, hour) {
  const all = [];
  const age = moonAge(y, m, d);
  let first = (age * 0.8 + HIGH_WATER_INTERVAL) % TIDE_CYCLE;
  for (let t = first - 2 * TIDE_CYCLE; t < 36; t += TIDE_CYCLE) {
    all.push({ t, type: '満潮' });
    all.push({ t: t + TIDE_CYCLE / 2, type: '干潮' });
  }
  all.sort((a, b) => a.t - b.t);
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i], b = all[i + 1];
    if (hour >= a.t && hour < b.t) {
      const frac = (hour - a.t) / (b.t - a.t);
      const bu = Math.min(10, Math.max(1, Math.ceil(frac * 10)));
      // 干潮 → 満潮 なら上げ潮
      return (a.type === '干潮' ? '上げ' : '下げ') + bu + '分';
    }
  }
  return '不明';
}

const TIDE_PHASES = ['上げ1分','上げ2分','上げ3分','上げ4分','上げ5分','上げ6分','上げ7分','上げ8分','上げ9分','上げ10分',
                     '下げ1分','下げ2分','下げ3分','下げ4分','下げ5分','下げ6分','下げ7分','下げ8分','下げ9分','下げ10分'];

/* --- 日の出・日の入り（NOAA簡易式） ------------------------------ */
const LAT = 34.05, LON = 136.25; // 三重県尾鷲市 三木浦漁港

function sunTimes(y, m, d) {
  const N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const lngHour = LON / 15;
  const calc = (rising) => {
    const t = N + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * Math.PI / 180) + 0.020 * Math.sin(2 * M * Math.PI / 180) + 282.634;
    L = (L + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * Math.PI / 180)) * 180 / Math.PI;
    RA = (RA + 360) % 360;
    RA += (Math.floor(L / 90) * 90) - (Math.floor(RA / 90) * 90);
    RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * Math.PI / 180);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * Math.PI / 180) - sinDec * Math.sin(LAT * Math.PI / 180)) /
                 (cosDec * Math.cos(LAT * Math.PI / 180));
    if (cosH > 1 || cosH < -1) return null;
    let H = Math.acos(cosH) * 180 / Math.PI;
    H = rising ? (360 - H) : H;
    H /= 15;
    let T = H + RA - 0.06571 * t - 6.622;
    let UT = ((T - lngHour) % 24 + 24) % 24;
    return (UT + 9) % 24; // JST
  };
  return { sunrise: calc(true), sunset: calc(false) };
}

/* --- レコード整形 --------------------------------------------------- */
function parseSize(s) {
  if (!s) return null;
  const cm = s.match(/([\d.]+)\s*(?:-\s*([\d.]+)\s*)?cm/);
  if (cm) return { unit: 'cm', min: +cm[1], max: cm[2] ? +cm[2] : +cm[1] };
  const kg = s.match(/([\d.]+)\s*(?:-\s*([\d.]+)\s*)?kg/);
  if (kg) return { unit: 'kg', min: +kg[1], max: kg[2] ? +kg[2] : +kg[1] };
  return null;
}
function parseCount(s) {
  if (!s) return null;
  const r = s.match(/([\d.]+)\s*-\s*([\d.]+)\s*匹/);
  if (r) return Math.round((+r[1] + +r[2]) / 2);
  const n = s.match(/([\d.]+)\s*匹/);
  return n ? +n[1] : null;
}
/* コメント中に時刻表現があれば拾う（元データには時刻欄が無いため補助的） */
const TIME_WORDS = [
  [/朝マ[ズず]メ|朝一|夜明け/, 5], [/午前中?/, 9], [/昼|正午/, 12],
  [/午後/, 15], [/夕マ[ズず]メ|夕方/, 17], [/夜|ナイト/, 20],
];
function parseHour(comment) {
  if (!comment) return null;
  const hm = comment.match(/(\d{1,2})\s*時/);
  if (hm && +hm[1] <= 24) return +hm[1];
  for (const [re, h] of TIME_WORDS) if (re.test(comment)) return h;
  return null;
}

const SEASONS = { 春: [3,4,5], 夏: [6,7,8], 秋: [9,10,11], 冬: [12,1,2] };
function seasonOf(m) {
  for (const k in SEASONS) if (SEASONS[k].includes(m)) return k;
}

/* コメント中の HTML（<br> やエンティティ）を素のテキストに戻す */
function decodeText(s) {
  if (!s) return '';
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/* 各釣果レコードを1魚種=1行に展開したフラットな観測テーブル */
function buildCatches(records) {
  const out = [];
  records.forEach(r => {
    const tide = r.choji || tideName(r.y, r.m, r.d);
    const comment = decodeText(r.comment);
    const hour = parseHour(comment);
    const imgs = r.imgs || [];
    r.fish.forEach(f => {
      const sz = parseSize(f.size);
      out.push({
        no: r.no, date: r.date, y: r.y, m: r.m, d: r.d, dow: r.dow,
        species: f.name, sizeRaw: f.size, countRaw: f.count,
        size: sz, count: parseCount(f.count),
        tide, season: seasonOf(r.m), moonAge: moonAge(r.y, r.m, r.d),
        hour, phase: hour == null ? null : tidePhaseAt(r.y, r.m, r.d, hour),
        comment, weather: r.weather, ship: r.ship, wt: r.wt,
        fisher: decodeText(r.fisher),
        imgs,
        /* 写真: 釣果画像があればその原寸URL。無ければ元サイトの釣果一覧へ。
           ※ chokaprint.php は「印刷許可がありません」となるため使わない。 */
        photo: imgs.length ? imgs[0].full : null,
        url: 'https://zekkouchou.com/shirotosen/catch.php',
      });
    });
  });
  return out;
}

/* 10cm 刻みのサイズ帯（cm記録のみ。kg記録は別枠） */
function sizeBucket(c) {
  if (!c.size) return null;
  if (c.size.unit === 'kg') return null;
  const b = Math.floor(c.size.max / 10) * 10;
  return b + '〜' + (b + 9) + 'cm';
}
function sizeBucketOrder(a, b) { return parseInt(a) - parseInt(b); }

/* --- エサ・釣り方の知識テーブル ------------------------------------
   ※ 元サイトの釣果データにエサ情報は含まれないため、
     三重・熊野灘のイカダ／カセ釣りの一般的な定석を収録したもの。 */
const BAIT = {
  /* --- 城渡船の主力魚種（釣果件数の多い順） --- */
  マダイ:     { bait: ['ダンゴ（紀州釣り）', 'オキアミ', '活きエビ', 'サナギ・コーン'], time: '朝マズメ / 上げ7分〜満潮', depth: '中層〜底', note: 'この筏の大本命。70cm超（ナナマル）も再三出ています。底付近の変化を丁寧に。' },
  グレ:       { bait: ['オキアミ', '生ミック', '練り餌', 'コマセ（アミエビ）'], time: '朝マズメ / 潮が動く時間', depth: '中層', note: 'メジナ。冬〜春に良型。魚を浮かせて浅いタナで掛ける。' },
  ヘダイ:     { bait: ['オキアミ', 'ダンゴ', '練り餌'], time: '日中通し', depth: '底〜中層', note: 'マダイ狙いの外道として頻出。引きは強い。' },
  アオリイカ: { bait: ['活きアジ（ヤエン）', 'エギ 3.0〜3.5号'], time: '朝マズメ・夕マズメ', depth: '底〜ボトム上2m', note: '春は親イカで大型、秋は数釣り。' },
  チダイ:     { bait: ['オキアミ', 'ダンゴ', 'アミエビ'], time: '朝マズメ', depth: '中層〜底', note: 'マダイより小ぶりだが数が出る。' },
  チヌ:       { bait: ['ダンゴ（紀州釣り）', 'サナギ', 'コーン', 'カニ・イガイ'], time: '上げ潮 / 朝夕マズメ', depth: '底', note: '黒鯛。警戒心が強く、静かに底を探るのが基本。' },
  シマアジ:   { bait: ['オキアミ', 'アミエビ（コマセ）', 'サビキ'], time: '朝マズメ', depth: '中層', note: '高級魚。回遊してきたら手返し勝負。' },
  カワハギ:   { bait: ['アサリ', 'オキアミ', '虫エサ'], time: '日中', depth: '底', note: '小さなアタリを取る繊細な釣り。小さめのハリで掛ける。' },
  イトヨリ:   { bait: ['オキアミ', '虫エサ'], time: '日中', depth: '底', note: '砂地まわりで。上品な白身。' },
  ワラサ:     { bait: ['活きアジ（飲ませ）', 'メタルジグ', 'カゴ＋オキアミ'], time: '朝マズメ', depth: '中層', note: 'ブリの中型。大潮の走る潮が狙い目。' },
  カツオ:     { bait: ['活き餌', 'メタルジグ', 'ナブラ撃ち'], time: '日中の回遊次第', depth: '表層', note: '鳥山・ナブラを見つけたら即キャスト。' },
  イシガキ:   { bait: ['オキアミ', 'カニ', 'ウニ'], time: '日中', depth: '底の根まわり', note: 'イシガキダイ。硬い口にしっかり合わせを。' },
  イシダイ:   { bait: ['ウニ', 'カニ', 'サザエ'], time: '日中', depth: '底の根まわり', note: '磯の王者。太仕掛けで挑む。' },
  アイゴ:     { bait: ['オキアミ', '練り餌', '海藻'], time: '日中', depth: '中層', note: 'ヒレに毒棘。取り扱い注意。' },
  ツバス:     { bait: ['活きアジ', 'メタルジグ', 'サビキ'], time: '朝マズメ', depth: '中層〜表層', note: 'ブリの幼魚。群れで回遊。' },
  シオ:       { bait: ['活きアジ', 'メタルジグ'], time: '朝マズメ', depth: '中層', note: 'カンパチの若魚。夏〜秋。' },
  イサキ:     { bait: ['オキアミ', 'アミエビ（コマセ）', 'サビキ'], time: '夕マズメ〜夜', depth: '中層', note: '群れを足止めできれば数が伸びる。' },
  クロダイ:   { bait: ['ダンゴ', 'サナギ', 'カニ'], time: '上げ潮', depth: '底', note: 'チヌの別名。' },
  アジ:       { bait: ['サビキ＋アミエビ', 'アジング'], time: '夕マズメ〜夜', depth: '中層', note: '小型回遊魚。夜の常夜灯まわりが狙い目。' },
  イガミ:     { bait: ['海藻（ハバノリ）', 'オキアミ'], time: '日中', depth: '底〜中層', note: 'ブダイの地方名。冬が本番。' },
  ブダイ:     { bait: ['海藻（ハバノリ）', 'オキアミ'], time: '日中', depth: '底〜中層', note: '冬場が旬。磯まわりを狙う。' },
  コロダイ:   { bait: ['オキアミ', '虫エサ', 'カニ'], time: '朝夕マズメ・夜', depth: '底', note: '強烈な引き。夜釣りで実績。' },
  フエフキ:   { bait: ['オキアミ', 'カニ', '虫エサ'], time: '日中', depth: '底', note: '走る魚。ドラグ調整を忘れずに。' },
  クエ:       { bait: ['活きアジ', 'イカ', '大型の活き餌'], time: '夜〜朝マズメ', depth: '底の根' , note: '幻の高級魚。根に潜られたら終わり。' },
  キジハタ:   { bait: ['活きエビ', 'ワーム', '活きアジ'], time: '朝夕マズメ', depth: '底の根まわり', note: 'アコウ。夏が本番。' },
  アコウ:     { bait: ['活きエビ', '活きアジ', 'ワーム'], time: '朝マズメ・夕マズメ', depth: '底の根まわり', note: 'キジハタの別名。夏が本番。' },
  アカハタ:   { bait: ['活きエビ', 'ワーム', '虫エサ'], time: '日中', depth: '底の根', note: '根魚。手早く浮かせる。' },
  ヒラメ:     { bait: ['活きアジ（泳がせ）', 'イワシ', 'メタルジグ'], time: '朝マズメ / 潮変わり', depth: '底べったり', note: '無理に動かさず、じっくり待つのが基本。' },
  ブリ:       { bait: ['活きアジ（飲ませ）', 'メタルジグ'], time: '朝マズメ', depth: '中層', note: '潮が走る大潮・中潮が狙い目。' },
  カサゴ:     { bait: ['活きエビ', '虫エサ', 'ワーム'], time: '日中・夜', depth: '底の根', note: '根まわりを丁寧に探る。' },
  タチウオ:   { bait: ['キビナゴ', 'ドジョウ', 'テンヤ＋ワインド'], time: '夕マズメ〜日没後2時間', depth: '底〜中層', note: '潮が動く時間帯に高活性。' },
  /* --- その他の魚種 --- */
  イカ:       { bait: ['活きアジ（泳がせ）', 'エギ 3.0〜3.5号', 'ヤエン'], time: '朝マズメ・夕マズメ', depth: '底付近', note: '潮止まり前後より、緩く動く潮が◎。' },
  コウイカ:   { bait: ['エギ（底狙い）', 'スッテ'], time: '夕マズメ〜夜', depth: '底べったり', note: 'アオリより底を這わせる。' },
  タイ:       { bait: ['オキアミ', 'ダンゴ', '活きエビ'], time: '朝マズメ / 上げ潮', depth: '中層〜底', note: 'カセからの底狙いが本命。' },
  メイチダイ: { bait: ['オキアミ', '虫エサ', 'カニ'], time: '日中', depth: '底', note: '底物狙いの嬉しい外道。味は上々。' },
  ハマフエフキ:{ bait: ['カニ', '虫エサ', 'オキアミ'], time: '朝夕マズメ', depth: '底', note: 'タマン。強烈な突っ込みに備える。' },
  コブダイ:   { bait: ['カニ', 'エビ', '貝'], time: '日中', depth: '底の根', note: '怪力。太仕掛け必須。' },
  ヤズ:       { bait: ['活きアジ', 'メタルジグ', 'サビキ'], time: '朝マズメ', depth: '中層', note: 'ブリの若魚。群れで回遊。' },
  ネリゴ:     { bait: ['活きアジ', 'メタルジグ', 'ジグサビキ'], time: '朝マズメ', depth: '中層〜表層', note: 'カンパチの若魚。夏〜秋の回遊。' },
  サバ:       { bait: ['サビキ', 'オキアミ', 'メタルジグ'], time: '朝マズメ', depth: '表層〜中層', note: '回遊すると入れ食いに。' },
  ゴマサバ:   { bait: ['サビキ', 'オキアミ'], time: '朝マズメ', depth: '表層〜中層', note: '群れで回遊。鮮度落ちが早い。' },
  ソウダ:     { bait: ['メタルジグ', 'サビキ'], time: '日中', depth: '表層', note: 'ソウダガツオ。青物の前触れのことも。' },
  タコ:       { bait: ['タコエギ', 'タコジグ', '豚バラ'], time: '日中・干潮前後', depth: '底を這わせる', note: '根まわりをネチネチ探る。' },
  クロ:       { bait: ['オキアミ', '練り餌', 'ダンゴ'], time: '朝マズメ / 上げ潮', depth: '中層', note: 'グレ（メジナ）の別名。冬〜春が良型。' },
  ニザダイ:   { bait: ['オキアミ', '海藻'], time: '日中', depth: '中層', note: 'サンノジ。グレ釣りの定番外道。' },
  ウマヅラ:   { bait: ['アサリ', 'オキアミ'], time: '日中', depth: '中層〜底', note: 'ウマヅラハギ。アタリが小さく難しい。' },
  ウスバハギ: { bait: ['アサリ', 'オキアミ'], time: '日中', depth: '中層', note: '大型のハギ。肝が美味。' },
  イラ:       { bait: ['オキアミ', '活きエビ'], time: '日中', depth: '底', note: '外道扱いだが引きは強烈。' },
  ボラ:       { bait: ['オキアミ', '練り餌'], time: '日中', depth: '表層〜中層', note: '表層〜中層でよく掛かる。' },
  ハモ:       { bait: ['活き餌', '虫エサ'], time: '夜', depth: '底', note: '歯が鋭い。ハリ外しは慎重に。' },
  ヒラスズキ: { bait: ['活きアジ', 'ミノー', '虫エサ'], time: '朝マズメ・荒れた後', depth: '中層', note: 'サラシまわりが狙い目。' },
};
const DEFAULT_BAIT = { bait: ['オキアミ', '活きアジ'], time: '朝マズメ・夕マズメ', depth: '中層', note: '基本の餌で様子を見る。' };
function baitFor(sp) { return BAIT[sp] || DEFAULT_BAIT; }

/* --- 天気コード（Open-Meteo WMO） ---------------------------------- */
const WMO = {
  0:['快晴','☀️'], 1:['晴れ','🌤️'], 2:['薄曇り','⛅'], 3:['曇り','☁️'],
  45:['霧','🌫️'], 48:['霧','🌫️'], 51:['霧雨','🌦️'], 53:['霧雨','🌦️'], 55:['霧雨','🌦️'],
  61:['小雨','🌧️'], 63:['雨','🌧️'], 65:['大雨','🌧️'], 66:['凍雨','🌧️'], 67:['凍雨','🌧️'],
  71:['小雪','🌨️'], 73:['雪','🌨️'], 75:['大雪','🌨️'], 77:['霧雪','🌨️'],
  80:['にわか雨','🌦️'], 81:['にわか雨','🌦️'], 82:['激しい雨','⛈️'],
  85:['にわか雪','🌨️'], 86:['にわか雪','🌨️'], 95:['雷雨','⛈️'], 96:['雷雨','⛈️'], 99:['雷雨','⛈️'],
};
function wmo(c) { return WMO[c] || ['不明', '❓']; }

/* --- 天気の判定（降水量＋雲量から） --------------------------------
   Open-Meteo の過去データ（ERA5再解析）の weather_code は、実際は晴れの日を
   「霧雨(51/53/55)」と誤分類する既知のクセがある（日照14時間・降水0.1mmでも霧雨扱い）。
   そこで weather_code は使わず、実測の日降水量(mm)と平均雲量(%)から判定する。
   1年365日で検証したところ、旧: 快晴2日/霧雨104日 → 新: 快晴80日/晴れ73日 と
   尾鷲（多雨地）として自然な分布になった。しきい値は気象庁の「雨天日=日降水量1mm以上」に準拠。 */
function classifyWeather(precipMm, cloudPct) {
  const p = precipMm == null ? 0 : precipMm;
  const c = cloudPct == null ? 50 : cloudPct;
  if (p >= 20) return ['大雨', '⛈️'];
  if (p >= 5)  return ['雨', '🌧️'];
  if (p >= 1)  return ['小雨', '🌦️'];
  // 実質的に雨の降らない日は、空の状態（雲量）で分類する
  if (c <= 30) return ['快晴', '☀️'];
  if (c <= 60) return ['晴れ', '🌤️'];
  if (c <= 85) return ['薄曇り', '⛅'];
  return ['曇り', '☁️'];
}
/* 天候名 → アイコン（classifyWeather が返す呼称に対応） */
const WEATHER_ICON = { 大雨: '⛈️', 雨: '🌧️', 小雨: '🌦️', 快晴: '☀️', 晴れ: '🌤️', 薄曇り: '⛅', 曇り: '☁️' };
function weatherIcon(name) { return WEATHER_ICON[name] || '❓'; }
