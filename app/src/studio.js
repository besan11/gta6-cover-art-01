/* Vice Cover Studio — smart-focus multi-panel cover maker.
   One renderer draws the live preview and the exported PNG, so what you
   see is exactly what the file holds. All drawing is plain canvas 2D,
   system fonts only, no network, photos never leave the machine. */

'use strict';

/* ---------- grades: sky, sun, metal and tint per grade ---------- */
const GRADES = {
  sunset: {
    skyTop: '#2b1055', skyMid: '#c94b7c', skyLow: '#ff9a3d',
    sun: '#ffe9a8', sunCore: '#fff7d6', metal: ['#ffffff', '#ffd76a', '#ff7a3d', '#7a2b8f'],
    tint: '#ff7a3d', band: '#170a2b', bandEdge: '#ff5e8a', seal: '#ffb347'
  },
  neon: {
    skyTop: '#0b1030', skyMid: '#7b2ff7', skyLow: '#00e5ff',
    sun: '#ff5ef1', sunCore: '#ffd6fb', metal: ['#ffffff', '#7df9ff', '#ff5ef1', '#2b0a4d'],
    tint: '#ff5ef1', band: '#0a0a24', bandEdge: '#00e5ff', seal: '#00e5ff'
  },
  night: {
    skyTop: '#050510', skyMid: '#1c1445', skyLow: '#3d1a6e',
    sun: '#c9b8ff', sunCore: '#efe9ff', metal: ['#f2f2f2', '#b9b9c9', '#5a5a78', '#1c1c30'],
    tint: '#5a4fd8', band: '#07070f', bandEdge: '#8f7bff', seal: '#c9b8ff'
  },
  mono: {
    skyTop: '#111111', skyMid: '#555555', skyLow: '#e8e8e8',
    sun: '#ffffff', sunCore: '#ffffff', metal: ['#ffffff', '#d8d8d8', '#7a7a7a', '#222222'],
    tint: '#888888', band: '#0a0a0a', bandEdge: '#e8e8e8', seal: '#f0f0f0'
  }
};

const LAYOUTS = ['hero', 'triptych', 'duo'];
const SIZES = { '1080x1080': [1080, 1080], '1080x1350': [1080, 1350], '1920x1080': [1920, 1080] };

/* ---------- state ---------- */
const state = {
  layout: 'hero',
  grade: 'sunset',
  gradeStrength: 0.7,
  sizeKey: '1920x1080',
  title: 'NEON BAY',
  tagline: 'Every sunset hides a score.',
  starring: 'J. MARLOWE',
  quote: 'The most stylish cover maker on the strip.',
  source: 'VICE WEEKLY',
  photos: [],          // { name, img, focusX, focusY, thumb }
  panels: [           // per panel: which photo, drag (fractions of panel), zoom
    { photo: 0, dragX: 0, dragY: 0, zoom: 1 },
    { photo: 0, dragX: 0, dragY: 0, zoom: 1 },
    { photo: 0, dragX: 0, dragY: 0, zoom: 1 }
  ],
  activePanel: 0,
  pickedPhoto: 0
};

const stage = document.getElementById('stage');
const stageCtx = stage.getContext('2d');

/* ---------- small deterministic random for skyline and palms ---------- */
function mulberry(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- smart focus: luminance-weighted centroid on a tiny copy ---------- */
function smartFocus(img) {
  const probe = document.createElement('canvas');
  const side = 48;
  probe.width = side;
  probe.height = side;
  const pc = probe.getContext('2d', { willReadFrequently: true });
  pc.drawImage(img, 0, 0, side, side);
  let data;
  try {
    data = pc.getImageData(0, 0, side, side).data;
  } catch (err) {
    return { x: 0.5, y: 0.42 };
  }
  let weightSum = 0, wx = 0, wy = 0;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const right = x + 1 < side ? data[i + 4] : r;
      const below = y + 1 < side ? data[(y * side + x + side) * 4] : r;
      const busy = Math.abs(r - right) + Math.abs(lum - below);
      const weight = lum / 255 + busy / 255;
      weightSum += weight;
      wx += weight * (x + 0.5) / side;
      wy += weight * (y + 0.5) / side;
    }
  }
  if (weightSum <= 0) return { x: 0.5, y: 0.42 };
  return {
    x: Math.min(0.85, Math.max(0.15, wx / weightSum)),
    y: Math.min(0.85, Math.max(0.15, wy / weightSum))
  };
}

/* ---------- panel geometry: fractions of the cover ---------- */
function panelGeometry(layout, w, h) {
  const bandH = Math.round(h * 0.335);
  const panelTop = Math.round(h * 0.045);
  const panelBottom = h - bandH - Math.round(h * 0.012);
  const gap = Math.round(w * 0.014);
  const left = Math.round(w * 0.028);
  const right = w - left;
  const ph = panelBottom - panelTop;
  const slant = Math.round(w * 0.016);
  if (layout === 'triptych') {
    const pw = (right - left - 2 * gap) / 3;
    return { bandH, panels: [0, 1, 2].map(i => ({
      x: left + i * (pw + gap), y: panelTop, w: pw, h: ph, slant
    })) };
  }
  if (layout === 'duo') {
    const pw = (right - left - gap) / 2;
    return { bandH, panels: [0, 1].map(i => ({
      x: left + i * (pw + gap), y: panelTop, w: pw, h: ph, slant
    })) };
  }
  // hero: one tall panel left, two stacked panels right
  const heroW = (right - left - gap) * 0.58;
  const sideW = right - left - gap - heroW;
  const sideX = left + heroW + gap;
  const halfH = (ph - gap) / 2;
  return { bandH, panels: [
    { x: left, y: panelTop, w: heroW, h: ph, slant },
    { x: sideX, y: panelTop, w: sideW, h: halfH, slant },
    { x: sideX, y: panelTop + halfH + gap, w: sideW, h: halfH, slant }
  ] };
}

function panelCount(layout) { return layout === 'duo' ? 2 : 3; }

/* ---------- slanted panel path ---------- */
function tracePanel(ctx, p) {
  const s = p.slant;
  ctx.beginPath();
  ctx.moveTo(p.x + s, p.y);
  ctx.lineTo(p.x + p.w + s, p.y);
  ctx.lineTo(p.x + p.w - s, p.y + p.h);
  ctx.lineTo(p.x - s, p.y + p.h);
  ctx.closePath();
}

/* ---------- sky, sun, skyline and palms ---------- */
function drawSky(ctx, w, h, grade) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  sky.addColorStop(0, grade.skyTop);
  sky.addColorStop(0.55, grade.skyMid);
  sky.addColorStop(1, grade.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // sun with horizontal slits, half hidden behind the panels
  const sunX = w * 0.76, sunY = h * 0.17, sunR = Math.min(w, h) * 0.115;
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 2.4);
  glow.addColorStop(0, grade.sunCore);
  glow.addColorStop(0.35, grade.sun);
  glow.addColorStop(1, 'rgba(255,120,80,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - sunR * 2.4, sunY - sunR * 2.4, sunR * 4.8, sunR * 4.8);
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = grade.sun;
  ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
  // slits cut across the lower half of the sun
  ctx.fillStyle = grade.skyMid;
  let slitY = sunY + sunR * 0.08;
  let slitH = Math.max(2, sunR * 0.045);
  while (slitY < sunY + sunR) {
    ctx.fillRect(sunX - sunR, slitY, sunR * 2, slitH);
    slitY += slitH * 2.6;
    slitH *= 1.35;
  }
  ctx.restore();
  // skyline silhouette along the horizon behind the panels
  const horizon = h * 0.665;
  const rnd = mulberry(20261121);
  ctx.fillStyle = 'rgba(16,6,32,0.85)';
  let bx = -w * 0.02;
  while (bx < w * 1.02) {
    const bw = w * (0.03 + rnd() * 0.05);
    const bh = h * (0.05 + rnd() * 0.13);
    ctx.fillRect(bx, horizon - bh, bw, bh + h * 0.02);
    if (rnd() > 0.72) { // antenna on some towers
      ctx.fillRect(bx + bw * 0.45, horizon - bh - h * 0.045, Math.max(2, w * 0.002), h * 0.045);
    }
    bx += bw + w * 0.006;
  }
  // lit windows: tiny warm dots on the towers
  ctx.fillStyle = 'rgba(255,214,120,0.85)';
  const rnd2 = mulberry(77);
  for (let i = 0; i < 90; i++) {
    const wx = rnd2() * w;
    const wy = horizon - rnd2() * h * 0.16;
    ctx.fillRect(wx, wy, Math.max(2, w * 0.003), Math.max(2, w * 0.003));
  }
  drawPalm(ctx, w * 0.015, horizon + h * 0.01, h * 0.16, -0.35);
  drawPalm(ctx, w * 0.985, horizon + h * 0.01, h * 0.19, 0.35);
}

function drawPalm(ctx, x, y, size, lean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  ctx.strokeStyle = 'rgba(12,4,24,0.9)';
  ctx.lineWidth = Math.max(3, size * 0.045);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(size * 0.08, -size * 0.55, size * 0.02, -size);
  ctx.stroke();
  ctx.fillStyle = 'rgba(12,4,24,0.9)';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.08 - (i / 6) * Math.PI * 0.86;
    const len = size * (0.52 + (i % 2) * 0.1);
    ctx.beginPath();
    ctx.moveTo(size * 0.02, -size);
    ctx.quadraticCurveTo(
      size * 0.02 + Math.cos(a) * len * 0.55, -size + Math.sin(a) * len * 0.55 - size * 0.1,
      size * 0.02 + Math.cos(a) * len, -size + Math.sin(a) * len + size * 0.22
    );
    ctx.quadraticCurveTo(
      size * 0.02 + Math.cos(a) * len * 0.55, -size + Math.sin(a) * len * 0.55 + size * 0.05,
      size * 0.02, -size
    );
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- one photo inside one slanted panel ----------
   Focus shift and drag share the same slack from the cover fit, so the
   photo can never slide out of its panel and expose sky. */
function drawPhotoPanel(ctx, p, photo, panelState) {
  if (!photo || !photo.img) return;
  const img = photo.img;
  const zoom = panelState.zoom || 1;
  const base = Math.max(p.w / img.naturalWidth, p.h / img.naturalHeight);
  const scale = base * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const slackX = Math.max(0, dw - p.w);
  const slackY = Math.max(0, dh - p.h);
  const focusShiftX = (0.5 - photo.focusX) * slackX;
  const focusShiftY = (0.5 - photo.focusY) * slackY;
  const dragShiftX = (panelState.dragX || 0) * p.w;
  const dragShiftY = (panelState.dragY || 0) * p.h;
  const shiftX = Math.max(-slackX / 2, Math.min(slackX / 2, focusShiftX + dragShiftX));
  const shiftY = Math.max(-slackY / 2, Math.min(slackY / 2, focusShiftY + dragShiftY));
  ctx.save();
  tracePanel(ctx, p);
  ctx.clip();
  ctx.drawImage(img, p.x + (p.w - dw) / 2 + shiftX, p.y + (p.h - dh) / 2 + shiftY, dw, dh);
  ctx.restore();
}

function gradePanel(ctx, p, grade, strength) {
  if (strength <= 0) return;
  ctx.save();
  tracePanel(ctx, p);
  ctx.clip();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = strength * 0.5;
  ctx.fillStyle = grade.tint;
  ctx.fillRect(p.x - p.slant, p.y, p.w + p.slant * 2, p.h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = strength * 0.22;
  const warm = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
  warm.addColorStop(0, 'rgba(255,120,60,0)');
  warm.addColorStop(1, 'rgba(255,120,60,0.9)');
  ctx.fillStyle = warm;
  ctx.fillRect(p.x - p.slant, p.y, p.w + p.slant * 2, p.h);
  ctx.restore();
}

/* ---------- title band: every size derives from the band height ----------
   (sizing from the width once stacked the title onto the pill and seal
   on the 1920x1080 cover; the band height is the stable ruler here.) */
function fitTitleFont(ctx, text, bandH, maxW, grade) {
  let size = bandH * 0.44;
  ctx.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
  while (size > bandH * 0.16 && ctx.measureText(text).width > maxW) {
    size *= 0.92;
    ctx.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
  }
  return size;
}

function drawChromeTitle(ctx, text, x, y, bandH, maxW, grade) {
  const size = fitTitleFont(ctx, text, bandH, maxW, grade);
  const metal = ctx.createLinearGradient(0, y - size * 0.72, 0, y + size * 0.22);
  grade.metal.forEach((stop, i) => metal.addColorStop(i / (grade.metal.length - 1), stop));
  ctx.save();
  ctx.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = size * 0.06;
  ctx.shadowOffsetY = size * 0.03;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,4,32,0.9)';
  ctx.lineWidth = Math.max(2, size * 0.055);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = metal;
  ctx.fillText(text, x, y);
  ctx.restore();
  return size;
}

function drawCircularText(ctx, text, cx, cy, radius, startAngle, size) {
  ctx.save();
  ctx.font = `800 ${size}px Arial, sans-serif`;
  ctx.fillStyle = '#fff3c9';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = (Math.PI * 2) / text.length;
  for (let i = 0; i < text.length; i++) {
    const a = startAngle + i * step;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawTitleBand(ctx, w, h, geo, grade) {
  const bandY = h - geo.bandH;
  const bandH = geo.bandH;
  // band backdrop: deep gradient + top rule
  const bg = ctx.createLinearGradient(0, bandY, 0, h);
  bg.addColorStop(0, grade.band);
  bg.addColorStop(1, '#05030c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, bandY, w, bandH);
  ctx.fillStyle = grade.bandEdge;
  ctx.fillRect(0, bandY, w, Math.max(3, bandH * 0.02));
  const padX = w * 0.028;
  const sealR = bandH * 0.34;
  const sealX = w - padX - sealR;
  const sealY = bandY + bandH * 0.42;
  const titleMaxW = sealX - sealR - padX * 2;

  // chrome title, sized from the band height
  const titleSize = drawChromeTitle(ctx, state.title, padX, bandY + bandH * 0.40, bandH, titleMaxW, grade);

  // tagline under the title
  ctx.save();
  ctx.font = `italic 700 ${Math.round(bandH * 0.105)}px Georgia, serif`;
  ctx.fillStyle = '#ffe9c9';
  ctx.fillText(state.tagline, padX, bandY + bandH * 0.40 + titleSize * 0.42);
  ctx.restore();

  // starring pill
  const pillH = bandH * 0.17;
  const pillY = bandY + bandH * 0.62;
  const pillText = 'STARRING  ' + state.starring;
  ctx.save();
  ctx.font = `800 ${Math.round(pillH * 0.52)}px Arial, sans-serif`;
  const pillW = ctx.measureText(pillText).width + pillH * 1.1;
  ctx.fillStyle = grade.seal;
  ctx.beginPath();
  ctx.roundRect(padX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = '#1a0612';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, padX + pillH * 0.55, pillY + pillH / 2 + 1);
  ctx.restore();

  // review strip: five stars, quote, source — font shrinks to fit the band
  let reviewSize = bandH * 0.13;
  const reviewText = '\u201c' + state.quote + '\u201d  — ' + state.source;
  ctx.save();
  while (reviewSize > bandH * 0.06) {
    ctx.font = `${Math.round(reviewSize)}px Arial, sans-serif`;
    const starsW = ctx.measureText('\u2605\u2605\u2605\u2605\u2605').width;
    ctx.font = `italic ${Math.round(reviewSize * 0.8)}px Georgia, serif`;
    if (starsW + w * 0.012 + ctx.measureText(reviewText).width <= w - padX * 2) break;
    reviewSize *= 0.9;
  }
  const reviewY = pillY + pillH + bandH * 0.055;
  ctx.font = `${Math.round(reviewSize)}px Arial, sans-serif`;
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('\u2605\u2605\u2605\u2605\u2605', padX, reviewY);
  const starsW = ctx.measureText('\u2605\u2605\u2605\u2605\u2605').width;
  ctx.font = `italic ${Math.round(reviewSize * 0.8)}px Georgia, serif`;
  ctx.fillStyle = '#f4eefc';
  ctx.fillText(reviewText, padX + starsW + w * 0.012, reviewY);
  ctx.restore();

  // circular seal, right of the title
  ctx.save();
  ctx.beginPath();
  ctx.arc(sealX, sealY, sealR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,179,71,0.14)';
  ctx.fill();
  ctx.lineWidth = Math.max(2, sealR * 0.07);
  ctx.strokeStyle = grade.seal;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sealX, sealY, sealR * 0.78, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, sealR * 0.03);
  ctx.stroke();
  drawCircularText(ctx, 'NEON BAY \u00b7 EST 2026 \u00b7 ', sealX, sealY, sealR * 0.88, -Math.PI / 2, Math.max(8, sealR * 0.16));
  ctx.font = `900 ${Math.round(sealR * 0.42)}px "Arial Black", Arial, sans-serif`;
  ctx.fillStyle = grade.seal;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NB', sealX, sealY + 1);
  ctx.restore();

  // billing block, small print along the bottom — shrinks to fit the width
  const billing = 'A NEON BAY PICTURE  \u00b7  VICE COVER STUDIO  \u00b7  PHOTOS BY YOU  \u00b7  AN ORIGINAL DESIGN — NO ROCKSTAR LOGO, ARTWORK OR FONT';
  let billingSize = bandH * 0.062;
  ctx.save();
  while (billingSize > bandH * 0.03) {
    ctx.font = `${Math.round(billingSize)}px Arial, sans-serif`;
    if (ctx.measureText(billing).width <= w - padX * 2) break;
    billingSize *= 0.9;
  }
  ctx.fillStyle = 'rgba(244,238,252,0.62)';
  ctx.fillText(billing, padX, h - bandH * 0.045);
  ctx.restore();
}

/* ---------- the one renderer: preview and export share it ----------
   showSelection marks the active panel with a dashed outline; the export
   passes false so the shipped PNG never carries editor chrome. */
function drawCover(ctx, w, h, showSelection) {
  const grade = GRADES[state.grade];
  const geo = panelGeometry(state.layout, w, h);
  ctx.clearRect(0, 0, w, h);
  drawSky(ctx, w, h, grade);
  const count = panelCount(state.layout);
  for (let i = 0; i < count; i++) {
    const p = geo.panels[i];
    const panelState = state.panels[i];
    const photo = state.photos[panelState.photo] || state.photos[0];
    // white poster frame behind the photo
    ctx.save();
    tracePanel(ctx, { x: p.x - 5, y: p.y - 5, w: p.w + 10, h: p.h + 10, slant: p.slant });
    ctx.fillStyle = '#fdf8ff';
    ctx.fill();
    ctx.restore();
    drawPhotoPanel(ctx, p, photo, panelState);
    gradePanel(ctx, p, grade, state.gradeStrength);
    // thin inner frame + drop shadow edge
    ctx.save();
    tracePanel(ctx, p);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, w * 0.002);
    ctx.stroke();
    ctx.restore();
    if (showSelection && i === state.activePanel) {
      ctx.save();
      tracePanel(ctx, p);
      ctx.strokeStyle = '#7dffb2';
      ctx.lineWidth = Math.max(3, w * 0.004);
      ctx.setLineDash([w * 0.012, w * 0.008]);
      ctx.stroke();
      ctx.restore();
    }
  }
  drawTitleBand(ctx, w, h, geo, grade);
}

function renderPreview() {
  const [w, h] = SIZES[state.sizeKey];
  const scale = 960 / w;
  stage.width = 960;
  stage.height = Math.round(h * scale);
  drawCover(stageCtx, stage.width, stage.height, true);
  window.__viceReady = true;
}

/* Export at full size; returns a PNG data URL for screenshots and tests. */
function exportDataURL() {
  const [w, h] = SIZES[state.sizeKey];
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  drawCover(off.getContext('2d'), w, h, false);
  return off.toDataURL('image/png');
}
window.viceExport = exportDataURL;
window.viceState = state;

/* ---------- photo loading ---------- */
function addPhoto(img, name) {
  const focus = smartFocus(img);
  const thumb = document.createElement('canvas');
  thumb.width = 96;
  thumb.height = 96;
  const tc = thumb.getContext('2d');
  const s = Math.max(96 / img.naturalWidth, 96 / img.naturalHeight);
  tc.drawImage(img, (96 - img.naturalWidth * s) / 2, (96 - img.naturalHeight * s) / 2,
    img.naturalWidth * s, img.naturalHeight * s);
  const photo = { name, img, focusX: focus.x, focusY: focus.y, thumb: thumb.toDataURL('image/jpeg', 0.8) };
  state.photos.push(photo);
  state.pickedPhoto = state.photos.length - 1;
  refreshTray();
  refreshSlots();
  renderPreview();
  return photo;
}

function loadSampleFile(fileName) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(addPhoto(img, fileName));
    img.onerror = () => reject(new Error('could not load sample ' + fileName));
    img.src = 'samples/' + fileName;
  });
}

function loadUserFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(addPhoto(img, file.name));
      img.onerror = () => reject(new Error('could not read ' + file.name));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('could not read ' + file.name));
    reader.readAsDataURL(file);
  });
}

/* ---------- tray and panel slots ---------- */
function refreshTray() {
  const tray = document.getElementById('photoTray');
  tray.textContent = '';
  state.photos.forEach((photo, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = photo.name;
    btn.className = i === state.pickedPhoto ? 'picked' : '';
    const thumb = document.createElement('img');
    thumb.src = photo.thumb;
    thumb.alt = photo.name;
    btn.appendChild(thumb);
    btn.addEventListener('click', () => {
      state.pickedPhoto = i;
      const slot = state.panels[state.activePanel];
      if (slot) slot.photo = i;
      refreshTray();
      refreshSlots();
      renderPreview();
    });
    tray.appendChild(btn);
  });
}

function refreshSlots() {
  const host = document.getElementById('panelSlots');
  host.textContent = '';
  const count = panelCount(state.layout);
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'slot';
    const label = document.createElement('span');
    label.textContent = 'Panel ' + (i + 1);
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Photo for panel ' + (i + 1));
    state.photos.forEach((photo, pi) => {
      const opt = document.createElement('option');
      opt.value = String(pi);
      opt.textContent = photo.name;
      select.appendChild(opt);
    });
    if (state.photos.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No photo yet';
      select.appendChild(opt);
    }
    select.value = String(state.panels[i].photo);
    select.addEventListener('change', () => {
      state.panels[i].photo = Number(select.value);
      state.activePanel = i;
      syncZoomSlider();
      renderPreview();
    });
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'chip';
    pick.textContent = 'Select';
    pick.addEventListener('click', () => {
      state.activePanel = i;
      syncZoomSlider();
      renderPreview();
    });
    row.appendChild(label);
    row.appendChild(select);
    row.appendChild(pick);
    host.appendChild(row);
  }
}

/* ---------- drag and zoom on the preview ---------- */
function panelAt(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const x = (clientX - rect.left) * (stage.width / rect.width);
  const y = (clientY - rect.top) * (stage.height / rect.height);
  const geo = panelGeometry(state.layout, stage.width, stage.height);
  const count = panelCount(state.layout);
  for (let i = 0; i < count; i++) {
    const p = geo.panels[i];
    if (x >= p.x - p.slant && x <= p.x + p.w + p.slant && y >= p.y && y <= p.y + p.h) return i;
  }
  return -1;
}

let dragPanel = -1;
let dragLast = null;

stage.addEventListener('pointerdown', event => {
  const hit = panelAt(event.clientX, event.clientY);
  if (hit < 0) return;
  dragPanel = hit;
  state.activePanel = hit;
  dragLast = { x: event.clientX, y: event.clientY };
  stage.setPointerCapture(event.pointerId);
  stage.style.cursor = 'grabbing';
  syncZoomSlider();
  renderPreview();
});

stage.addEventListener('pointermove', event => {
  if (dragPanel < 0 || !dragLast) return;
  const rect = stage.getBoundingClientRect();
  const geo = panelGeometry(state.layout, stage.width, stage.height);
  const p = geo.panels[dragPanel];
  const dx = (event.clientX - dragLast.x) * (stage.width / rect.width);
  const dy = (event.clientY - dragLast.y) * (stage.height / rect.height);
  const panel = state.panels[dragPanel];
  panel.dragX += dx / p.w;
  panel.dragY += dy / p.h;
  dragLast = { x: event.clientX, y: event.clientY };
  renderPreview();
});

function endDrag() {
  dragPanel = -1;
  dragLast = null;
  stage.style.cursor = 'grab';
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

stage.addEventListener('wheel', event => {
  event.preventDefault();
  const hit = panelAt(event.clientX, event.clientY);
  if (hit < 0) return;
  state.activePanel = hit;
  const panel = state.panels[hit];
  panel.zoom = Math.max(1, Math.min(2.5, panel.zoom * (event.deltaY > 0 ? 0.92 : 1.09)));
  syncZoomSlider();
  renderPreview();
}, { passive: false });

function syncZoomSlider() {
  const slider = document.getElementById('panelZoom');
  const panel = state.panels[state.activePanel];
  slider.value = String(Math.round((panel.zoom || 1) * 100));
  document.getElementById('panelZoomValue').textContent = (panel.zoom || 1).toFixed(2) + '\u00d7';
}

/* ---------- control wiring ---------- */
function wireChipRow(rowId, attr, apply) {
  const row = document.getElementById(rowId);
  row.querySelectorAll('[data-' + attr + ']').forEach(btn => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('[data-' + attr + ']').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      apply(btn.getAttribute('data-' + attr));
      renderPreview();
    });
  });
}

wireChipRow('layoutRow', 'layout', value => { state.layout = value; refreshSlots(); });
wireChipRow('gradeRow', 'grade', value => { state.grade = value; });
wireChipRow('sizeRow', 'size', value => { state.sizeKey = value; });

document.getElementById('gradeStrength').addEventListener('input', event => {
  state.gradeStrength = Number(event.target.value) / 100;
  document.getElementById('gradeStrengthValue').textContent = event.target.value + '%';
  renderPreview();
});

document.getElementById('panelZoom').addEventListener('input', event => {
  state.panels[state.activePanel].zoom = Number(event.target.value) / 100;
  document.getElementById('panelZoomValue').textContent =
    (Number(event.target.value) / 100).toFixed(2) + '\u00d7';
  renderPreview();
});

document.getElementById('recenterBtn').addEventListener('click', () => {
  const panel = state.panels[state.activePanel];
  panel.dragX = 0;
  panel.dragY = 0;
  renderPreview();
});

document.getElementById('refocusBtn').addEventListener('click', () => {
  const panel = state.panels[state.activePanel];
  const photo = state.photos[panel.photo];
  if (!photo) return;
  const focus = smartFocus(photo.img);
  photo.focusX = focus.x;
  photo.focusY = focus.y;
  panel.dragX = 0;
  panel.dragY = 0;
  renderPreview();
});

const captionFields = [
  ['titleText', 'title'], ['taglineText', 'tagline'], ['starringText', 'starring'],
  ['quoteText', 'quote'], ['sourceText', 'source']
];
captionFields.forEach(([id, key]) => {
  document.getElementById(id).addEventListener('input', event => {
    state[key] = event.target.value;
    renderPreview();
  });
});

document.getElementById('photoFiles').addEventListener('change', async event => {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    try { await loadUserFile(file); } catch (err) { console.warn(err); }
  }
  event.target.value = '';
});

document.querySelectorAll('[data-sample]').forEach(btn => {
  btn.addEventListener('click', async () => {
    try { await loadSampleFile(btn.getAttribute('data-sample')); }
    catch (err) { console.warn(err); }
  });
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const [w, h] = SIZES[state.sizeKey];
  const url = exportDataURL();
  const link = document.createElement('a');
  link.href = url;
  link.download = 'neon-bay-cover-' + w + 'x' + h + '.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  document.getElementById('exportStatus').textContent =
    'Exported ' + w + ' x ' + h + ' PNG — exactly the frame above, at full size.';
});

/* ---------- deep links for screenshots and sharing ---------- */
async function applyQuery() {
  const params = new URLSearchParams(window.location.search);
  const photo = params.get('photo');
  const caption = params.get('caption');
  const layout = params.get('layout');
  const grade = params.get('grade');
  const size = params.get('size');
  if (layout && LAYOUTS.includes(layout)) {
    state.layout = layout;
    document.querySelectorAll('#layoutRow [data-layout]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.getAttribute('data-layout') === layout)));
  }
  if (grade && GRADES[grade]) {
    state.grade = grade;
    document.querySelectorAll('#gradeRow [data-grade]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.getAttribute('data-grade') === grade)));
  }
  if (size && SIZES[size]) {
    state.sizeKey = size;
    document.querySelectorAll('#sizeRow [data-size]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.getAttribute('data-size') === size)));
  }
  if (caption) {
    state.title = caption.slice(0, 24).toUpperCase();
    document.getElementById('titleText').value = state.title;
  }
  refreshSlots();
  if (photo) {
    const fileName = /\.(jpe?g|png|webp)$/i.test(photo) ? photo : photo + '.jpg';
    try { await loadSampleFile(fileName); } catch (err) { console.warn(err); }
  } else {
    try { await loadSampleFile('pier.jpg'); } catch (err) { console.warn(err); }
  }
  renderPreview();
}

applyQuery();
