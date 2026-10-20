'use strict';
/* 图匠 Image Studio —— 纯前端本地图片编辑器 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const viewCanvas = $('#viewCanvas');
const vctx = viewCanvas.getContext('2d');
const dropzone = $('#dropzone');
const canvasWrap = $('#canvasWrap');
const statusbar = $('#statusbar');
const cropOverlay = $('#cropOverlay');
const cropBox = $('#cropBox');
const cropInfo = $('#cropInfo');
const fileInput = $('#fileInput');

/* ---------- 状态 ---------- */
let source = null;          // 原始 Image（未经任何编辑）
let base = null;            // 当前基准位图（经裁剪/旋转/缩放后的"平面"）
let fileName = 'image';
let history = [];           // 基准位图快照（dataURL）
const MAX_HISTORY = 12;

let adj = defaultAdjust();
let activeFilter = 'none';
let watermark = null;

const adjInputs = {
  brightness: $('#sBrightness'), contrast: $('#sContrast'), saturation: $('#sSaturation'),
  hue: $('#sHue'), blur: $('#sBlur'), sepia: $('#sSepia'),
  grayscale: $('#sGrayscale'), invert: $('#sInvert'),
};

function defaultAdjust() {
  return { brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0, sepia: 0, grayscale: 0, invert: 0 };
}

/* ---------- 工具 ---------- */
function toast(msg, kind = '') {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'toast ' + kind;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2400);
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

/* CSS filter 字符串 */
function buildFilter() {
  const parts = [];
  if (adj.hue) parts.push(`hue-rotate(${adj.hue}deg)`);
  if (adj.brightness) parts.push(`brightness(${1 + adj.brightness / 100})`);
  if (adj.contrast) parts.push(`contrast(${1 + adj.contrast / 100})`);
  if (adj.saturation) parts.push(`saturate(${1 + adj.saturation / 100})`);
  if (adj.blur) parts.push(`blur(${adj.blur}px)`);
  if (adj.sepia) parts.push(`sepia(${adj.sepia / 100})`);
  if (adj.grayscale) parts.push(`grayscale(${adj.grayscale / 100})`);
  if (adj.invert) parts.push(`invert(${adj.invert / 100})`);
  parts.push(...filterPreset(activeFilter));
  return parts.join(' ') || 'none';
}

function filterPreset(f) {
  switch (f) {
    case 'mono': return ['grayscale(1)', 'contrast(1.1)'];
    case 'vintage': return ['sepia(.7)', 'contrast(.92)', 'saturate(.85)'];
    case 'cool': return ['hue-rotate(-15deg)', 'saturate(1.15)', 'brightness(1.03)'];
    case 'warm': return ['hue-rotate(12deg)', 'saturate(1.2)', 'brightness(1.05)'];
    case 'fade': return ['saturate(.55)', 'contrast(.85)', 'brightness(1.08)'];
    case 'highcontrast': return ['contrast(1.6)', 'saturate(1.1)'];
    case 'invert': return ['invert(1)'];
    default: return [];
  }
}

/* ---------- 渲染 ---------- */
function render() {
  if (!base) return;
  const cssFilter = buildFilter();
  viewCanvas.width = base.width;
  viewCanvas.height = base.height;
  vctx.save();
  vctx.filter = cssFilter;
  vctx.drawImage(base, 0, 0);
  vctx.restore();
  if (watermark && watermark.text) drawWatermark(vctx, viewCanvas, watermark);
  updateStatusbar();
}

function drawWatermark(ctx, cv, wm) {
  const pad = Math.max(14, Math.round(cv.width * 0.025));
  const fs = Math.max(8, Math.round(wm.size * (cv.width / 900)));
  ctx.save();
  ctx.globalAlpha = wm.alpha / 100;
  ctx.font = `600 ${fs}px system-ui, "PingFang SC", sans-serif`;
  ctx.textBaseline = 'middle';
  if (wm.stroke) {
    ctx.lineWidth = Math.max(2, fs / 12);
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineJoin = 'round';
  }
  const m = ctx.measureText(wm.text);
  const tw = m.width, th = fs * 1.2;
  let x = pad, y = pad + th / 2;
  const p = wm.pos;
  if (p === 'tc' || p === 'cc' || p === 'bc') x = (cv.width - tw) / 2;
  else if (p === 'tr' || p === 'mr' || p === 'br') x = cv.width - tw - pad;
  if (p === 'ml' || p === 'mr') y = cv.height / 2;
  else if (p === 'bl' || p === 'bc' || p === 'br') y = cv.height - pad - th / 2;
  ctx.fillStyle = wm.color;
  ctx.fillText(wm.text, x, y);
  if (wm.stroke) ctx.strokeText(wm.text, x, y);
  ctx.restore();
}

function updateStatusbar() {
  $('#metaName').textContent = fileName;
  $('#metaSize').textContent = base ? `${base.width} × ${base.height} px` : '—';
  $('#metaDim').textContent = watermark && watermark.text ? '含水印' : '';
  $('#exportSummary').textContent = base ? `导出尺寸：${base.width} × ${base.height} px` : '导出尺寸：—';
}

/* ---------- 历史 ---------- */
function pushHistory() {
  if (!base) return;
  history.push(base.toDataURL('image/png'));
  if (history.length > MAX_HISTORY) history.shift();
  syncTopButtons();
}

function undo() {
  if (!base || history.length === 0) return;
  const url = history.pop();
  const img = new Image();
  img.onload = () => { base = img; render(); syncTopButtons(); toast('已撤销上一步'); };
  img.src = url;
}

function resetAll() {
  if (!source) return;
  history = [];
  adj = defaultAdjust();
  activeFilter = 'none';
  watermark = null;
  syncAdjustInputs();
  $$('.filter-card').forEach(b => b.classList.toggle('active', b.dataset.filter === 'none'));
  $('#wmText').value = '';
  base = cloneImage(source);
  render();
  syncTopButtons();
  toast('已恢复为原图');
}

function syncTopButtons() {
  const has = !!base;
  $('#btnUndo').disabled = history.length === 0;
  $('#btnReset').disabled = !has;
  $('#btnDownload').disabled = !has;
}

function cloneImage(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

/* ---------- 载入文件 ---------- */
function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) { toast('请选择图片文件', 'err'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    source = img;
    fileName = (file.name || 'image').replace(/\.[^.]+$/, '');
    $('#outName').value = fileName + '-edited';
    base = cloneImage(img);
    history = [];
    adj = defaultAdjust();
    activeFilter = 'none';
    watermark = null;
    syncAdjustInputs();
    $$('.filter-card').forEach(b => b.classList.toggle('active', b.dataset.filter === 'none'));
    $('#wmText').value = '';
    dropzone.hidden = true;
    canvasWrap.hidden = false;
    statusbar.hidden = false;
    $('#metaName').textContent = file.name;
    base._bytes = file.size;
    syncGeoInputs();
    render();
    syncTopButtons();
    setTab('adjust');
    toast('图片已载入，开始编辑吧', 'ok');
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { toast('图片解码失败', 'err'); URL.revokeObjectURL(url); };
  img.src = url;
}

/* ---------- Tabs ---------- */
function setTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
  if (name === 'crop') showCropOverlay(true); else showCropOverlay(false);
}

/* ---------- 调节 ---------- */
function syncAdjustInputs() {
  for (const k in adjInputs) {
    adjInputs[k].value = adj[k];
    const o = $('#o' + k[0].toUpperCase() + k.slice(1));
    if (o) o.textContent = adj[k];
  }
}

for (const [k, el] of Object.entries(adjInputs)) {
  el.addEventListener('input', () => {
    adj[k] = parseFloat(el.value);
    const o = $('#o' + k[0].toUpperCase() + k.slice(1));
    if (o) o.textContent = el.value;
    render();
  });
  el.addEventListener('change', () => { if (base) pushHistory(); });
}

$$('[data-quick]').forEach(btn => btn.addEventListener('click', () => {
  if (!base) { toast('请先打开图片', 'err'); return; }
  const q = btn.dataset.quick;
  adj = defaultAdjust();
  if (q === 'warm') { adj.hue = 10; adj.saturation = 18; adj.brightness = 5; adj.sepia = 18; }
  if (q === 'cool') { adj.hue = -14; adj.saturation = 12; adj.contrast = 8; }
  if (q === 'vivid') { adj.saturation = 45; adj.contrast = 18; }
  if (q === 'bw') { adj.grayscale = 100; adj.contrast = 12; }
  syncAdjustInputs();
  pushHistory();
  render();
  toast('已应用快捷调色', 'ok');
}));

/* ---------- Tabs 点击 ---------- */
$$('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

/* ---------- 打开文件 ---------- */
$('#btnOpen').addEventListener('click', () => fileInput.click());
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); fileInput.value = ''; });

['dragover', 'dragenter'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
document.addEventListener('paste', e => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const it of items) if (it.type.startsWith('image/')) { loadFile(it.getAsFile()); break; }
});

/* ---------- 顶部按钮 ---------- */
$('#btnUndo').addEventListener('click', undo);
$('#btnReset').addEventListener('click', resetAll);
$('#btnDownload').addEventListener('click', () => { setTab('export'); exportImage(); });

/* ---------- 裁剪 overlay ---------- */
function showCropOverlay(show) {
  if (!base || !show) { cropOverlay.hidden = true; return; }
  cropOverlay.hidden = false;
  layoutCropBox();
}

let cropRatio = 'free';

function layoutCropBox() {
  if (!base) return;
  const wrapRect = canvasWrap.getBoundingClientRect();
  const canvasRect = viewCanvas.getBoundingClientRect();
  const ox = canvasRect.left - wrapRect.left;
  const oy = canvasRect.top - wrapRect.top;
  cropOverlay.style.left = ox + 'px';
  cropOverlay.style.top = oy + 'px';
  cropOverlay.style.width = canvasRect.width + 'px';
  cropOverlay.style.height = canvasRect.height + 'px';

  const w = canvasRect.width, h = canvasRect.height;
  let cw = w * 0.8, ch = h * 0.8;
  if (cropRatio !== 'free') {
    const [rw, rh] = cropRatio.split(':').map(Number);
    const target = rw / rh;
    if (cw / ch > target) cw = ch * target; else ch = cw / target;
  }
  const cx = (w - cw) / 2, cy = (h - ch) / 2;
  cropBox.style.left = cx + 'px';
  cropBox.style.top = cy + 'px';
  cropBox.style.width = cw + 'px';
  cropBox.style.height = ch + 'px';
  updateCropInfo();
}

function updateCropInfo() {
  const canvasRect = viewCanvas.getBoundingClientRect();
  const scaleX = base.width / canvasRect.width;
  const scaleY = base.height / canvasRect.height;
  const w = Math.round(parseFloat(cropBox.style.width) * scaleX);
  const h = Math.round(parseFloat(cropBox.style.height) * scaleY);
  cropInfo.textContent = `${w} × ${h}`;
}

$$('[data-ratio]').forEach(b => b.addEventListener('click', () => {
  $$('[data-ratio]').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  cropRatio = b.dataset.ratio;
  if (!cropOverlay.hidden) layoutCropBox();
}));

/* 裁剪框拖拽 */
let drag = null;
cropBox.addEventListener('pointerdown', e => {
  if (!base) return;
  e.preventDefault();
  cropBox.setPointerCapture(e.pointerId);
  const handle = e.target.dataset ? e.target.dataset.h : null;
  drag = {
    mode: handle ? 'resize' : 'move',
    handle,
    startX: e.clientX, startY: e.clientY,
    left: parseFloat(cropBox.style.left), top: parseFloat(cropBox.style.top),
    w: parseFloat(cropBox.style.width), h: parseFloat(cropBox.style.height),
  };
});
cropBox.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  const rect = viewCanvas.getBoundingClientRect();
  const rw = rect.width, rh = rect.height;
  let { left, top, w, h } = drag;

  if (drag.mode === 'move') {
    left = Math.min(Math.max(0, left + dx), rw - w);
    top = Math.min(Math.max(0, top + dy), rh - h);
  } else {
    const hd = drag.handle;
    if (hd.includes('l')) { const nl = Math.max(0, left + dx); w = w + (left - nl); left = nl; }
    if (hd.includes('r')) { w = Math.min(rw - left, w + dx); }
    if (hd.includes('t')) { const nt = Math.max(0, top + dy); h = h + (top - nt); top = nt; }
    if (hd.includes('b')) { h = Math.min(rh - top, h + dy); }
    w = Math.max(30, w); h = Math.max(30, h);
    if (cropRatio !== 'free') {
      const [arw, arh] = cropRatio.split(':').map(Number);
      const target = arw / arh;
      if (hd === 'l' || hd === 'r') h = w / target; else w = h * target;
      if (hd.includes('l')) left = Math.max(0, drag.left + drag.w - w);
      if (hd.includes('t')) top = Math.max(0, drag.top + drag.h - h);
      if (left + w > rw) w = rw - left;
      if (top + h > rh) h = rh - top;
    }
  }
  cropBox.style.left = left + 'px';
  cropBox.style.top = top + 'px';
  cropBox.style.width = w + 'px';
  cropBox.style.height = h + 'px';
  updateCropInfo();
});
['pointerup', 'pointercancel'].forEach(ev => cropBox.addEventListener(ev, () => { drag = null; }));

$('#btnApplyCrop').addEventListener('click', () => {
  if (!base) { toast('请先打开图片', 'err'); return; }
  const rect = viewCanvas.getBoundingClientRect();
  const scaleX = base.width / rect.width;
  const scaleY = base.height / rect.height;
  const sx = Math.round(parseFloat(cropBox.style.left) * scaleX);
  const sy = Math.round(parseFloat(cropBox.style.top) * scaleY);
  const sw = Math.round(parseFloat(cropBox.style.width) * scaleX);
  const sh = Math.round(parseFloat(cropBox.style.height) * scaleY);
  if (sw < 5 || sh < 5) { toast('裁剪区域太小', 'err'); return; }
  pushHistory();
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  c.getContext('2d').drawImage(base, sx, sy, sw, sh, 0, 0, sw, sh);
  base = c;
  render();
  syncGeoInputs();
  layoutCropBox();
  toast('裁剪完成', 'ok');
});

/* ---------- 旋转 / 翻转 ---------- */
function transformBase(kind) {
  if (!base) { toast('请先打开图片', 'err'); return; }
  pushHistory();
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (kind === 'l' || kind === 'r') {
    c.width = base.height; c.height = base.width;
    if (kind === 'r') { ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); }
    else { ctx.translate(0, c.height); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(base, 0, 0);
  } else {
    c.width = base.width; c.height = base.height;
    ctx.translate(kind === 'h' ? c.width : 0, kind === 'v' ? c.height : 0);
    ctx.scale(kind === 'h' ? -1 : 1, kind === 'v' ? -1 : 1);
    ctx.drawImage(base, 0, 0);
  }
  base = c;
  render();
  syncGeoInputs();
  if (!cropOverlay.hidden) layoutCropBox();
}
$('#btnRotateL').addEventListener('click', () => transformBase('l'));
$('#btnRotateR').addEventListener('click', () => transformBase('r'));
$('#btnFlipH').addEventListener('click', () => transformBase('h'));
$('#btnFlipV').addEventListener('click', () => transformBase('v'));

/* ---------- 尺寸 ---------- */
let geoRatio = 1;
function syncGeoInputs() {
  if (!base) return;
  geoRatio = base.width / base.height;
  $('#inW').value = base.width;
  $('#inH').value = base.height;
}
$('#inW').addEventListener('input', () => {
  if ($('#lockRatio').checked && geoRatio) $('#inH').value = Math.max(1, Math.round($('#inW').value / geoRatio));
});
$('#inH').addEventListener('input', () => {
  if ($('#lockRatio').checked && geoRatio) $('#inW').value = Math.max(1, Math.round($('#inH').value * geoRatio));
});
$$('[data-size]').forEach(b => b.addEventListener('click', () => {
  if (!base) return;
  const f = parseFloat(b.dataset.size);
  $('#inW').value = Math.max(1, Math.round(base.width * f));
  $('#inH').value = Math.max(1, Math.round(base.height * f));
}));
$('#btnApplyResize').addEventListener('click', () => {
  if (!base) { toast('请先打开图片', 'err'); return; }
  const w = parseInt($('#inW').value, 10), h = parseInt($('#inH').value, 10);
  if (!w || !h || w < 1 || h < 1 || w > 12000 || h > 12000) { toast('尺寸需在 1-12000 px 之间', 'err'); return; }
  pushHistory();
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, 0, 0, w, h);
  base = c;
  render();
  syncGeoInputs();
  if (!cropOverlay.hidden) layoutCropBox();
  toast(`已调整为 ${w} × ${h}`, 'ok');
});

/* ---------- 滤镜 ---------- */
$$('.filter-card').forEach(b => b.addEventListener('click', () => {
  if (!base) { toast('请先打开图片', 'err'); return; }
  activeFilter = b.dataset.filter;
  $$('.filter-card').forEach(x => x.classList.toggle('active', x === b));
  pushHistory();
  render();
}));

/* ---------- 水印 ---------- */
function readWm() {
  return {
    text: $('#wmText').value.trim(),
    size: parseInt($('#wmSize').value, 10) || 48,
    color: $('#wmColor').value,
    alpha: parseInt($('#wmAlpha').value, 10) || 80,
    stroke: $('#wmStroke').checked,
    pos: ($('.seg-btn.active[data-pos]') || { dataset: { pos: 'cc' } }).dataset.pos,
  };
}
$$('.seg-btn[data-pos]').forEach(b => b.addEventListener('click', () => {
  $$('.seg-btn[data-pos]').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  if (watermark) { watermark.pos = b.dataset.pos; render(); }
}));
['#wmText', '#wmSize', '#wmColor', '#wmAlpha', '#wmStroke'].forEach(sel => {
  $(sel).addEventListener('input', () => { if (watermark) { watermark = readWm(); render(); } });
});
$('#btnApplyWm').addEventListener('click', () => {
  if (!base) { toast('请先打开图片', 'err'); return; }
  const wm = readWm();
  if (!wm.text) { toast('请输入水印文字', 'err'); return; }
  pushHistory();
  watermark = wm;
  render();
  toast('水印已添加', 'ok');
});
$('#btnClearWm').addEventListener('click', () => {
  if (!watermark) return;
  pushHistory();
  watermark = null;
  render();
  toast('水印已清除');
});

/* ---------- 导出 ---------- */
let exportFormat = 'image/png';
$$('.seg-btn[data-format]').forEach(b => b.addEventListener('click', () => {
  $$('.seg-btn[data-format]').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  exportFormat = b.dataset.format;
  $('#qualityRow').hidden = exportFormat === 'image/png';
}));
$('#inQuality').addEventListener('input', () => { $('#oQuality').textContent = $('#inQuality').value; });

function exportImage() {
  if (!base) { toast('请先打开图片', 'err'); return; }
  const q = parseInt($('#inQuality').value, 10) / 100;
  const out = document.createElement('canvas');
  out.width = viewCanvas.width;
  out.height = viewCanvas.height;
  const octx = out.getContext('2d');
  if (exportFormat === 'image/jpeg') { octx.fillStyle = '#fff'; octx.fillRect(0, 0, out.width, out.height); }
  octx.filter = buildFilter();
  octx.drawImage(base, 0, 0);
  octx.filter = 'none';
  if (watermark && watermark.text) drawWatermark(octx, out, watermark);
  const ext = exportFormat === 'image/jpeg' ? 'jpg' : exportFormat === 'image/webp' ? 'webp' : 'png';
  const name = ($('#outName').value || 'edited').replace(/[^\w\-一-龥]/g, '') + '.' + ext;
  out.toBlob(blob => {
    if (!blob) { toast('导出失败', 'err'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`已导出 ${name}（${fmtBytes(blob.size)}）`, 'ok');
  }, exportFormat, q);
}
$('#btnExport').addEventListener('click', exportImage);

/* ---------- 快捷键 ---------- */
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); fileInput.click(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && base) { e.preventDefault(); exportImage(); }
});

window.addEventListener('resize', () => { if (!cropOverlay.hidden) layoutCropBox(); });

/* 初始化：导出摘要与按钮状态 */
updateStatusbar();
syncTopButtons();