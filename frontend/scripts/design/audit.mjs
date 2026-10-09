/**
 * Design instrumentation for the 一触 frontend.
 *
 * The reviewing model has no image input, so "looking at the design" is done
 * by measurement instead of by eye:
 *   - contrast, type scale, tap targets, overflow, alignment edges,
 *     heading order, motion budget, colour census  (audit JSON)
 *   - the visual tree dumped as text with geometry + type (an outline you can read)
 *
 * Colours are resolved through a canvas so Tailwind v4 `oklch()` values are
 * handled correctly rather than silently dropped.
 *
 * Usage: node scripts/design/audit.mjs <outDir> [routeKey ...]
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.PREVIEW_BASE ?? 'http://127.0.0.1:5173';
const API = process.env.PREVIEW_API ?? 'http://127.0.0.1:8000';
const OUT = process.argv[2] ?? 'audit';
const only = process.argv.slice(3);

const ROUTES = {
  login: { path: '/', auth: false },
  capture: { path: '/capture' },
  review: { path: '/review' },
  words: { path: '/words' },
  wordDetail: { path: '/words/6' },
  kaoyan: { path: '/kaoyan' },
  settings: { path: '/settings' },
};

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  // hasTouch matters: several components size themselves off `pointer: coarse`,
  // so a mobile audit that reports a mouse pointer measures the wrong CSS.
  mobile: { width: 390, height: 844, hasTouch: true, isMobile: true },
};

const MEASURE = () => {
  /* ── colour: resolve anything (oklch included) to sRGB via canvas ── */
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const colorCache = new Map();
  const toRgb = (str) => {
    if (!str || str === 'none') return null;
    if (colorCache.has(str)) return colorCache.get(str);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#010203';
    ctx.fillStyle = str;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    let v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    if (v.r === 1 && v.g === 2 && v.b === 3) v = null; // invalid value kept the sentinel
    colorCache.set(str, v);
    return v;
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const composite = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const contrast = (a, b) => {
    const la = lum(a);
    const lb = lum(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  const gradientStops = (image) => {
    const out = [];
    const re = /(oklch|oklab|lch|lab|color|rgba?|hsla?|hwb)\([^()]*(?:\([^()]*\)[^()]*)*\)|#[0-9a-fA-F]{3,8}\b/g;
    const found = image.match(re);
    if (found) for (const f of found) { const v = toRgb(f); if (v) out.push(v); }
    return out;
  };

  /** Effective background behind an element: composite solid layers, note gradients. */
  const bgOf = (el) => {
    let node = el;
    let acc = null;
    const stops = [];
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && stops.length === 0) {
        stops.push(...gradientStops(cs.backgroundImage));
      }
      const c = toRgb(cs.backgroundColor);
      if (c && c.a > 0.001) {
        acc = acc ? composite(acc, c) : c;
        if (acc.a >= 0.999) return { color: acc, stops, source: node.tagName.toLowerCase() };
      }
      node = node.parentElement;
    }
    return { color: acc ?? { r: 255, g: 255, b: 255, a: 1 }, stops, source: 'root' };
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const texts = [];
  const typeCensus = new Map();
  const colors = new Map();
  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (hasOwnText(el)) {
      const fg = toRgb(cs.color);
      const bg = bgOf(el);
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
      let ratio = null;
      let bgLabel = hex(bg.color);
      if (fg) {
        if (bg.stops.length > 0 && bg.source === 'root') {
          ratio = Math.min(...bg.stops.map((s) => contrast(composite(fg, s), s)));
          bgLabel = `gradient(${bg.stops.map(hex).join('>')})`;
        } else {
          ratio = contrast(composite(fg, bg.color), bg.color);
        }
      }
      texts.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className ?? '').slice(0, 70),
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 64),
        size, weight,
        lh: cs.lineHeight, ls: cs.letterSpacing,
        color: fg ? hex(fg) : 'none',
        bg: bgLabel,
        ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
        required: isLarge ? 3 : 4.5,
        x: Math.round(rect.left), y: Math.round(rect.top + scrollY),
        w: Math.round(rect.width), h: Math.round(rect.height),
        charsPerLine: Math.round(rect.width / (size * 0.5)),
        aboveFold: rect.top < innerHeight,
      });
      bump(typeCensus, `${size}px/${weight} · ${cs.fontFamily.split(',')[0].replace(/"/g, '')} · ls ${cs.letterSpacing} · lh ${cs.lineHeight}`);
      if (fg) bump(colors, hex(fg));
    }
    for (const prop of ['backgroundColor', 'borderTopColor', 'borderBottomColor', 'outlineColor']) {
      const raw = cs[prop];
      const c = toRgb(raw);
      if (c && c.a > 0.02 && raw !== 'rgba(0, 0, 0, 0)') bump(colors, hex(c));
    }
  }

  const targets = [];
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])')) {
    if (!visible(el)) continue;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === 'none' || el.type === 'hidden') continue;
    if (String(el.className ?? '').includes('sr-only')) continue;
    targets.push({
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute('aria-label') || el.textContent.trim().replace(/\s+/g, ' ') || el.getAttribute('placeholder') || '').slice(0, 42),
      w: Math.round(rect.width), h: Math.round(rect.height),
      x: Math.round(rect.left), y: Math.round(rect.top + scrollY),
    });
  }

  const overflow = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (!hasOwnText(el)) continue; // absolutely positioned badges legitimately stick out
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'visible' && cs.textOverflow !== 'ellipsis') {
      overflow.push({
        tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 70),
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40),
      });
    }
  }

  const edges = new Map();
  for (const t of texts) { if (t.w < 12) continue; edges.set(t.x, (edges.get(t.x) ?? 0) + 1); }

  const blocks = [...document.querySelectorAll('main *, nav *, form > *')]
    .filter(visible)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { y: Math.round(r.top + scrollY), h: Math.round(r.height) };
    })
    .filter((b) => b.h > 8)
    .sort((a, b) => a.y - b.y);
  const gaps = [];
  for (let i = 1; i < blocks.length; i += 1) {
    const g = blocks[i].y - (blocks[i - 1].y + blocks[i - 1].h);
    if (g > 0 && g < 300) gaps.push(g);
  }

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((h) => ({
    level: Number(h.tagName[1]), text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 48),
    size: parseFloat(getComputedStyle(h).fontSize),
  }));

  const images = [...document.querySelectorAll('img')].filter(visible).map((i) => ({
    src: i.currentSrc.slice(-44), alt: i.getAttribute('alt'), w: Math.round(i.getBoundingClientRect().width),
  }));

  const focusProbe = [];
  for (const probe of [...document.querySelectorAll('button:not([disabled]), a[href], input:not([type=hidden])')].slice(0, 14)) {
    probe.focus();
    const cs = getComputedStyle(probe);
    focusProbe.push({
      tag: probe.tagName.toLowerCase(),
      label: (probe.getAttribute('aria-label') || probe.textContent.trim()).slice(0, 24),
      focused: document.activeElement === probe,
      outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
      boxShadow: cs.boxShadow.slice(0, 70),
    });
  }
  document.activeElement?.blur?.();

  const motion = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.transitionDuration && cs.transitionDuration !== '0s') {
      bump(motion, `transition ${cs.transitionDuration} [${cs.transitionProperty.slice(0, 44)}] ${cs.transitionTimingFunction.slice(0, 30)}`);
    }
    if (cs.animationName && cs.animationName !== 'none') {
      bump(motion, `animation ${cs.animationDuration} ${cs.animationName} ${cs.animationTimingFunction.slice(0, 24)}`);
    }
  }

  const radii = new Map();
  const shadows = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.borderTopLeftRadius !== '0px') bump(radii, cs.borderTopLeftRadius);
    if (cs.boxShadow !== 'none') bump(shadows, cs.boxShadow.slice(0, 90));
  }

  return {
    viewport: { w: innerWidth, h: innerHeight },
    docHeight: document.documentElement.scrollHeight,
    docOverflow: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    texts, targets, overflow,
    alignment: [...edges.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([x, count]) => ({ x, count })),
    gaps: [...new Set(gaps)].map((g) => ({ gap: g, count: gaps.filter((x) => x === g).length })).sort((a, b) => b.count - a.count).slice(0, 16),
    headings, images, focusProbe,
    motion: [...motion.entries()].map(([spec, count]) => ({ spec, count })).sort((a, b) => b.count - a.count).slice(0, 22),
    colors: [...colors.entries()].sort((a, b) => b[1] - a[1]).map(([color, n]) => ({ color, n })),
    typeCensus: [...typeCensus.entries()].sort((a, b) => b[1] - a[1]).map(([spec, n]) => ({ spec, n })),
    radii: [...radii.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([r, n]) => ({ r, n })),
    shadows: [...shadows.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, n]) => ({ s, n })),
  };
};

const OUTLINE = () => {
  const lines = [];
  const walk = (el, depth) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    const interesting =
      own.length > 0 ||
      ['IMG', 'CANVAS', 'SVG', 'INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA', 'H1', 'H2', 'H3'].includes(el.tagName) ||
      r.height > 60;
    if (interesting) {
      const pad = '  '.repeat(depth);
      const size = Math.round(parseFloat(cs.fontSize));
      const label = own ? `"${own.replace(/\s+/g, ' ').slice(0, 60)}"` : el.tagName.toLowerCase();
      lines.push(
        `${pad}${String(Math.round(r.top + scrollY)).padStart(5)}y ${String(Math.round(r.left)).padStart(4)}x ` +
        `${String(Math.round(r.width)).padStart(4)}×${String(Math.round(r.height)).padStart(4)} ` +
        `${String(size).padStart(3)}px/${String(cs.fontWeight).padStart(3)} ${el.tagName.toLowerCase().padEnd(6)} ${label}`,
      );
    }
    for (const child of el.children) walk(child, depth + (interesting ? 1 : 0));
  };
  walk(document.body, 0);
  return lines.join('\n');
};

// A signed-in preview account is needed to audit authenticated routes. The
// credentials come from the environment so they never live in the repository.
const PREVIEW_USER = process.env.PREVIEW_USER ?? 'designer';
const PREVIEW_PASSWORD = process.env.PREVIEW_PASSWORD;

const login = async () => {
  if (!PREVIEW_PASSWORD) {
    throw new Error(
      'Set PREVIEW_USER / PREVIEW_PASSWORD to the credentials of a local preview account.',
    );
  }
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: PREVIEW_USER, password: PREVIEW_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.json();
};

const session = await login();
const keys = (only.length ? only : Object.keys(ROUTES)).filter((k) => k in ROUTES);
await mkdir(OUT, { recursive: true });

const storageState = {
  cookies: [],
  origins: [{
    origin: BASE,
    localStorage: [{
      name: 'glm-words-auth',
      value: JSON.stringify({
        state: { token: session.token, userId: session.user_id, username: session.username, role: session.role },
        version: 0,
      }),
    }],
  }],
};

const browser = await chromium.launch({ channel: 'chrome' });
const summary = [];

for (const [vpName, size] of Object.entries(VIEWPORTS)) {
  for (const key of keys) {
    const route = ROUTES[key];
    const context = await browser.newContext({
      // hasTouch/isMobile are context options, not viewport members — nesting
      // them silently runs the "mobile" audit with a mouse pointer.
      viewport: { width: size.width, height: size.height },
      hasTouch: size.hasTouch ?? false,
      isMobile: size.isMobile ?? false,
      deviceScaleFactor: 1, locale: 'zh-CN',
      storageState: route.auth === false ? undefined : storageState,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const variants = [['default', async () => {}]];
    if (key === 'review') {
      variants.push(['flipped', async () => { await page.getByRole('button', { name: /show answer/i }).click(); await page.waitForTimeout(800); }]);
    }
    if (key === 'words') {
      variants.push(['menu', async () => { const s = page.locator('summary').first(); if (await s.count()) { await s.click(); await page.waitForTimeout(400); } }]);
    }
    if (key === 'capture') {
      variants.push(['mode', async () => {
        const i = page.getByRole('combobox', { name: /word to capture/i });
        await i.fill('serendipity');
        await page.waitForTimeout(500);
        const b = page.getByRole('button', { name: /^capture word$/i });
        if (await b.count()) { await b.click(); await page.waitForTimeout(2000); }
      }]);
    }
    if (key === 'wordDetail') {
      variants.push(['editor', async () => {
        const add = page.getByRole('button', { name: /^type$/i });
        if (await add.count()) { await add.click(); await page.waitForTimeout(700); }
      }]);
    }

    for (const [variant, act] of variants) {
      if (variant !== 'default') {
        await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(700);
        try { await act(); } catch (err) { console.warn(`  ! variant "${variant}" did not reach its state: ${String(err).slice(0, 90)}`); }
      }
      const data = await page.evaluate(MEASURE);
      data.consoleErrors = errors;
      data.route = route.path;
      data.viewportName = vpName;
      data.variant = variant;
      const stem = variant === 'default' ? `${key}-${vpName}` : `${key}-${vpName}-${variant}`;
      await writeFile(path.join(OUT, `${stem}.audit.json`), JSON.stringify(data, null, 2));
      await writeFile(path.join(OUT, `${stem}.outline.txt`), await page.evaluate(OUTLINE));

      const fails = data.texts.filter((t) => t.ratio !== null && t.ratio < t.required);
      const minTarget = vpName === 'mobile' ? 44 : 32;
      const small = data.targets.filter((t) => t.w < minTarget || t.h < minTarget);
      summary.push({
        stem, route: route.path, vp: vpName, variant,
        texts: data.texts.length,
        contrastFails: fails.length,
        worstContrast: fails.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 8)
          .map((f) => `${f.ratio}:1<${f.required} ${f.color} on ${f.bg} ${f.size}px "${f.text.slice(0, 26)}"`),
        smallTargets: small.length,
        smallExamples: small.slice(0, 6).map((t) => `${t.w}×${t.h} ${t.tag} "${t.label}"`),
        hScroll: data.docOverflow.scrollWidth - data.docOverflow.clientWidth,
        overflowNodes: data.overflow.length,
        headings: data.headings.map((h) => h.level).join(','),
        maxFontSize: Math.max(0, ...data.texts.map((t) => t.size)),
        typeSpecs: data.typeCensus.length,
        textColors: data.colors.length,
        errors: errors.length,
      });
      console.log(`ok  ${stem}  texts=${data.texts.length} contrastFail=${fails.length} small=${small.length} hScroll=${data.docOverflow.scrollWidth - data.docOverflow.clientWidth} typeSpecs=${data.typeCensus.length} colors=${data.colors.length}`);
    }
    await context.close();
  }
}

await browser.close();
await writeFile(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nwrote ${OUT}/_summary.json`);
