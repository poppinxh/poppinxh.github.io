/* ===========================================================
   字相 · 一字之相   ——  引擎
   一个字 → 形 / 意 / 星；加一日 → 日 / 会 / 卦 → 一页字牒
   =========================================================== */
(function () {
  'use strict';

  const STORE_SHELF = 'zixiang.shelf.v1';
  const STORE_PREF = 'zixiang.pref.v1';
  const SHELF_CAP = 60;

  const $ = function (s, r) { return (r || document).querySelector(s); };
  const $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function mod(a, n) { return ((a % n) + n) % n; }

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

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fillTpl(tpl, ctx) {
    return tpl.replace(/\{(\w+)\}/g, function (m, k) {
      return ctx[k] === undefined ? m : ctx[k];
    });
  }

  /* ---------- 部件 ---------- */
  function compOf(g) {
    const base = COMPONENTS[g];
    if (base) return { g: g, n: base.n, sem: base.sem, s: base.s };
    return { g: g, n: g, sem: 'misc', s: 4, unknown: true };
  }

  function partsOf(ch) {
    const raw = DECOMP[ch];
    return raw ? Array.from(raw) : [ch];
  }

  function semOf(c) { return FIELDS[c.sem] || FIELDS.misc; }

  /* ---------- 五行关系 ---------- */
  function relOf(c1, c2, sameGlyph) {
    if (sameGlyph) return 'die';
    if (c1.sem === c2.sem) return 'tongbu';
    const w1 = semOf(c1).wuxing;
    const w2 = semOf(c2).wuxing;
    if (w1 === w2) return 'tongqi';
    if (SHENG[w1] === w2) return 'sheng';
    if (SHENG[w2] === w1) return 'beisheng';
    if (KE[w1] === w2) return 'ke';
    return 'beike';
  }

  function relOfWx(w1, w2) {
    if (w1 === w2) return 'tongqi';
    if (SHENG[w1] === w2) return 'sheng';
    if (SHENG[w2] === w1) return 'beisheng';
    if (KE[w1] === w2) return 'ke';
    return 'beike';
  }

  /* ---------- 玄空 ---------- */
  function flyPan(center) {
    const pan = {};
    PALACES.forEach(function (p) {
      const step = FLY_ORDER.indexOf(p.name);
      pan[p.name] = mod(center - 1 + (step < 0 ? 0 : step), 9) + 1;
    });
    return pan;
  }

  function starForWx(wx, seed) {
    const pool = [];
    for (let n = 1; n <= 9; n++) if (STARS[n].wx === wx) pool.push(n);
    return pool[hash(String(seed)) % pool.length];
  }

  function yunOf(date) {
    const y = (date || new Date()).getFullYear();
    return mod(Math.floor((y - YUN_START) / 20), 9) + 1;
  }

  function yunStatus(star, yun) {
    if (star === yun) return { text: '当运', tone: 'wang' };
    if (star === (yun === 1 ? 9 : yun - 1)) return { text: '退运', tone: 'tui' };
    if (star === (yun === 9 ? 1 : yun + 1)) return { text: '生气', tone: 'sheng' };
    return { text: '平运', tone: 'ping' };
  }

  function mountainsFor(seed) {
    const i = hash(String(seed) + '#shan') % 24;
    return { sit: MOUNTAINS[i], face: MOUNTAINS[(i + 12) % 24] };
  }

  /* ---------- 历法 ---------- */
  function jdnOf(y, m, d) {
    const a = Math.floor((14 - m) / 12);
    const yy = y + 4800 - a;
    const mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
      Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }

  function yearGanzhi(y) {
    const n = mod(y - 4, 60);
    return { g: n % 10, z: n % 12 };
  }

  /* 五虎遁：甲己之年丙作首 */
  function monthGanzhi(yearG, mz) {
    const start = (yearG % 5) * 2 + 2;
    return { g: mod(start + mod(mz - 2, 12), 10), z: mz };
  }

  function gzIndex(g, z) { return mod(6 * g - 5 * z, 60); }

  function nayinOf(g, z) { return NAYIN[Math.floor(gzIndex(g, z) / 2)] || ''; }

  function jieAt(y, m, d) {
    const jd = jdnOf(y, m, d);
    let cur = null;
    [y - 1, y, y + 1].forEach(function (yy) {
      JIEQI.forEach(function (q) {
        if (!q.jian) return;
        const t = jdnOf(yy, q.m, q.d);
        if (t <= jd && (!cur || t > cur.jd)) cur = { name: q.name, jian: q.jian, jd: t };
      });
    });
    return cur || { name: '大雪', jian: '子', jd: jd };
  }

  function qiAt(y, m, d) {
    const jd = jdnOf(y, m, d);
    let cur = null;
    let next = null;
    [y - 1, y, y + 1].forEach(function (yy) {
      JIEQI.forEach(function (q) {
        const t = jdnOf(yy, q.m, q.d);
        if (t <= jd) { if (!cur || t > cur.jd) cur = { name: q.name, jd: t }; }
        else if (!next || t < next.jd) next = { name: q.name, jd: t };
      });
    });
    return { cur: cur, next: next };
  }

  function dateProfile(y, m, d) {
    const jd = jdnOf(y, m, d);
    const dgz = { g: mod(jd + 9, 10), z: mod(jd + 1, 12) };
    const ygz = yearGanzhi(y);
    const jie = jieAt(y, m, d);
    const mz = Math.max(0, ZHI.indexOf(jie.jian));
    const mgz = monthGanzhi(ygz.g, mz);
    const qi = qiAt(y, m, d);
    return {
      y: y, m: m, d: d, jd: jd,
      yG: ygz.g, yZ: ygz.z, mG: mgz.g, mZ: mz, dG: dgz.g, dZ: dgz.z,
      yearGZ: GAN[ygz.g] + ZHI[ygz.z],
      monthGZ: GAN[mgz.g] + ZHI[mz],
      dayGZ: GAN[dgz.g] + ZHI[dgz.z],
      yearNayin: nayinOf(ygz.g, ygz.z),
      dayNayin: nayinOf(dgz.g, dgz.z),
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

  /* ---------- 卦 ---------- */
  function guaOf(dp, strokes) {
    const yN = dp.yZ + 1;
    const mN = dp.mZ + 1;
    const dN = dp.dZ + 1;
    const sN = strokes || 1;
    const up = mod(yN + mN + dN, 8) || 8;
    const down = mod(yN + mN + dN + sN, 8) || 8;
    const move = mod(yN + mN + dN + sN, 6) || 6;
    const u = BAGUA_ORDER[up - 1];
    const dn = BAGUA_ORDER[down - 1];
    return {
      up: u, down: dn, move: move,
      name: GUA64[u][down - 1],
      upX: BAGUA_XIANG[u], downX: BAGUA_XIANG[dn],
      upD: BAGUA_DE[u], downD: BAGUA_DE[dn]
    };
  }

  /* ---------- 字的档案 ---------- */
  function buildChar(ch) {
    const parts = partsOf(ch);
    const comps = parts.map(compOf);
    const known = comps.filter(function (c) { return !c.unknown; }).length;

    const count = {};
    comps.forEach(function (c) {
      const w = semOf(c).wuxing;
      count[w] = (count[w] || 0) + 1;
    });
    let wx = semOf(comps[0]).wuxing;
    let best = 0;
    Object.keys(count).forEach(function (w) {
      if (count[w] > best) { best = count[w]; wx = w; }
    });

    const strokes = comps.reduce(function (s, c) { return s + (c.s || 4); }, 0);
    const first = semOf(comps[0]);
    const last = semOf(comps[comps.length - 1]);

    const sameGlyph = comps.length === 2 && comps[0].g === comps[1].g;
    const sameSem = comps.every(function (c) { return c.sem === comps[0].sem; });

    let sixshu;
    if (comps.length === 1) sixshu = '独体';
    else if (sameGlyph) sixshu = '叠体';
    else if (sameSem) sixshu = '同部';
    else sixshu = '会意';

    const rng = makeRng(hash(ch));
    const pick = function (arr) { return arr[Math.floor(rng() * arr.length)]; };
    const poetic = pick(first.poetic);

    let relKey = '';
    let relName = '';
    let gloss = '';
    let def = '';

    if (comps.length >= 2) {
      relKey = relOf(comps[0], comps[comps.length - 1], sameGlyph);
      const REL = RELATIONS[relKey];
      relName = REL.name;
      let n1 = pick(first.nouns);
      let n2 = pick(last.nouns);
      if (n1 === n2 && first.nouns.length > 1) {
        n1 = first.nouns[(first.nouns.indexOf(n1) + 1) % first.nouns.length];
      }
      const ctx = { n1: n1, n2: n2, f1: first.feel, f2: last.feel, wx: wx };
      gloss = fillTpl(pick(REL.gloss), ctx);
      def = fillTpl(pick(REL.def), ctx);
    } else {
      gloss = '此字独体，取象于' + first.label + '。';
      def = '一体无拆，' + first.feel + '意最纯，不成字内之争。';
    }

    const star = starForWx(wx, ch);
    const S = STARS[star];
    const mount = mountainsFor(ch);

    return {
      ch: ch,
      parts: parts,
      comps: comps,
      names: comps.map(function (c) { return c.n; }).join('、'),
      strokes: strokes,
      wx: wx,
      semLabel: first.label,
      feel: first.feel,
      sixshu: sixshu,
      relKey: relKey,
      relName: relName,
      gloss: gloss,
      def: def,
      poetic: poetic,
      known: known,
      partial: known < comps.length,
      star: star,
      starName: S.name,
      starAlias: S.alias,
      starWx: S.wx,
      starLuck: S.luck,
      starGov: S.gov,
      starGood: S.good,
      pan: flyPan(star),
      sit: mount.sit,
      face: mount.face
    };
  }

  /* ---------- 日与字相会 ---------- */
  const SAY = {
    sheng: function (d, c) { return '今日之' + d + '生此字之' + c + '，是得势的一天，做什么都顺半拍。'; },
    beisheng: function (d, c) { return '此字之' + c + '生今日之' + d + '，要出力，出完才落得下。'; },
    ke: function (d, c) { return '今日之' + d + '克此字之' + c + '，压得住，但该守，不宜硬进。'; },
    beike: function (d, c) { return '此字之' + c + '克今日之' + d + '，能破，宜进，趁势把话说完。'; },
    tongqi: function (d) { return '今日与此字同属' + d + '，同类相求，不必解释也懂。'; }
  };

  function zhiSayOf(dp) {
    const dz = ZHI[dp.dZ];
    const mz = ZHI[dp.mZ];
    if (dz === ZHI_CHONG[mz]) return '日支' + dz + '与月建' + mz + '相冲，事有反复，话容易说岔。';
    if (dz === ZHI_HE[mz]) return '日支' + dz + '与月建' + mz + '六合，今日所遇多能成局。';
    if (dz === ZHI_HAI[mz]) return '日支' + dz + '与月建' + mz + '相害，小事被人磨，别较真。';
    return '日支与月建各安其位，没有特别的拉扯。';
  }

  function buildDie(c, dp) {
    const yun = yunOf(dp ? new Date(dp.y, dp.m - 1, dp.d) : new Date());
    const ys = yunStatus(c.star, yun);

    if (!dp) {
      return {
        c: c, dp: null, yun: yun, yunInfo: ys,
        verdict: '「' + c.ch + '」属' + c.wx + '，入' + c.starName + c.starAlias + '，' + ys.text +
          '。' + c.poetic
      };
    }

    const dayGanWx = GAN_WX[dp.dG];
    const rel = relOfWx(dayGanWx, c.wx);
    const gua = guaOf(dp, c.strokes);
    const say = SAY[rel](dayGanWx, c.wx);

    const sanhe = SAN_HE.filter(function (g) {
      return g.zhi.indexOf(ZHI[dp.dZ]) >= 0 && g.zhi.indexOf(ZHI[dp.mZ]) >= 0;
    })[0];

    return {
      c: c, dp: dp, yun: yun, yunInfo: ys,
      gua: gua,
      dayGanWx: dayGanWx,
      dayZhiWx: ZHI_WX[dp.dZ],
      rel: rel,
      say: say,
      zhiSay: zhiSayOf(dp) + (sanhe ? '日支与月建同入' + sanhe.zhi.join('') + '局，成' + sanhe.wx + '气。' : ''),
      verdict: '「' + gua.name + '」' + YAO_WEI[gua.move - 1] + '。' + say
    };
  }

  /* ---------- 渲染 ---------- */
  const GRID =
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<line x1="50" y1="0" x2="50" y2="100" stroke-dasharray="3 3"/>' +
    '<line x1="0" y1="50" x2="100" y2="50" stroke-dasharray="3 3"/>' +
    '<line x1="0" y1="0" x2="100" y2="100" stroke-dasharray="3 3" opacity=".45"/>' +
    '<line x1="100" y1="0" x2="0" y2="100" stroke-dasharray="3 3" opacity=".45"/>' +
    '</svg>';

  function blk(no, title, inner) {
    return '<section class="blk"><h3><i>' + no + '</i>' + title + '</h3>' + inner + '</section>';
  }

  function renderDie(r) {
    const c = r.c;
    const dp = r.dp;
    const parts = [];
    const id = c.ch + '|' + (dp ? dp.y + '-' + pad2(dp.m) + '-' + pad2(dp.d) : '');

    parts.push(
      '<article class="die">' +
        '<div class="die__left">' +
          '<div class="glyph" role="img" aria-label="' + esc(c.ch) + '">' + GRID +
            '<span>' + esc(c.ch) + '</span></div>' +
          '<div class="die__facts">' +
            '<div><span>部件</span><b>' + c.parts.map(function (p) { return esc(p); }).join('') + '</b></div>' +
            '<div><span>笔画</span><b>' + c.strokes + '</b></div>' +
            '<div><span>五行</span><b>' + c.wx + '</b></div>' +
            '<div><span>六书</span><b>' + c.sixshu + '</b></div>' +
          '</div>' +
          '<p class="die__verse">' + esc(c.gloss) + '</p>' +
          '<div class="seal" aria-hidden="true">字相</div>' +
        '</div>' +
        '<div class="die__right">' +
          '<p class="die__kicker">字牒 · ' +
            (dp ? dp.y + '.' + pad2(dp.m) + '.' + pad2(dp.d) : '仅解字') + '</p>' +
          '<h2 class="die__title">' + esc(c.ch) + '</h2>' +
          '<p class="die__sub">' + c.names + ' · 主' + c.semLabel + ' · 属' + c.wx +
            (c.relName ? ' · ' + c.relName : '') + '</p>'
    );

    /* 壹 形 */
    parts.push(blk('壹', '形',
      '<p>拆作 <em>' + c.parts.map(function (p) { return esc(p); }).join(' · ') + '</em>' +
        (c.partial ? '（其中部件未录，按整字取象）' : '') + '</p>' +
      '<p>' + c.sixshu + '，' + c.strokes + '画。构件笔画累加，与标准笔画或有出入。</p>'
    ));

    /* 貳 意 */
    parts.push(blk('貳', '意',
      '<p><b>' + c.gloss + '</b></p>' +
      '<p>' + c.def + '</p>' +
      '<p class="quote">「' + c.poetic + '」</p>'
    ));

    /* 叁 星 */
    let pan = '';
    PALACES.forEach(function (p) {
      const n = c.pan[p.name];
      const S = STARS[n] || STARS[1];
      pan += '<div class="pan__cell' +
        (p.name === '中' ? ' pan__cell--center' : '') +
        (S.good ? '' : ' pan__cell--bad') + '" title="' + p.name + '宫 ' + S.name + '">' +
        n + '<i>' + p.name + '</i></div>';
    });

    parts.push(blk('叁', '星',
      '<p>' + c.starName + ' ' + c.starAlias + ' · 属' + c.starWx + ' · ' + c.starLuck +
        ' · 主' + c.starGov + '</p>' +
      '<div class="pan">' +
        '<div class="pan__grid" role="img" aria-label="九宫飞星盘，' + c.starName + '入中">' + pan + '</div>' +
        '<p class="pan__note">' + c.starName + '入中，顺飞九宫。<br>' +
          r.yun + '运 ' + r.yunInfo.text + ' · 坐' + c.sit + '向' + c.face + '</p>' +
      '</div>'
    ));

    if (dp) {
      /* 肆 日 */
      parts.push(blk('肆', '日',
        '<p><em>' + dp.yearGZ + '</em>年 · <em>' + dp.monthGZ + '</em>月 · <em>' + dp.dayGZ + '</em>日</p>' +
        '<p>' + dp.jieName + '后第 ' + (dp.jieDays + 1) + ' 天；' + dp.qiName + '后第 ' +
          (dp.qiDays + 1) + ' 天，距' + dp.nextQi + '还有 ' + dp.nextQiDays + ' 天。</p>' +
        '<p>年纳音 ' + dp.yearNayin + '，日纳音 ' + dp.dayNayin + '。' + dp.jian + '月，当值' +
          dp.shixiao + '卦。</p>'
      ));

      /* 伍 会 */
      parts.push(blk('伍', '会',
        '<p>日干属' + r.dayGanWx + '、日支属' + r.dayZhiWx + '，此字属' + c.wx + '。</p>' +
        '<p><b>' + r.say + '</b></p>' +
        '<p>' + r.zhiSay + '</p>'
      ));

      /* 陸 卦 */
      const g = r.gua;
      parts.push(blk('陸', '卦',
        '<p>上<em>' + g.up + '</em>（' + g.upX + '）下<em>' + g.down + '</em>（' + g.downX + '）：<b>' +
          g.name + '</b>卦，动第 ' + g.move + ' 爻。</p>' +
        '<p>' + (g.up === g.down
          ? '两' + g.upX + '相重，' + g.upD + '上加' + g.upD + '。'
          : g.upX + '在' + g.downX + '上，' + g.upD + '以' + g.downD + '。') + '</p>'
      ));
    }

    parts.push(
          '<p class="die__verdict">' + r.verdict + '</p>' +
          '<div class="die__acts">' +
            '<button class="act act--main" type="button" data-act="save">存进字牒册</button>' +
            '<button class="act" type="button" data-act="export">导出字牒</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );

    el.sheet.innerHTML = parts.join('');
    state.current = { r: r, id: id };
    syncShelfBtn();
  }

  function renderEmpty() {
    el.sheet.innerHTML =
      '<div class="empty">' +
        '<b>相</b>' +
        '<span>写下两个字中的一个——先写一个字。</span>' +
      '</div>';
  }

  /* ---------- 字牒册 ---------- */
  function loadShelf() {
    try {
      const raw = localStorage.getItem(STORE_SHELF);
      const arr = raw ? JSON.parse(raw) : [];
      state.shelf = Array.isArray(arr) ? arr.filter(function (x) { return x && x.ch; }) : [];
    } catch (e) { state.shelf = []; }
  }

  function saveShelf() {
    try {
      localStorage.setItem(STORE_SHELF, JSON.stringify(state.shelf.slice(0, SHELF_CAP)));
    } catch (e) { /* 忽略 */ }
  }

  function syncShelfBtn() {
    el.shelfCount.textContent = String(state.shelf.length);
    el.clearShelf.hidden = state.shelf.length === 0;
  }

  function renderShelf() {
    syncShelfBtn();
    if (!state.shelf.length) {
      el.shelfGrid.innerHTML = '<div class="shelf__empty">还空着。看完一个字，可以存进来。</div>';
      return;
    }
    el.shelfGrid.innerHTML = state.shelf.map(function (item) {
      const when = item.date
        ? item.date.split('-').slice(1).join('.')
        : '仅解';
      return '<div class="card" role="button" tabindex="0" data-id="' + esc(item.id) + '">' +
          '<span class="card__char">' + esc(item.ch) + '</span>' +
          '<span class="card__meta">' + esc(when) + '</span>' +
          '<button class="card__del" type="button" data-del="' + esc(item.id) + '" ' +
            'aria-label="删除">×</button>' +
        '</div>';
    }).join('');
  }

  function shelfAdd(r) {
    const dp = r.dp;
    const date = dp ? dp.y + '-' + pad2(dp.m) + '-' + pad2(dp.d) : '';
    const item = { id: r.c.ch + '|' + date, ch: r.c.ch, date: date };
    if (state.shelf.some(function (x) { return x.id === item.id; })) {
      toast('这一页已在字牒册里');
      return;
    }
    state.shelf.unshift(item);
    if (state.shelf.length > SHELF_CAP) state.shelf.length = SHELF_CAP;
    saveShelf();
    renderShelf();
    toast('已存进字牒册');
    chime(1400);
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
      const base = 392 * Math.pow(2, ((seed >>> 0) % 7) / 12);
      [1, 1.26].forEach(function (m, i) {
        const t = audioCtx.currentTime + i * 0.07;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = base * m;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.55);
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
    toastTimer = setTimeout(function () { toastEl.dataset.show = 'false'; }, 2200);
  }

  /* ---------- 导出 ---------- */
  function wrapText(ctx, text, x, y, maxW, lh) {
    let line = '';
    for (let i = 0; i < text.length; i++) {
      const test = line + text[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        y += lh;
        line = text[i];
      } else { line = test; }
    }
    if (line) { ctx.fillText(line, x, y); y += lh; }
    return y;
  }

  function exportDie(r) {
    const cv = el.canvas;
    const W = cv.width;
    const H = cv.height;
    const ctx = cv.getContext('2d');
    const PAPER = '#f7f2e7';
    const INK = '#1a1814';
    const SOFT = '#565045';
    const ACC = '#a63a2b';
    const DIM = '#8a8172';
    const SERIF = '"Songti SC","STSong","Noto Serif SC","SimSun",serif';
    const MONO = 'ui-monospace, Consolas, monospace';
    const c = r.c;
    const dp = r.dp;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = ACC;
    ctx.lineWidth = 3;
    ctx.strokeRect(44, 44, W - 88, H - 88);
    ctx.strokeStyle = 'rgba(166,58,43,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(58, 58, W - 116, H - 116);

    ctx.textAlign = 'center';
    ctx.fillStyle = DIM;
    ctx.font = '20px ' + MONO;
    ctx.fillText('字 相 · 一 字 之 相', W / 2, 118);

    /* 字框 */
    const box = 430;
    const bx = (W - box) / 2;
    const by = 170;
    ctx.fillStyle = '#ece4d2';
    ctx.fillRect(bx, by, box, box);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(26,24,20,0.2)';
    ctx.beginPath();
    ctx.moveTo(bx + box / 2, by); ctx.lineTo(bx + box / 2, by + box);
    ctx.moveTo(bx, by + box / 2); ctx.lineTo(bx + box, by + box / 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = INK;
    ctx.textBaseline = 'middle';
    ctx.font = '600 ' + Math.round(box * 0.72) + 'px ' + SERIF;
    ctx.fillText(c.ch, bx + box / 2, by + box * 0.53);
    ctx.textBaseline = 'alphabetic';

    /* 拆字与规格 */
    ctx.textAlign = 'center';
    ctx.fillStyle = SOFT;
    ctx.font = '24px ' + SERIF;
    ctx.fillText(c.parts.join(' · ') + '　' + c.sixshu + '　' + c.strokes + '画　属' + c.wx,
      W / 2, by + box + 56);

    /* 日 */
    let y = by + box + 104;
    if (dp) {
      ctx.fillStyle = ACC;
      ctx.font = '600 30px ' + SERIF;
      ctx.fillText(dp.yearGZ + '年 ' + dp.monthGZ + '月 ' + dp.dayGZ + '日', W / 2, y);
      ctx.fillStyle = DIM;
      ctx.font = '19px ' + SERIF;
      ctx.fillText(dp.jieName + '后第 ' + (dp.jieDays + 1) + ' 天 · 日纳音 ' +
        dp.dayNayin + ' · ' + dp.jian + '月值' + dp.shixiao + '卦', W / 2, y + 34);
      y += 34;
    }

    /* 卦 */
    if (r.gua) {
      ctx.fillStyle = DIM;
      ctx.font = '19px ' + SERIF;
      ctx.fillText('上' + r.gua.up + '下' + r.gua.down + ' · 第' + r.gua.move + '爻动', W / 2, y + 38);
      ctx.fillStyle = INK;
      ctx.font = '600 44px ' + SERIF;
      ctx.fillText(r.gua.name + '卦', W / 2, y + 96);
      y += 96;
    } else {
      ctx.fillStyle = INK;
      ctx.font = '600 40px ' + SERIF;
      ctx.fillText(c.starName + c.starAlias, W / 2, y + 60);
      y += 60;
    }

    /* 断语 */
    ctx.textAlign = 'left';
    ctx.fillStyle = SOFT;
    ctx.font = '23px ' + SERIF;
    const left = 104;
    y = wrapText(ctx, r.verdict, left, y + 70, W - left * 2, 38);

    /* 印 */
    ctx.save();
    ctx.translate(bx + box - 26, by + box - 26);
    ctx.rotate(-0.05);
    ctx.fillStyle = 'rgba(166,58,43,0.92)';
    ctx.fillRect(-42, -42, 84, 84);
    ctx.fillStyle = PAPER;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 30px ' + SERIF;
    ctx.fillText('相', 0, -14);
    ctx.font = '600 16px ' + SERIF;
    ctx.fillText('字', 0, 20);
    ctx.restore();

    /* 页脚 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = DIM;
    ctx.font = '17px ' + MONO;
    const d = new Date();
    ctx.fillText('于 ' + d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate()) + ' 相之',
      W / 2, H - 92);
    ctx.fillStyle = ACC;
    ctx.font = '600 17px ' + MONO;
    ctx.fillText('Z I   X I A N G', W / 2, H - 66);

    cv.toBlob(function (blob) {
      if (!blob) { toast('导出失败，换个浏览器试试'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '字牒-' + c.ch + (dp ? '-' + dp.y + pad2(dp.m) + pad2(dp.d) : '') + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      toast('字牒已导出');
    }, 'image/png');
  }

  /* ---------- 状态 ---------- */
  const el = {
    sheet: $('#sheet'),
    chInput: $('#chInput'),
    dateInput: $('#dateInput'),
    askBtn: $('#askBtn'),
    sampleBtn: $('#sampleBtn'),
    dateToggle: $('#dateToggle'),
    shelf: $('#shelf'),
    shelfBtn: $('#shelfBtn'),
    shelfCount: $('#shelfCount'),
    shelfGrid: $('#shelfGrid'),
    clearShelf: $('#clearShelf'),
    soundBtn: $('#soundBtn'),
    themeBtn: $('#themeBtn'),
    canvas: $('#exportCanvas')
  };

  const state = { current: null, shelf: [] };
  const prefs = { theme: 'light', sound: true };

  /* ---------- 主题与偏好 ---------- */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    el.themeBtn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
    el.themeBtn.textContent = t === 'dark' ? '☀' : '☾';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#100e0b' : '#efe8da');
  }

  function loadPref() {
    try {
      const raw = localStorage.getItem(STORE_PREF);
      if (!raw) return false;
      const p = JSON.parse(raw);
      prefs.theme = p.theme === 'dark' ? 'dark' : 'light';
      prefs.sound = p.sound !== false;
      return true;
    } catch (e) { return false; }
  }

  function savePref() {
    try { localStorage.setItem(STORE_PREF, JSON.stringify(prefs)); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 问字 ---------- */
  function lastCjk(str) {
    const m = String(str || '').match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
    return m ? m[m.length - 1] : '';
  }

  function runAsk(ch) {
    const ch2 = ch || lastCjk(el.chInput.value);
    if (!ch2) {
      toast('先写一个字');
      el.chInput.focus();
      return;
    }
    el.chInput.value = ch2;

    const v = (el.dateInput && el.dateInput.value) || '';
    let dp = null;
    if (v) {
      const bits = v.split('-').map(Number);
      if (bits[0] && bits[1] && bits[2]) dp = dateProfile(bits[0], bits[1], bits[2]);
    }

    const r = buildDie(buildChar(ch2), dp);
    renderDie(r);
    chime(hash(ch2));
  }

  /* ---------- 起手 ---------- */
  function init() {
    const had = loadPref();
    if (!had) {
      prefs.theme = (window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    applyTheme(prefs.theme);
    el.soundBtn.setAttribute('aria-pressed', prefs.sound ? 'true' : 'false');

    const today = new Date();
    el.dateInput.value = today.getFullYear() + '-' + pad2(today.getMonth() + 1) +
      '-' + pad2(today.getDate());

    loadShelf();
    renderShelf();

    /* 起手先解一个字，别让页面空着 */
    runAsk('明');

    el.askBtn.addEventListener('click', function () { runAsk(); });

    el.chInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); runAsk(); }
    });

    el.dateInput.addEventListener('change', function () {
      if (state.current) runAsk(state.current.r.c.ch);
    });

    el.sampleBtn.addEventListener('click', function () {
      const pool = SAMPLES.filter(function (x) { return x !== (state.current && state.current.r.c.ch); });
      runAsk(pool[Math.floor(Math.random() * pool.length)]);
      el.chInput.blur();
    });

    if (el.dateToggle) {
      el.dateToggle.addEventListener('click', function () {
        if (el.dateInput.value) {
          el.dateInput.value = '';
          el.dateToggle.textContent = '填今日';
        } else {
          const t = new Date();
          el.dateInput.value = t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
          el.dateToggle.textContent = '清空日期';
        }
        if (state.current) runAsk(state.current.r.c.ch);
      });
    }

    el.sheet.addEventListener('click', function (ev) {
      const btn = ev.target.closest('[data-act]');
      if (!btn || !state.current) return;
      if (btn.dataset.act === 'save') shelfAdd(state.current.r);
      else if (btn.dataset.act === 'export') exportDie(state.current.r);
    });

    el.shelfBtn.addEventListener('click', function () {
      const open = !el.shelf.hidden;
      el.shelf.hidden = open;
      el.shelfBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (!open) el.shelf.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    el.shelfGrid.addEventListener('click', function (ev) {
      const del = ev.target.closest('[data-del]');
      if (del) {
        ev.stopPropagation();
        state.shelf = state.shelf.filter(function (x) { return x.id !== del.dataset.del; });
        saveShelf();
        renderShelf();
        toast('已移出字牒册');
        return;
      }
      const card = ev.target.closest('.card');
      if (!card) return;
      const item = state.shelf.filter(function (x) { return x.id === card.dataset.id; })[0];
      if (!item) return;
      el.chInput.value = item.ch;
      el.dateInput.value = item.date || '';
      if (el.dateToggle) el.dateToggle.textContent = item.date ? '清空日期' : '填今日';
      runAsk(item.ch);
      el.sheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    el.shelfGrid.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const card = ev.target.closest('.card');
      if (!card || ev.target.closest('[data-del]')) return;
      ev.preventDefault();
      card.click();
    });

    el.clearShelf.addEventListener('click', function () {
      if (!state.shelf.length) return;
      if (!window.confirm('清空整本字牒册？不可撤销。')) return;
      state.shelf = [];
      saveShelf();
      renderShelf();
      toast('字牒册已清空');
    });

    el.soundBtn.addEventListener('click', function () {
      prefs.sound = !prefs.sound;
      el.soundBtn.setAttribute('aria-pressed', prefs.sound ? 'true' : 'false');
      savePref();
      if (prefs.sound) { chime(1200); toast('音效已开'); }
      else toast('音效已关');
    });

    el.themeBtn.addEventListener('click', function () {
      prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
      applyTheme(prefs.theme);
      savePref();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
