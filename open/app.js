/* ===========================================================
   造字局 · 汉字炼金术   ——  引擎层
   依赖 data.js：
     FIELDS / COMPONENTS / PALETTE / DECOMP / REAL
     RELATIONS / STARS / PALACES / FLY_ORDER / MOUNTAINS
     SHENG / KE / WUXING / YUN_START / NAMING_PRESETS
   =========================================================== */
(function () {
  'use strict';

  const STORE_DICT = 'ziforge.dict.v3';
  const STORE_PREF = 'ziforge.pref.v2';
  const STORE_DISC = 'ziforge.disc.v2';
  const DICT_CAP = 120;

  const RANKS = { 1: '凡品', 2: '上品', 3: '珍品', 4: '孤品', 5: '天授' };
  const STRUCT_NAME = { lr: '左右结构', ud: '上下结构' };

  /* 形窄的偏旁，占位要收一点，才像真正的偏旁 */
  const NARROW = new Set(['氵', '冫', '亻', '忄', '扌', '讠', '纟', '钅', '阝', '彳', '衤']);

  /* ---------- 伪随机：同一个部件对，永远炼出同一个字 ---------- */
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 读音 ---------- */
  const SYLLABLES = (
    'a ai an ang ao e ei en eng er o ou ' +
    'ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu ' +
    'pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pu ' +
    'ma mai man mang mao mei men meng mi mian miao mie min ming miu mo mou mu ' +
    'fa fan fang fei fen feng fo fu ' +
    'da dai dan dang dao de deng di dian diao die ding dong dou du duan dui dun duo ' +
    'ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo ' +
    'na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nu nuo nü nüe ' +
    'la lai lan lang lao le lei leng li lian liang liao lie lin ling liu long lou lu luan lun luo lü lüe ' +
    'ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ' +
    'ka kai kan kang kao ke ken keng kong kou ku kua kuai kuan kuang kui kun kuo ' +
    'ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ' +
    'ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun ' +
    'qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun ' +
    'xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun ' +
    'zha zhai zhan zhang zhao zhe zhen zheng zhi zhong zhou zhu zhuan zhuang zhui zhun zhuo ' +
    'cha chai chan chang chao che chen cheng chi chong chou chu chuan chuang chui chun chuo ' +
    'sha shai shan shang shao she shen sheng shi shou shu shua shuai shuan shuang shui shun shuo ' +
    'ran rang rao re ren reng ri rong rou ru ruan rui run ruo ' +
    'za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo ' +
    'ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo ' +
    'sa sai san sang sao se sen seng si song sou su suan sui sun suo ' +
    'ya yan yang yao ye yi yin ying yong you yu yuan yue yun ' +
    'wa wai wan wang wei wen weng wo wu'
  ).trim().split(/\s+/);

  const TONE_VOWEL = {
    a: ['ā', 'á', 'ǎ', 'à'], o: ['ō', 'ó', 'ǒ', 'ò'], e: ['ē', 'é', 'ě', 'è'],
    i: ['ī', 'í', 'ǐ', 'ì'], u: ['ū', 'ú', 'ǔ', 'ù'], 'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ']
  };

  function toneIndex(s) {
    for (const v of ['a', 'o', 'e']) {
      const i = s.indexOf(v);
      if (i >= 0) return i;
    }
    if (s.indexOf('iu') >= 0) return s.indexOf('u', s.indexOf('i'));
    if (s.indexOf('ui') >= 0) return s.indexOf('i', s.indexOf('u'));
    for (let i = s.length - 1; i >= 0; i--) {
      if ('iuü'.indexOf(s[i]) >= 0) return i;
    }
    return -1;
  }

  function toneMark(syl, tone) {
    const i = toneIndex(syl);
    if (i < 0 || !TONE_VOWEL[syl[i]]) return syl;
    return syl.slice(0, i) + TONE_VOWEL[syl[i]][tone - 1] + syl.slice(i + 1);
  }

  /* ---------- 五行关系：字义的推导骨架 ---------- */
  function relationOf(c1, c2, sameGlyph) {
    if (sameGlyph) return 'die';
    if (c1.sem === c2.sem) return 'tongbu';
    const w1 = (FIELDS[c1.sem] || FIELDS.misc).wuxing;
    const w2 = (FIELDS[c2.sem] || FIELDS.misc).wuxing;
    if (w1 === w2) return 'tongqi';
    if (SHENG[w1] === w2) return 'sheng';
    if (SHENG[w2] === w1) return 'beisheng';
    if (KE[w1] === w2) return 'ke';
    return 'beike';
  }

  function fillTpl(tpl, ctx) {
    return tpl.replace(/\{(\w+)\}/g, function (m, k) {
      return ctx[k] === undefined ? m : ctx[k];
    });
  }

  /* ---------- 玄空：九星 / 飞星盘 / 元运 / 二十四山 ---------- */
  function flyPan(center) {
    /* 顺飞：中宫置入中星，依 中→乾→兑→艮→离→坎→坤→震→巽 九数循环 */
    const pan = {};
    PALACES.forEach(function (p) {
      const step = FLY_ORDER.indexOf(p.name);
      pan[p.name] = ((center - 1 + (step < 0 ? 0 : step)) % 9) + 1;
    });
    return pan;
  }

  /* 由「谁成事」定星的五行，再由五行取星 */
  function starFor(c1, c2, relKey, rng) {
    const w1 = (FIELDS[c1.sem] || FIELDS.misc).wuxing;
    const w2 = (FIELDS[c2.sem] || FIELDS.misc).wuxing;
    let wx;
    if (relKey === 'sheng') wx = w2;        /* 被养的一方成 */
    else if (relKey === 'beisheng') wx = w1;
    else if (relKey === 'ke') wx = w1;      /* 克者胜 */
    else if (relKey === 'beike') wx = w2;
    else wx = w1;                           /* 同气 / 同部 / 叠体 */
    const pool = [];
    for (let n = 1; n <= 9; n++) if (STARS[n].wx === wx) pool.push(n);
    return pool[Math.floor(rng() * pool.length)];
  }

  function currentYun(date) {
    const y = (date || new Date()).getFullYear();
    const k = Math.floor((y - YUN_START) / 20);
    return (((k % 9) + 9) % 9) + 1;
  }

  function yunStatus(star, yun) {
    if (star === yun) return { key: 'wang', text: '当运', tone: 'gold' };
    if (star === (yun === 1 ? 9 : yun - 1)) return { key: 'tui', text: '退运', tone: 'accent' };
    if (star === (yun === 9 ? 1 : yun + 1)) return { key: 'shengqi', text: '生气', tone: 'jade' };
    return { key: 'ping', text: '平运', tone: 'ink' };
  }

  function mountainsFor(id) {
    const i = hash(id + '#shan') % 24;
    return { sit: MOUNTAINS[i], face: MOUNTAINS[(i + 12) % 24] };
  }

  /* ---------- 解字：日期、干支、节气、卦 ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function jdnOf(y, m, d) {
    const a = Math.floor((14 - m) / 12);
    const yy = y + 4800 - a;
    const mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
      Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }

  function mod(a, n) { return ((a % n) + n) % n; }

  function dayGanzhi(jd) {
    return { g: mod(jd + 9, 10), z: mod(jd + 1, 12) };
  }

  function yearGanzhi(year) {
    const n = mod(year - 4, 60);
    return { g: n % 10, z: n % 12 };
  }

  /* 五虎遁：甲己之年丙作首，乙庚之岁戊为头…… */
  function monthGanzhi(yearG, monthZhiIdx) {
    const start = (yearG % 5) * 2 + 2;
    return { g: mod(start + mod(monthZhiIdx - 2, 12), 10), z: monthZhiIdx };
  }

  function gzIndex(g, z) {
    return mod(6 * g - 5 * z, 60);
  }

  function nayinOf(g, z) {
    return NAYIN[Math.floor(gzIndex(g, z) / 2)] || '';
  }

  /* 最近的「节」（带月建的那 12 个） */
  function jieAt(y, m, d) {
    const jd = jdnOf(y, m, d);
    let cur = null;
    [y - 1, y, y + 1].forEach(function (yy) {
      JIEQI.forEach(function (q) {
        if (!q.jian) return;
        const jq = { name: q.name, jian: q.jian, jd: jdnOf(yy, q.m, q.d) };
        if (jq.jd <= jd && (!cur || jq.jd > cur.jd)) cur = jq;
      });
    });
    return cur || { name: '大雪', jian: '子', jd: jd };
  }

  /* 当前所在节气与下一个节气 */
  function qiAt(y, m, d) {
    const jd = jdnOf(y, m, d);
    let cur = null;
    let next = null;
    [y - 1, y, y + 1].forEach(function (yy) {
      JIEQI.forEach(function (q) {
        const q2 = { name: q.name, jd: jdnOf(yy, q.m, q.d) };
        if (q2.jd <= jd) { if (!cur || q2.jd > cur.jd) cur = q2; }
        else if (!next || q2.jd < next.jd) next = q2;
      });
    });
    return { cur: cur, next: next };
  }

  function dateProfile(y, m, d) {
    const jd = jdnOf(y, m, d);
    const day = dayGanzhi(jd);
    const yr = yearGanzhi(y);
    const jie = jieAt(y, m, d);
    const mz = Math.max(0, ZHI.indexOf(jie.jian));
    const mg = monthGanzhi(yr.g, mz);
    const qi = qiAt(y, m, d);
    return {
      y: y, m: m, d: d, jd: jd,
      yearG: yr.g, yearZ: yr.z,
      monthG: mg.g, monthZ: mz,
      dayG: day.g, dayZ: day.z,
      yearGZ: GAN[yr.g] + ZHI[yr.z],
      monthGZ: GAN[mg.g] + ZHI[mz],
      dayGZ: GAN[day.g] + ZHI[day.z],
      yearNayin: nayinOf(yr.g, yr.z),
      dayNayin: nayinOf(day.g, day.z),
      jian: jie.jian,
      jieName: jie.name,
      jieDays: jd - jie.jd,
      qiName: qi.cur ? qi.cur.name : '',
      qiDays: qi.cur ? jd - qi.cur.jd : 0,
      nextQi: qi.next ? qi.next.name : '',
      nextQiDays: qi.next ? qi.next.jd - jd : 0,
      shixiao: SHIXIAO[jie.jian] || ''
    };
  }

  /* 以年月日干支与字的笔画取数起卦 */
  function guaOf(dp, strokes) {
    const yN = dp.yearZ + 1;
    const mN = dp.monthZ + 1;
    const dN = dp.dayZ + 1;
    const sN = strokes || 1;
    const up = mod(yN + mN + dN, 8) || 8;
    const down = mod(yN + mN + dN + sN, 8) || 8;
    const move = mod(yN + mN + dN + sN, 6) || 6;
    const upName = BAGUA_ORDER[up - 1];
    const downName = BAGUA_ORDER[down - 1];
    return {
      up: upName, down: downName, move: move,
      name: GUA64[upName][down - 1],
      upXiang: BAGUA_XIANG[upName], downXiang: BAGUA_XIANG[downName],
      upDe: BAGUA_DE[upName], downDe: BAGUA_DE[downName]
    };
  }

  function wxRel(dayWx, charWx) {
    if (dayWx === charWx) return 'tongqi';
    if (SHENG[dayWx] === charWx) return 'sheng';
    if (SHENG[charWx] === dayWx) return 'beisheng';
    if (KE[dayWx] === charWx) return 'ke';
    return 'beike';
  }

  /* ---------- 字的档案 ---------- */
  function profileFromChar(ch) {
    const parts = partsOf(ch);
    const comps = parts.map(compOf);
    const count = {};
    comps.forEach(function (c) {
      const w = (FIELDS[c.sem] || FIELDS.misc).wuxing;
      count[w] = (count[w] || 0) + 1;
    });
    let wx = '土';
    let best = 0;
    Object.keys(count).forEach(function (w) {
      if (count[w] > best) { best = count[w]; wx = w; }
    });
    const strokes = comps.reduce(function (s, c) { return s + (c.s || 4); }, 0);
    const sem = (FIELDS[comps[0].sem] || FIELDS.misc);
    return {
      label: ch,
      glyph: ch,
      parts: parts,
      names: comps.map(function (c) { return c.n; }),
      semNote: '主' + sem.label,
      feel: sem.feel,
      wx: wx,
      strokes: strokes,
      star: '',
      rank: '',
      forged: false
    };
  }

  function profileFromEntry(entry) {
    return {
      label: entry.first + entry.second,
      glyph: '',
      parts: [entry.first, entry.second],
      names: [compOf(entry.first).n, compOf(entry.second).n],
      semNote: entry.relName,
      feel: (FIELDS[compOf(entry.second).sem] || FIELDS.misc).feel,
      wx: entry.wx2,
      strokes: entry.strokes,
      star: entry.starName + entry.starAlias,
      rank: entry.rank,
      forged: true
    };
  }

  /* ---------- 讲解 ---------- */
  const REL_SAY = {
    sheng: function (d, c) { return '今日之' + d + '生此字之' + c + '，是得势的一天，做什么都顺半拍。'; },
    beisheng: function (d, c) { return '此字之' + c + '生今日之' + d + '，要出力，出完才落得下。'; },
    ke: function (d, c) { return '今日之' + d + '克此字之' + c + '，压得住，但该守，不宜硬进。'; },
    beike: function (d, c) { return '此字之' + c + '克今日之' + d + '，能破，宜进，趁势把话说完。'; },
    tongqi: function (d, c) { return '今日与此字同属' + d + '，同类相求，不必解释也懂。'; }
  };

  const ZHI_SAY = {
    chong: function (a, b) { return '日支' + a + '与月建' + b + '相冲，事有反复，话容易说岔。'; },
    he: function (a, b) { return '日支' + a + '与月建' + b + '六合，今日所遇多能成局。'; },
    hai: function (a, b) { return '日支' + a + '与月建' + b + '相害，小事被人磨，别较真。'; },
    none: function () { return '日支与月建各安其位，没有特别的拉扯。'; }
  };

  function buildReading(profile, dp) {
    const gua = guaOf(dp, profile.strokes);
    const dayGanWx = GAN_WX[dp.dayG];
    const dayZhiWx = ZHI_WX[dp.dayZ];
    const rel = wxRel(dayGanWx, profile.wx);
    const say = REL_SAY[rel](dayGanWx, profile.wx);

    const dz = ZHI[dp.dayZ];
    const mzName = ZHI[dp.monthZ];
    let zhiKey = 'none';
    if (ZHI[dp.dayZ] === ZHI_CHONG[mzName]) zhiKey = 'chong';
    else if (ZHI[dp.dayZ] === ZHI_HE[mzName]) zhiKey = 'he';
    else if (ZHI[dp.dayZ] === ZHI_HAI[mzName]) zhiKey = 'hai';

    const sanhe = SAN_HE.filter(function (g) {
      return g.zhi.indexOf(dz) >= 0 && g.zhi.indexOf(mzName) >= 0;
    })[0];

    return {
      profile: profile,
      dp: dp,
      gua: gua,
      dayGanWx: dayGanWx,
      dayZhiWx: dayZhiWx,
      rel: rel,
      say: say,
      zhiSay: ZHI_SAY[zhiKey](dz, mzName),
      sanhe: sanhe ? '日支与月建同入' + sanhe.zhi.join('') + '局，成' + sanhe.wx + '气。' : '',
      verdict: '「' + gua.name + '」' + YAO_WEI[gua.move - 1] + '。' +
        REL_SAY[rel](dayGanWx, profile.wx)
    };
  }

  /* ---------- 部件 ---------- */
  function compOf(g) {
    const base = COMPONENTS[g];
    if (base) return Object.assign({ g: g }, base);
    return { g: g, n: '未名之旁', sem: 'misc', form: 'block', pos: 'any', s: 4 };
  }

  function partsOf(ch) {
    if (!ch) return [];
    const raw = DECOMP[ch];
    return raw ? Array.from(raw) : [ch];
  }

  function arrange(c1, c2) {
    const top = c1.pos === 'top' || c2.pos === 'top';
    const bottom = c1.pos === 'bottom' || c2.pos === 'bottom';
    const side = c1.pos === 'left' || c1.pos === 'right' || c2.pos === 'left' || c2.pos === 'right';

    let st;
    if (top || bottom) st = 'ud';
    else if (side) st = 'lr';
    else if (c1.form === 'wide' || c2.form === 'wide') st = 'ud';
    else st = 'lr';

    let first = c1;
    let second = c2;
    if (st === 'ud') {
      if (c2.pos === 'top' && c1.pos !== 'top') { first = c2; second = c1; }
      else if (c1.pos === 'bottom' && c2.pos !== 'bottom') { first = c2; second = c1; }
    } else {
      if (c2.pos === 'left' && c1.pos !== 'left') { first = c2; second = c1; }
      else if (c1.pos === 'right' && c2.pos !== 'right') { first = c2; second = c1; }
    }
    return { st: st, first: first, second: second };
  }

  /* ---------- 炼字 ---------- */
  function forge(gA, gB) {
    const a = compOf(gA);
    const b = compOf(gB);
    const placed = arrange(a, b);
    const st = placed.st;
    const first = placed.first;
    const second = placed.second;

    const fg = first.g;
    const sg = second.g;
    const id = st + '|' + fg + '|' + sg;

    const F1 = FIELDS[first.sem] || FIELDS.misc;
    const F2 = FIELDS[second.sem] || FIELDS.misc;

    const rng = makeRng(hash(id));
    const pick = function (arr) { return arr[Math.floor(rng() * arr.length)]; };
    const pickOther = function (arr, avoid) {
      if (arr.length < 2) return arr[0];
      let v = arr[Math.floor(rng() * arr.length)];
      if (v === avoid) v = arr[(arr.indexOf(v) + 1) % arr.length];
      return v;
    };

    const sameGlyph = fg === sg;
    const sameField = first.sem === second.sem;

    /* 先定关系，再让关系决定字义 —— 这是「造字」而不是「抽词」的地方 */
    const relKey = relationOf(first, second, sameGlyph);
    const REL = RELATIONS[relKey];
    const wx1 = F1.wuxing;
    const wx2 = F2.wuxing;

    const n1 = pick(F1.nouns);
    const n2 = sameField ? pickOther(F2.nouns, n1) : pick(F2.nouns);
    const a1 = pick(F1.adjs);
    const a2 = sameField ? pickOther(F2.adjs, a1) : pick(F2.adjs);
    const poetic = rng() < 0.5 ? pick(F1.poetic) : pick(F2.poetic);

    const syl = pick(SYLLABLES);
    const tone = 1 + Math.floor(rng() * 4);

    const ctx = {
      n1: n1, n2: n2,
      f1: F1.feel, f2: F2.feel,
      wx: wx1, wx2: wx2,
      c1: first.n, c2: second.n
    };

    /* 玄空：这个字入中哪一星、怎么飞布、坐什么山、当不当运 */
    const star = starFor(first, second, relKey, rng);
    const S = STARS[star];
    const yun = currentYun();
    const yunInfo = yunStatus(star, yun);
    const mount = mountainsFor(id);

    /* 字品：关系定底，当运加一，五黄减一 */
    const jitter = rng() < 0.34 ? 1 : 0;
    let stars = REL.base + jitter;
    if (yunInfo.key === 'wang') stars += 1;
    if (star === 5) stars -= 1;
    stars = Math.max(1, Math.min(5, stars));

    /* 部件占位：叠体时两半等宽等高 */
    let s1, s2, w1, w2;
    if (sameGlyph) {
      s1 = 0.46; s2 = 0.46; w1 = 50; w2 = 50;
    } else if (st === 'lr') {
      s1 = NARROW.has(fg) ? 0.42 : 0.46;
      s2 = 0.54; w1 = 46; w2 = 54;
    } else {
      s1 = 0.44; s2 = 0.56; w1 = 44; w2 = 56;
    }

    return {
      id: id,
      st: st,
      first: fg,
      second: sg,
      s1: s1,
      s2: s2,
      w1: w1,
      w2: w2,
      py: toneMark(syl, tone),
      pyPlain: syl,
      tone: tone,
      strokes: (first.s || 4) + (second.s || 4),
      relKey: relKey,
      relName: REL.name,
      wx1: wx1,
      wx2: wx2,
      method: sameGlyph ? '叠体' : '会意',
      methodDesc: REL.desc(first, second, F1, F2),
      gloss: fillTpl(pick(REL.gloss), ctx),
      def: fillTpl(pick(REL.def), ctx),
      def2: '亦指' + a1 + n1 + '，与' + a2 + n2 + '。',
      poetic: poetic,
      use: fillTpl(pick(REL.use), ctx),
      stars: stars,
      rank: RANKS[stars],
      star: star,
      starName: S.name,
      starAlias: S.alias,
      starWx: S.wx,
      starLuck: S.luck,
      starGov: S.gov,
      starGood: S.good,
      pan: flyPan(star),
      yun: yun,
      yunText: yunInfo.text,
      yunTone: yunInfo.tone,
      sit: mount.sit,
      face: mount.face,
      real: REAL[id] || null,
      naming: state.naming || '',
      createdAt: Date.now()
    };
  }

  /* ---------- 字形渲染 ---------- */
  const GRID_SVG =
    '<svg class="glyph__grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<line x1="50" y1="0" x2="50" y2="100" stroke-dasharray="3 3"/>' +
    '<line x1="0" y1="50" x2="100" y2="50" stroke-dasharray="3 3"/>' +
    '<line x1="0" y1="0" x2="100" y2="100" stroke-dasharray="3 3" opacity=".5"/>' +
    '<line x1="100" y1="0" x2="0" y2="100" stroke-dasharray="3 3" opacity=".5"/>' +
    '</svg>';

  function glyphMarkup(entry) {
    const style = '--s1:' + entry.s1 + ';--s2:' + entry.s2 +
      ';--w1:' + (entry.w1 || 46) + '%;--w2:' + (entry.w2 || 54) + '%';
    const label = '新造字：' + STRUCT_NAME[entry.st] + '，' + entry.first + '与' + entry.second;
    return '<div class="glyph glyph--' + entry.st + '" style="' + style + '" role="img" aria-label="' +
      label + '">' + GRID_SVG +
      '<span class="glyph__part p1">' + entry.first + '</span>' +
      '<span class="glyph__part p2">' + entry.second + '</span>' +
      '</div>';
  }

  /* ---------- DOM ---------- */
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  const el = {
    result: $('#result'),
    forgeBtn: $('#forgeBtn'),
    randomBtn: $('#randomBtn'),
    dictBtn: $('#dictBtn'),
    dictCount: $('#dictCount'),
    soundBtn: $('#soundBtn'),
    themeBtn: $('#themeBtn'),
    paletteGroups: $('#paletteGroups'),
    dictSection: $('#dict'),
    dictGrid: $('#dictGrid'),
    clearDict: $('#clearDict'),
    dictEmptyHint: $('#dictEmptyHint'),
    namingInput: $('#namingInput'),
    namingPresets: $('#namingPresets'),
    discGrid: $('#discGrid'),
    discCount: $('#discCount'),
    divineChar: $('#divineChar'),
    divineDate: $('#divineDate'),
    divineBtn: $('#divineBtn'),
    divineUse: $('#divineUse'),
    divineOut: $('#divineOut'),
    canvas: $('#exportCanvas')
  };

  const state = {
    slots: { a: { char: '', parts: [], part: '' }, b: { char: '', parts: [], part: '' } },
    active: 'a',
    entry: null,
    dirty: false,
    naming: '',
    divineEntry: null,
    disc: {},
    dict: []
  };

  const prefs = { theme: 'light', sound: true };

  /* ---------- 存档 ---------- */
  function loadDict() {
    try {
      const raw = localStorage.getItem(STORE_DICT);
      const arr = raw ? JSON.parse(raw) : [];
      state.dict = Array.isArray(arr)
        ? arr.filter(function (x) { return x && x.id && x.first && x.second; })
        : [];
    } catch (e) { state.dict = []; }
  }

  function saveDict() {
    try {
      localStorage.setItem(STORE_DICT, JSON.stringify(state.dict.slice(0, DICT_CAP)));
    } catch (e) { /* 存不下就算了 */ }
  }

  function loadDisc() {
    try {
      const raw = localStorage.getItem(STORE_DISC);
      const arr = raw ? JSON.parse(raw) : [];
      state.disc = {};
      if (Array.isArray(arr)) {
        arr.forEach(function (k) { if (typeof k === 'string') state.disc[k] = true; });
      }
    } catch (e) { state.disc = {}; }
  }

  function saveDisc() {
    try { localStorage.setItem(STORE_DISC, JSON.stringify(Object.keys(state.disc))); }
    catch (e) { /* 忽略 */ }
  }

  function loadPref() {
    try {
      const raw = localStorage.getItem(STORE_PREF);
      if (raw) {
        const p = JSON.parse(raw);
        prefs.theme = p.theme === 'dark' ? 'dark' : 'light';
        prefs.sound = p.sound !== false;
        return true;
      }
    } catch (e) { /* 忽略 */ }
    return false;
  }

  function savePref() {
    try { localStorage.setItem(STORE_PREF, JSON.stringify(prefs)); }
    catch (e) { /* 忽略 */ }
  }

  /* ---------- 主题 ---------- */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    el.themeBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    el.themeBtn.textContent = theme === 'dark' ? '☀' : '◐';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#14120f' : '#f4eee2');
  }

  /* ---------- 音效 ---------- */
  let audioCtx = null;

  function chime(seed) {
    if (!prefs.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const base = 349.23 * Math.pow(2, ((seed >>> 0) % 7) / 12);
      const steps = [1, 1.25, 1.49];
      steps.forEach(function (m, i) {
        const t = audioCtx.currentTime + i * 0.06;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = i === 2 ? 'sine' : 'triangle';
        osc.frequency.value = base * m;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.055, t + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.6);
      });
    } catch (e) { /* 静默 */ }
  }

  /* ---------- 吐司 ---------- */
  let toastEl = null;
  let toastTimer = 0;

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.dataset.show = 'true';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.dataset.show = 'false'; }, 2400);
  }

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function starsText(n) {
    return new Array(n + 1).join('★') + new Array(6 - n).join('☆');
  }

  function relTone(entry) {
    const R = RELATIONS[entry.relKey];
    return R ? R.tone : 'jade';
  }

  /* ---------- 九宫字局盘 ---------- */
  function markDisc(entry) {
    const k = String(entry.star);
    if (state.disc[k]) return false;
    state.disc[k] = true;
    saveDisc();
    renderDisc();
    return true;
  }

  function renderDisc() {
    if (!el.discGrid) return;
    const total = PALACES.length;
    const got = PALACES.filter(function (p) { return state.disc[String(p.num)]; }).length;
    if (el.discCount) el.discCount.textContent = got + ' / ' + total;

    el.discGrid.innerHTML = PALACES.map(function (p) {
      const S = STARS[p.num];
      const on = !!state.disc[String(p.num)];
      return '<div class="palace' + (on ? ' is-on' : '') + (S.good ? '' : ' palace--bad') +
        '" data-star="' + p.num + '" tabindex="0" role="button" ' +
        'aria-label="' + p.name + '宫 ' + S.name + S.alias + (on ? '，已得' : '，未得') + '" ' +
        'title="' + p.name + '宫 · ' + S.name + S.alias + '（' + S.wx + '）· ' + S.luck + '">' +
        '<b class="palace__num">' + p.num + '</b>' +
        '<span class="palace__star">' + S.alias + '</span>' +
        '<span class="palace__name">' + p.name + '</span>' +
        '</div>';
    }).join('');
  }

  function discInfo(num) {
    const S = STARS[num];
    if (!S) return '';
    const got = !!state.disc[String(num)];
    return S.name + S.alias + ' · 属' + S.wx + ' · ' + S.luck + ' · 主' + S.gov +
      (got ? '（已得）' : '（未得）');
  }

  /* ---------- 偏旁盘 ---------- */
  function renderPalette() {
    if (!el.paletteGroups) return;
    el.paletteGroups.innerHTML = PALETTE.map(function (group) {
      const btns = group.glyphs.map(function (g) {
        const c = compOf(g);
        return '<button class="pbtn" type="button" data-glyph="' + g + '" ' +
          'title="' + g + ' · ' + c.n + '" aria-label="偏旁 ' + c.n + '">' + g + '</button>';
      }).join('');
      return '<div class="pgroup"><span class="pgroup__title">' + group.title + '</span>' +
        '<div class="pgroup__list">' + btns + '</div></div>';
    }).join('');
  }

  /* ---------- 槽位 ---------- */
  function slotEl(key) { return $('.slot[data-slot="' + key + '"]'); }

  function setSlot(key, char) {
    const parts = partsOf(char);
    state.slots[key] = { char: char, parts: parts, part: parts.length ? parts[0] : '' };
    state.dirty = true;
  }

  function syncStale() {
    if (el.result) el.result.classList.toggle('is-stale', !!state.dirty);
  }

  function renderSlot(key) {
    const s = state.slots[key];
    const root = slotEl(key);
    if (!root) return;
    const glyph = $('[data-role="glyph"]', root);
    const from = $('[data-role="from"]', root);
    const partsBox = $('[data-role="parts"]', root);
    const input = $('.slot__input', root);

    glyph.dataset.empty = s.part ? 'false' : 'true';
    glyph.innerHTML = GRID_SVG + '<span>' + (s.part || '＋') + '</span>';
    from.textContent = s.part
      ? (s.char && s.char !== s.part ? '取自「' + s.char + '」' : '偏旁')
      : '';

    if (s.parts.length > 1) {
      partsBox.innerHTML = s.parts.map(function (p) {
        return '<button class="part-chip" type="button" data-part="' + p + '" ' +
          'aria-pressed="' + (p === s.part ? 'true' : 'false') + '" ' +
          'aria-label="使用部件 ' + p + '">' + p + '</button>';
      }).join('');
    } else {
      partsBox.innerHTML = '';
    }

    if (input.value !== (s.char || '')) input.value = s.char || '';
    root.classList.toggle('is-active', state.active === key);
    syncStale();
  }

  function renderSlots() {
    renderSlot('a');
    renderSlot('b');
  }

  function setActive(key) {
    state.active = key;
    $$('.slot').forEach(function (n) {
      n.classList.toggle('is-active', n.dataset.slot === key);
    });
  }

  /* ---------- 缺字 ---------- */
  function renderPresets() {
    if (!el.namingPresets) return;
    el.namingPresets.innerHTML = NAMING_PRESETS.map(function (t) {
      return '<button class="preset" type="button" data-preset="' + esc(t) + '">' +
        esc(t) + '</button>';
    }).join('');
  }

  function namingInner(entry) {
    return entry.naming ? '<span>用来命名</span>「' + esc(entry.naming) + '」' : '';
  }

  function syncNaming() {
    const node = $('[data-naming]');
    if (!node) return;
    if (state.naming) {
      node.hidden = false;
      node.innerHTML = '<span>用来命名</span>「' + esc(state.naming) + '」';
    } else {
      node.hidden = true;
      node.innerHTML = '';
    }
  }

  function applyNaming(value) {
    state.naming = String(value || '').trim().slice(0, 40);
    if (state.entry && !state.dirty) {
      state.entry.naming = state.naming;
      syncNaming();
    }
  }

  /* ---------- 结果卡 ---------- */
  function renderEmpty() {
    el.result.innerHTML =
      '<div class="empty">' +
        '<span class="empty__mark" aria-hidden="true">炉</span>' +
        '<p>炉子还空着。</p>' +
        '<small>左右两边各放一个偏旁，再点火。</small>' +
      '</div>';
  }

  function panMarkup(entry) {
    let cells = '';
    PALACES.forEach(function (p) {
      const n = entry.pan ? entry.pan[p.name] : p.num;
      const S = STARS[n] || STARS[1];
      cells += '<div class="pan__cell' +
        (p.name === '中' ? ' pan__cell--center' : '') +
        (S.good ? '' : ' pan__cell--bad') + '" title="' +
        p.name + '宫 · ' + S.name + S.alias + ' · ' + S.luck + '">' +
        '<b>' + n + '</b><i>' + p.name + '</i></div>';
    });
    return '<div class="pan">' +
        '<div class="pan__grid" role="img" aria-label="九宫飞星盘，' +
          entry.starName + '入中">' + cells + '</div>' +
        '<div class="pan__meta">' +
          '<strong>' + entry.starName + ' ' + entry.starAlias + ' · 属' + entry.starWx + '</strong>' +
          '<span>' + entry.starLuck + ' · 主' + entry.starGov + '</span>' +
          '<span>' + entry.yun + '运 · 坐' + entry.sit + '向' + entry.face + '</span>' +
        '</div>' +
      '</div>';
  }

  function renderEntry(entry, opts) {
    state.entry = entry;
    const saved = state.dict.some(function (d) { return d.id === entry.id; });
    const tone = relTone(entry);
    const real = entry.real
      ? '<div class="entry__real"><b>' + entry.real.c + '</b><span>此字人间已有：' +
        entry.real.m + '</span></div>'
      : '';

    el.result.innerHTML =
      '<article class="entry">' +
        '<div class="entry__left">' +
          glyphMarkup(entry) +
          '<div class="entry__badges">' +
            '<span class="badge">' + STRUCT_NAME[entry.st] + ' · ' + entry.strokes + '画</span>' +
            '<span class="badge badge--' + tone + '">' + entry.relName + '</span>' +
            '<span class="badge badge--' + (entry.starGood ? 'gold' : 'accent') + '">' +
              entry.starName + '</span>' +
            '<span class="badge badge--stars" aria-label="字品 ' + entry.rank + '">' +
              entry.rank + ' ' + starsText(entry.stars) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="entry__body">' +
          '<div class="entry__head">' +
            '<span class="py">' + entry.py + '<small>第 ' + entry.tone + ' 声</small></span>' +
            '<span class="badge badge--' + tone + '">' + entry.method + ' · ' +
              entry.wx1 + '→' + entry.wx2 + '</span>' +
            '<span class="badge badge--' + entry.yunTone + '">' + entry.yunText + '</span>' +
          '</div>' +
          '<p class="entry__naming" data-naming' + (entry.naming ? '' : ' hidden') + '>' +
            namingInner(entry) + '</p>' +
          '<p class="entry__method">' + entry.methodDesc + '</p>' +
          '<h2 class="entry__gloss">' + entry.gloss + '</h2>' +
          '<p class="entry__def"><b>字义</b>　' + entry.def + entry.def2 + '</p>' +
          '<p class="entry__poetic">' + entry.poetic + '</p>' +
          '<p class="entry__use"><b>用例</b>　' + entry.use + '</p>' +
          panMarkup(entry) +
          real +
          '<div class="entry__actions">' +
            '<button class="btn btn--primary btn--tiny" type="button" data-act="save"' +
              (saved ? ' disabled' : '') + '>' + (saved ? '已在字典' : '收进字典') + '</button>' +
            '<button class="btn btn--tiny" type="button" data-act="export">导出卡片</button>' +
            '<button class="btn btn--tiny" type="button" data-act="again">再炼一次</button>' +
          '</div>' +
        '</div>' +
      '</article>';

    if (opts && opts.scroll) {
      el.result.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    state.dirty = false;
    syncStale();
  }

  /* ---------- 炼 ---------- */
  function doForge() {
    const a = state.slots.a.part;
    const b = state.slots.b.part;
    if (!a || !b) {
      toast(!a && !b ? '先各放一个偏旁' : '还差一个偏旁');
      (a ? $('#inputB') : $('#inputA')).focus();
      return;
    }
    const entry = forge(a, b);
    markDisc(entry);
    renderEntry(entry, { scroll: false });
    chime(entry.stars * 1000 + hash(entry.id));
    el.forgeBtn.blur();
  }

  function randomForge() {
    const pool = Object.keys(COMPONENTS);
    const g1 = pool[Math.floor(Math.random() * pool.length)];
    let g2 = pool[Math.floor(Math.random() * pool.length)];
    if (g2 === g1) g2 = pool[(pool.indexOf(g1) + 7) % pool.length];
    setSlot('a', g1);
    setSlot('b', g2);
    renderSlots();
    setActive('a');
    const entry = forge(state.slots.a.part, state.slots.b.part);
    markDisc(entry);
    renderEntry(entry, { scroll: false });
    chime(entry.stars * 1000 + hash(entry.id));
  }

  /* ---------- 字典 ---------- */
  function renderDict() {
    if (!el.dictGrid) return;
    const n = state.dict.length;
    if (el.dictCount) el.dictCount.textContent = String(n);
    if (el.clearDict) el.clearDict.hidden = n === 0;
    if (el.dictEmptyHint) el.dictEmptyHint.hidden = n > 0;

    if (!n) {
      el.dictGrid.innerHTML = '<div class="dict__empty">还空着。炼出喜欢的字，就收进来。</div>';
      return;
    }

    el.dictGrid.innerHTML = state.dict.map(function (entry) {
      return '<div class="dcard" role="button" tabindex="0" data-id="' + entry.id + '">' +
          '<div class="dcard__glyph">' + glyphMarkup(entry) + '</div>' +
          '<div class="dcard__meta">' +
            '<span class="dcard__py">' + entry.py + '</span>' +
            '<span class="dcard__gloss">' + entry.gloss + '</span>' +
            '<span class="dcard__sub">' + STRUCT_NAME[entry.st] + ' · ' +
              (entry.starName || '') + ' · ' + entry.rank + '</span>' +
          '</div>' +
          '<button class="dcard__del" type="button" data-del="' + entry.id + '" ' +
            'aria-label="从字典删除">×</button>' +
        '</div>';
    }).join('');
  }

  function saveEntry(entry) {
    if (state.dict.some(function (d) { return d.id === entry.id; })) {
      toast('这个字已经在字典里了');
      return;
    }
    state.dict.unshift(entry);
    if (state.dict.length > DICT_CAP) state.dict.length = DICT_CAP;
    saveDict();
    renderDict();
    renderEntry(entry, { scroll: false });
    toast('已收进字典 · ' + entry.rank);
    chime(2200);
  }

  /* ---------- 导出卡片 ---------- */
  function drawSeal(ctx, cx, cy, size, text, serif) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.05);
    ctx.fillStyle = 'rgba(176,55,42,0.9)';
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeStyle = 'rgba(247,241,227,0.75)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-size / 2 + 5, -size / 2 + 5, size - 10, size - 10);
    ctx.fillStyle = '#f7f1e3';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 ' + Math.round(size * 0.34) + 'px ' + serif;
    const chars = text.split('');
    chars.forEach(function (c, i) {
      ctx.fillText(c, 0, (i - (chars.length - 1) / 2) * size * 0.32);
    });
    ctx.restore();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    let line = '';
    for (let i = 0; i < text.length; i++) {
      const test = line + text[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        line = text[i];
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
    return y;
  }

  function exportCard(entry) {
    const cv = el.canvas;
    const W = cv.width;
    const H = cv.height;
    const ctx = cv.getContext('2d');
    const PAPER = '#f7f1e3';
    const INK = '#211e19';
    const SOFT = '#574f3f';
    const ACCENT = '#b0372a';
    const DIM = '#8a8071';
    const SERIF = '"Songti SC","STSong","Noto Serif SC","SimSun",serif';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    /* 边框 */
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.strokeRect(44, 44, W - 88, H - 88);
    ctx.strokeStyle = 'rgba(176,55,42,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(58, 58, W - 116, H - 116);

    /* 抬头 */
    ctx.fillStyle = DIM;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '20px ui-monospace, Consolas, monospace';
    ctx.fillText('造 字 局 · 汉 字 炼 金 术', W / 2, 118);

    /* 缺字：这个字为谁而立 */
    if (entry.naming) {
      const txt = entry.naming.length > 26 ? entry.naming.slice(0, 26) + '…' : entry.naming;
      ctx.fillStyle = ACCENT;
      ctx.font = '24px ' + SERIF;
      ctx.fillText('为「' + txt + '」立一字', W / 2, 156);
    }

    /* 字框 */
    const box = 420;
    const bx = (W - box) / 2;
    const by = 172;
    ctx.fillStyle = '#efe6d3';
    ctx.fillRect(bx, by, box, box);

    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(33,30,25,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + box / 2, by);
    ctx.lineTo(bx + box / 2, by + box);
    ctx.moveTo(bx, by + box / 2);
    ctx.lineTo(bx + box, by + box / 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(33,30,25,0.13)';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + box, by + box);
    ctx.moveTo(bx + box, by);
    ctx.lineTo(bx, by + box);
    ctx.stroke();
    ctx.restore();

    /* 部件 */
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const font = function (size) { return '600 ' + Math.round(size) + 'px ' + SERIF; };
    const rw1 = (entry.w1 || 46) / 100;
    const rw2 = (entry.w2 || 54) / 100;
    if (entry.st === 'lr') {
      ctx.font = font(box * entry.s1);
      ctx.fillText(entry.first, bx + box * rw1 / 2, by + box * 0.5);
      ctx.font = font(box * entry.s2);
      ctx.fillText(entry.second, bx + box * (rw1 + rw2 / 2), by + box * 0.5);
    } else {
      ctx.font = font(box * entry.s1);
      ctx.fillText(entry.first, bx + box * 0.5, by + box * rw1 / 2);
      ctx.font = font(box * entry.s2);
      ctx.fillText(entry.second, bx + box * 0.5, by + box * (rw1 + rw2 / 2));
    }

    /* 注音与规格 */
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ACCENT;
    ctx.font = '600 52px ui-monospace, Consolas, monospace';
    ctx.fillText(entry.py, W / 2, by + box + 78);

    ctx.fillStyle = DIM;
    ctx.font = '19px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      STRUCT_NAME[entry.st] + ' · ' + entry.method + ' · ' + entry.strokes + '画 · ' +
        entry.relName + ' · ' + entry.wx1 + '→' + entry.wx2,
      W / 2, by + box + 112
    );
    ctx.fillText(
      entry.starName + entry.starAlias + ' · ' + entry.yunText + ' · ' + entry.yun + '运 · 坐' +
        entry.sit + '向' + entry.face + ' · ' + entry.rank,
      W / 2, by + box + 140
    );

    /* 九宫飞星盘 */
    const cell = 40;
    const gap = 4;
    const gw = cell * 3 + gap * 2;
    const gx = (W - gw) / 2;
    const gy = by + box + 170;
    PALACES.forEach(function (p, i) {
      const n = entry.pan ? entry.pan[p.name] : p.num;
      const S = STARS[n] || STARS[1];
      const x = gx + (i % 3) * (cell + gap);
      const yy = gy + Math.floor(i / 3) * (cell + gap);
      const center = p.name === '中';
      ctx.fillStyle = center ? ACCENT : (S.good ? '#efe6d3' : '#f3e2dc');
      ctx.fillRect(x, yy, cell, cell);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = center ? '#f7f1e3' : (S.good ? SOFT : ACCENT);
      ctx.font = '14px ui-monospace, Consolas, monospace';
      ctx.fillText(String(n), x + cell / 2, yy + cell / 2 - 6);
      ctx.font = '9px ' + SERIF;
      ctx.fillStyle = center ? '#f7f1e3' : DIM;
      ctx.fillText(p.name, x + cell / 2, yy + cell / 2 + 9);
    });
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.fillStyle = DIM;
    ctx.font = '13px ' + SERIF;
    ctx.fillText(entry.starName + '入中 · 顺飞九宫', W / 2, gy + cell * 3 + gap * 2 + 20);

    /* 词条 */
    let y = by + box + 360;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.font = '600 38px ' + SERIF;
    ctx.fillText(entry.gloss, W / 2, y);
    y += 52;

    ctx.textAlign = 'left';
    const left = 104;
    const maxW = W - left * 2;

    ctx.fillStyle = SOFT;
    ctx.font = '23px ' + SERIF;
    y = wrapText(ctx, entry.def + entry.def2, left, y, maxW, 35);
    y += 6;

    ctx.fillStyle = INK;
    ctx.font = '25px ' + SERIF;
    y = wrapText(ctx, '「' + entry.poetic + '」', left, y + 8, maxW, 37);
    y += 8;

    ctx.fillStyle = SOFT;
    ctx.font = '23px ' + SERIF;
    y = wrapText(ctx, entry.use, left, y, maxW, 35);

    /* 人间已有 */
    if (entry.real) {
      ctx.fillStyle = '#2c6657';
      ctx.font = '22px ' + SERIF;
      wrapText(ctx, '此字人间已有：' + entry.real.c + '。' + entry.real.m,
        left, y + 14, maxW, 33);
    }

    /* 朱砂印 */
    drawSeal(ctx, bx + box - 28, by + box - 28, 92, '造字', SERIF);

    /* 页脚 */
    ctx.textAlign = 'center';
    ctx.fillStyle = DIM;
    ctx.font = '18px ui-monospace, Consolas, monospace';
    const d = new Date(entry.createdAt || Date.now());
    const stamp = d.getFullYear() + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' +
      String(d.getDate()).padStart(2, '0');
    ctx.fillText('于 ' + stamp + ' 炼成', W / 2, H - 92);
    ctx.fillStyle = ACCENT;
    ctx.font = '600 18px ui-monospace, Consolas, monospace';
    ctx.fillText('Z I F O R G E', W / 2, H - 66);

    cv.toBlob(function (blob) {
      if (!blob) { toast('导出失败，换个浏览器试试'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '造字-' + entry.pyPlain + '-' + entry.first + entry.second + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      toast('卡片已导出');
    }, 'image/png');
  }

  /* ---------- 解字渲染 ---------- */
  function renderReading(reading) {
    if (!el.divineOut) return;
    const p = reading.profile;
    const dp = reading.dp;
    const g = reading.gua;
    const extras = [];
    if (p.forged) extras.push(p.star + ' · ' + p.rank);

    el.divineOut.innerHTML =
      '<article class="reading">' +
        '<header class="reading__head">' +
          '<div class="reading__char">' + esc(p.label) + '</div>' +
          '<div class="reading__when">' +
            '<strong>' + dp.y + '.' + pad2(dp.m) + '.' + pad2(dp.d) + '</strong>' +
            '<span>' + dp.yearGZ + '年 · ' + dp.monthGZ + '月 · ' + dp.dayGZ + '日</span>' +
          '</div>' +
        '</header>' +
        '<div class="reading__grid">' +
          '<div class="rblock">' +
            '<h3>字</h3>' +
            '<p>拆作 ' + p.parts.join(' · ') + '</p>' +
            '<p>' + p.names.join('、') + '</p>' +
            '<p>' + p.strokes + '画 · ' + p.semNote + ' · 属' + p.wx + '</p>' +
            (extras.length ? '<p>' + extras.join(' · ') + '</p>' : '') +
          '</div>' +
          '<div class="rblock">' +
            '<h3>日</h3>' +
            '<p>' + dp.jieName + '后第 ' + (dp.jieDays + 1) + ' 天</p>' +
            '<p>' + dp.qiName + '后第 ' + (dp.qiDays + 1) + ' 天，距' +
              dp.nextQi + '还有 ' + dp.nextQiDays + ' 天</p>' +
            '<p>年纳音 ' + dp.yearNayin + ' · 日纳音 ' + dp.dayNayin + '</p>' +
            '<p>' + dp.jian + '月，当值' + dp.shixiao + '卦</p>' +
          '</div>' +
          '<div class="rblock rblock--wide">' +
            '<h3>相会</h3>' +
            '<p>日干属' + reading.dayGanWx + '、日支属' + reading.dayZhiWx +
              '，此字属' + p.wx + '。</p>' +
            '<p>' + reading.say + '</p>' +
            '<p>' + reading.zhiSay + (reading.sanhe || '') + '</p>' +
          '</div>' +
          '<div class="rblock">' +
            '<h3>卦</h3>' +
            '<p>上' + g.up + '（' + g.upXiang + '）下' + g.down + '（' + g.downXiang + '）</p>' +
            '<p><b>' + g.name + '</b>卦 · 动第 ' + g.move + ' 爻</p>' +
            '<p>' + (g.up === g.down
              ? '两' + g.upXiang + '相重，' + g.upDe + '上加' + g.upDe + '。'
              : g.upXiang + '在' + g.downXiang + '上，' + g.upDe + '以' + g.downDe + '。') + '</p>' +
          '</div>' +
        '</div>' +
        '<p class="reading__verdict">' + reading.verdict + '</p>' +
      '</article>';
  }

  function divineProfile(profile) {
    if (!profile) return;
    const today = new Date();
    const v = (el.divineDate && el.divineDate.value) || '';
    const bits = v.split('-').map(Number);
    const y = bits[0] || today.getFullYear();
    const m = bits[1] || (today.getMonth() + 1);
    const d = bits[2] || today.getDate();
    renderReading(buildReading(profile, dateProfile(y, m, d)));
  }

  function divineOnce() {
    if (state.divineEntry) { divineProfile(profileFromEntry(state.divineEntry)); return; }
    const raw = (el.divineChar && el.divineChar.value) || '';
    const m = raw.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
    if (!m) {
      toast('先写一个字，或者用炉里这个字');
      if (el.divineChar) el.divineChar.focus();
      return;
    }
    divineProfile(profileFromChar(m[m.length - 1]));
  }

  /* ---------- 事件 ---------- */
  function bindSlotInputs() {
    ['a', 'b'].forEach(function (key) {
      const input = $('#input' + key.toUpperCase());
      if (!input) return;

      input.addEventListener('focus', function () { setActive(key); });

      input.addEventListener('input', function () {
        const matched = input.value.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
        const ch = matched ? matched[matched.length - 1] : '';
        if (ch) {
          setSlot(key, ch);
          renderSlot(key);
          if (input.value !== ch) input.value = ch;
        } else {
          setSlot(key, '');
          renderSlot(key);
          input.value = '';
        }
      });

      input.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const other = key === 'a' ? 'b' : 'a';
        if (!state.slots[other].part) {
          $('#input' + other.toUpperCase()).focus();
        } else {
          doForge();
        }
      });
    });
  }

  function bindSlots() {
    $$('.slot').forEach(function (root) {
      root.addEventListener('click', function (ev) {
        const chip = ev.target.closest('.part-chip');
        if (chip && chip.dataset.part) {
          const key = root.dataset.slot;
          state.slots[key].part = chip.dataset.part;
          state.dirty = true;
          setActive(key);
          renderSlot(key);
          return;
        }
        if (ev.target === root || ev.target.closest('[data-role="glyph"]')) {
          $('.slot__input', root).focus();
        }
      });
    });
  }

  function bindMisc() {
    el.forgeBtn.addEventListener('click', doForge);
    el.randomBtn.addEventListener('click', randomForge);

    if (el.namingInput) {
      el.namingInput.addEventListener('input', function () {
        applyNaming(el.namingInput.value);
      });
    }

    if (el.namingPresets) {
      el.namingPresets.addEventListener('click', function (ev) {
        const b = ev.target.closest('[data-preset]');
        if (!b) return;
        const v = b.dataset.preset;
        el.namingInput.value = v;
        applyNaming(v);
        el.namingInput.focus();
      });
    }

    if (el.discGrid) {
      const showStar = function (ev) {
        const cell = ev.target.closest('.palace');
        if (!cell) return;
        toast(discInfo(cell.dataset.star));
      };
      el.discGrid.addEventListener('click', showStar);
      el.discGrid.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          showStar(ev);
        }
      });
    }

    /* 解字 */
    if (el.divineBtn) {
      const today = new Date();
      if (el.divineDate && !el.divineDate.value) {
        el.divineDate.value = today.getFullYear() + '-' +
          pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());
      }
      el.divineBtn.addEventListener('click', divineOnce);
      if (el.divineChar) {
        el.divineChar.addEventListener('input', function () {
          state.divineEntry = null;
          if (el.divineUse) el.divineUse.setAttribute('aria-pressed', 'false');
        });
        el.divineChar.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); divineOnce(); }
        });
      }
      if (el.divineUse) {
        el.divineUse.addEventListener('click', function () {
          if (!state.entry) { toast('炉里还没有字'); return; }
          state.divineEntry = state.entry;
          el.divineUse.setAttribute('aria-pressed', 'true');
          divineOnce();
        });
      }
      if (el.divineDate) {
        el.divineDate.addEventListener('change', function () {
          if (el.divineOut && el.divineOut.firstChild) divineOnce();
        });
      }
    }

    el.paletteGroups.addEventListener('click', function (ev) {
      const btn = ev.target.closest('.pbtn');
      if (!btn) return;
      const g = btn.dataset.glyph;
      let key = state.active;
      const other = key === 'a' ? 'b' : 'a';
      if (state.slots[key].part && !state.slots[other].part) key = other;
      setSlot(key, g);
      setActive(key);
      renderSlot(key);
      const next = key === 'a' ? 'b' : 'a';
      if (!state.slots[next].part) setActive(next);
    });

    el.result.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-act]');
      if (!btn || !state.entry) return;
      const act = btn.dataset.act;
      if (act === 'again') { randomForge(); return; }
      if (state.dirty) { toast('先点火重炼，再看这个字'); return; }
      if (act === 'save') saveEntry(state.entry);
      else if (act === 'export') exportCard(state.entry);
    });

    el.dictBtn.addEventListener('click', function () {
      const open = !el.dictSection.hidden;
      el.dictSection.hidden = open;
      el.dictBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (!open) el.dictSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    el.dictGrid.addEventListener('click', function (ev) {
      const del = ev.target.closest('[data-del]');
      if (del) {
        ev.stopPropagation();
        const id = del.dataset.del;
        state.dict = state.dict.filter(function (d) { return d.id !== id; });
        saveDict();
        renderDict();
        toast('已从字典移出');
        return;
      }
      const card = ev.target.closest('.dcard');
      if (!card) return;
      const entry = state.dict.filter(function (d) { return d.id === card.dataset.id; })[0];
      if (entry) renderEntry(entry, { scroll: true });
    });

    el.dictGrid.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const card = ev.target.closest('.dcard');
      if (!card || ev.target.closest('[data-del]')) return;
      ev.preventDefault();
      const entry = state.dict.filter(function (d) { return d.id === card.dataset.id; })[0];
      if (entry) renderEntry(entry, { scroll: true });
    });

    el.clearDict.addEventListener('click', function () {
      if (!state.dict.length) return;
      if (!window.confirm('清空整本字典？这个动作不可撤销。')) return;
      state.dict = [];
      saveDict();
      renderDict();
      toast('字典已清空');
    });

    el.soundBtn.addEventListener('click', function () {
      prefs.sound = !prefs.sound;
      el.soundBtn.setAttribute('aria-pressed', prefs.sound ? 'true' : 'false');
      savePref();
      if (prefs.sound) { chime(1800); toast('音效已开'); }
      else toast('音效已关');
    });

    el.themeBtn.addEventListener('click', function () {
      prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
      applyTheme(prefs.theme);
      savePref();
    });

    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
        ev.preventDefault();
        doForge();
      }
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    const hasPref = loadPref();
    if (!hasPref) {
      prefs.theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark' : 'light';
    }
    applyTheme(prefs.theme);
    el.soundBtn.setAttribute('aria-pressed', prefs.sound ? 'true' : 'false');

    loadDict();
    loadDisc();
    renderPalette();
    renderPresets();
    renderDisc();
    renderDict();

    /* 冷启动时先替他炼一个字，说明这东西怎么用 */
    setSlot('a', '雨');
    setSlot('b', '木');
    renderSlots();
    setActive('a');
    const initEntry = forge('雨', '木');
    markDisc(initEntry);
    renderEntry(initEntry, { scroll: false });

    bindSlotInputs();
    bindSlots();
    bindMisc();

    /* 一进来就解一次，让这一栏不是空的 */
    state.divineEntry = initEntry;
    if (el.divineUse) el.divineUse.setAttribute('aria-pressed', 'true');
    divineProfile(profileFromEntry(initEntry));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
