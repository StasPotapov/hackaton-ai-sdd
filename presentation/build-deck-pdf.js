// Сборка email-package/GigaSpec-Pitch-Deck.pdf из интерактивной HTML-деки.
//
// Дека проявляет контент JS-анимациями (карточки, цепочки, pipeline, typed-текст).
// Наивная печать через Chrome даёт пустые/съехавшие блоки, а прогон «по таймингу»
// недетерминирован: на неудачном прогоне карточка не успевает доиграть rise и едет.
// Поэтому перед печатью состояние ДЕТЕРМИНИРОВАННО доводится до финального —
// и через DOM (классы .show/.cascade, counts, typed-текст), и через CSS-форс
// (opacity:1 / transform:none на всех анимируемых элементах). Тяжёлый blur-фон
// (аура) заменяется на векторный градиент того же вида — вес ~1–2 МБ вместо ~12.
//
// Требования: Google Chrome (macOS) + puppeteer-core (см. package.json).
// Запуск из папки presentation/:
//   npm install          # разово — ставит puppeteer-core в presentation/node_modules
//   npm run build:deck   # либо: node build-deck-pdf.js
// Обе PDF сразу: npm run build  (или ./build-email-package.sh).
// Путь к Chrome можно переопределить через CHROME_BIN.

const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DECK = 'file://' + path.join(__dirname, 'gigaspec-pitch-deck.html');
const OUT = path.join(__dirname, '..', 'email-package', 'GigaSpec-Pitch-Deck.pdf');
const W = 1600, H = 900;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  await page.goto(DECK, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  const n = await page.evaluate(() => document.querySelectorAll('.slide').length);
  console.log('слайдов:', n);

  // Прогоняем каждый слайд — чтобы pipeline отрисовал стадии, а typeText/counts
  // запустились штатно. Тайминг здесь НЕ критичен: финал добивается ниже форсом.
  for (let k = 0; k < n; k++) {
    const kind = await page.evaluate((i) => {
      go(i);
      const s = document.querySelectorAll('.slide')[i];
      return s.querySelector('.pipeline') ? 'pipeline' : 'plain';
    }, k);
    await sleep(kind === 'pipeline' ? 4500 : 900);
  }

  // ДЕТЕРМИНИРОВАННАЯ финализация всего динамического контента (не по таймингу).
  await page.evaluate(() => {
    // счётчики → конечное значение (el._tok++ гасит активный countUp, иначе
    // requestAnimationFrame перезапишет наше значение обратно на промежуточное)
    document.querySelectorAll('.count').forEach(el => { el._tok = (el._tok | 0) + 1; if (el.dataset.to) el.textContent = el.dataset.to; });
    // печатаемый текст → полный (el._tok++ гасит активный typeText — иначе он
    // допечатывает свой частичный кадр поверх, обрезая текст на «--ini»)
    document.querySelectorAll('[data-type]').forEach(el => { el._tok = (el._tok | 0) + 1; if (el.dataset.type) el.textContent = el.dataset.type; });
    // цепочки → нейтральное состояние (как в HTML): ноды видимы без .seq,
    // стрелки серые без зелёной glow-подсветки (её даёт .seq/.show — убираем).
    document.querySelectorAll('.chain').forEach(c => {
      c.classList.remove('seq');
      c.querySelectorAll('.node, .arrow').forEach(k => k.classList.remove('show'));
    });
    // каскадные списки → раскрыты
    document.querySelectorAll('.clist').forEach(c => c.classList.add('cascade'));
    // pipeline → все стадии в спокойное «done» (тонкая рамка + ✓), без бегающей
    // зелёной glow-рамки активной стадии (.on застревал случайно при уходе).
    document.querySelectorAll('.pipeline .pstage').forEach(s => {
      s.classList.remove('on');
      s.classList.add('done');
      const ps = s.querySelector('.pstate');
      if (ps && s.dataset.done) ps.innerHTML = '<span class="ok">' + s.dataset.done + '</span>';
    });
    document.querySelectorAll('#pipe-dots .sdot').forEach(d => d.classList.add('full'));
    document.querySelectorAll('#pipe-counter').forEach(el => { el.innerHTML = '<span class="ok">Готово ✓</span>'; });
  });
  await sleep(150);

  // Печатный режим: все слайды постранично, скрыть UI-хром, лёгкий векторный фон,
  // + жёсткий форс финального состояния карточек (страховка от недоигранных анимаций).
  await page.addStyleTag({ content: `
    html, body { overflow: visible !important; height: auto !important; }
    #deck { position: static !important; height: auto !important; width: auto !important; }
    #bar, #counter, #hint, #notes { display: none !important; }
    /* Тяжёлый blur-фон (аура) растеризуется на каждой странице → 12MB.
       Заменяем на векторные radial-градиенты того же вида — почти невесомо. */
    .aurora { display: none !important; }
    body {
      background:
        radial-gradient(58% 52% at 6% 2%, rgba(31,138,77,.30), transparent 62%),
        radial-gradient(54% 56% at 97% 100%, rgba(31,109,69,.26), transparent 60%),
        radial-gradient(42% 42% at 80% 26%, rgba(38,64,122,.20), transparent 60%),
        #07080c !important;
    }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    /* карточки/ноды/строки — гарантированно в финальной позиции, без сдвига */
    .card, .tab, .mech { opacity: 1 !important; transform: none !important; animation: none !important; }
    .chain .node, .chain .arrow { opacity: 1 !important; transform: none !important; }
    .clist > div, .clist.cascade > div { opacity: 1 !important; transform: none !important; animation: none !important; }
    /* никаких «бегающих» glow-рамок активной стадии на статичной печати */
    .pstage.on { box-shadow: none !important; border-color: var(--line) !important; }
    /* экранные glow-свечения в статичном PDF застывают в пике и разрастаются
       в «зелёные пятна» на пол-слайда — гасим их (typed-блок, evolve, стрелки). */
    .typed { animation: none !important; box-shadow: none !important; }
    .evolve { animation: none !important; text-shadow: none !important; }
    .chain .node, .chain .arrow, .chain .big { text-shadow: none !important; box-shadow: none !important; }
    .tcur { display: none !important; }
    .slide {
      display: flex !important;
      position: relative !important;
      inset: auto !important;
      width: ${W}px !important;
      height: ${H}px !important;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
      animation: none !important;
    }
    .slide:last-of-type { break-after: auto; page-break-after: auto; }
    @page { size: ${W}px ${H}px; margin: 0; }
  ` });
  await sleep(400);

  await page.pdf({
    path: OUT,
    width: `${W}px`,
    height: `${H}px`,
    printBackground: true,
    pageRanges: `1-${n}`,
    preferCSSPageSize: true,
  });

  await browser.close();
  console.log('→', OUT);
})().catch(e => { console.error(e); process.exit(1); });
