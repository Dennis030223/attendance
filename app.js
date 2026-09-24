(function () {
  'use strict';

  const STORAGE_KEY = 'attendance-records';
  let stream = null;
  let capturedImage = null;
  let cameraStarted = false;

  const $ = (id) => document.getElementById(id);

  const nameInput = $('name');
  const officeInput = $('office');
  const video = $('video');
  const captured = $('captured');
  const tbody = $('tbody');
  const recordCount = $('recordCount');
  const toast = $('toast');
  const modeNotice = $('modeNotice');
  const shareCard = $('shareCard');
  const qrBox = $('qrBox');
  const shareUrlEl = $('shareUrl');

  const btnStartCamera = $('btnStartCamera');
  const btnCapture = $('btnCapture');
  const btnRetake = $('btnRetake');
  const btnSave = $('btnSave');
  const btnExportAttendance = $('btnExportAttendance');
  const btnExportPdf = $('btnExportPdf');
  const btnClearAll = $('btnClearAll');
  const attendanceFile = $('attendanceFile');

  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function getRecords() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function renderTable() {
    const records = getRecords();
    recordCount.textContent = records.length;
    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No attendance records yet.</td></tr>';
      return;
    }
    tbody.innerHTML = records
      .map((r) => `
        <tr>
          <td>${r.image ? '<img class="thumb" src="' + r.image + '" alt="photo" />' : '—'}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.office)}</td>
          <td class="date-col">${escapeHtml(r.timestamp)}</td>
        </tr>
      `)
      .join('');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  const fileInput = $('fileInput');

  const cameraMode = { active: false };
  let cameraStarting = false;

  function stopCamera() {
    cameraMode.active = false;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.srcObject = null;
  }

  function clearPhoto() {
    capturedImage = null;
    captured.src = '';
    captured.style.display = 'none';
  }

  function setLiveCameraUI() {
    video.style.display = 'block';
    captured.style.display = 'none';
    btnStartCamera.style.display = 'none';
    btnCapture.style.display = 'inline-block';
    btnRetake.style.display = 'inline-block';
  }

  function showCapturedPhoto() {
    video.style.display = 'none';
    captured.style.display = 'block';
    btnStartCamera.style.display = 'none';
    btnCapture.style.display = 'inline-block';
    btnRetake.style.display = 'inline-block';
  }

  function setIdleUI() {
    video.style.display = 'none';
    btnStartCamera.style.display = 'inline-block';
    btnCapture.style.display = 'none';
    btnRetake.style.display = 'none';
  }

  function showPreview(dataUrl) {
    capturedImage = dataUrl;
    captured.src = dataUrl;
    showCapturedPhoto();
  }

  function resetToIdle() {
    stopCamera();
    clearPhoto();
    setIdleUI();
    fileInput.value = '';
  }

  async function startCamera(silent) {
    if (cameraStarting) return;
    cameraStarting = true;
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (silent !== true) showToast('Camera not supported in this browser - use Upload Photo instead');
      cameraStarting = false;
      return;
    }

    btnStartCamera.disabled = true;
    btnStartCamera.textContent = 'Starting...';
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      stream = s;
      cameraMode.active = true;
      cameraStarted = true;
      video.muted = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.playsInline = true;
      video.srcObject = s;
      await waitForVideoReady(video, 6000);
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
      await waitVideoPlaying(video, 6000);
      if (!cameraMode.active) return;
      setLiveCameraUI();
      if (silent !== true) showToast('Camera started - click Capture Photo');
    } catch (err) {
      stopCamera();
      if (silent !== true) showToast('Camera unavailable: ' + err.message);
      resetToIdle();
    } finally {
      cameraStarting = false;
      btnStartCamera.disabled = false;
      btnStartCamera.textContent = 'Start Camera';
    }
  }

  function waitForVideoReady(videoEl, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (videoEl.readyState >= 1) return resolve();
      const timer = setTimeout(() => { cleanup(); reject(new Error('video not ready')); }, timeoutMs);
      const onMeta = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(videoEl.error || new Error('video error')); };
      function cleanup() {
        clearTimeout(timer);
        videoEl.removeEventListener('loadedmetadata', onMeta);
        videoEl.removeEventListener('loadeddata', onMeta);
        videoEl.removeEventListener('canplay', onMeta);
        videoEl.removeEventListener('error', onError);
      }
      videoEl.addEventListener('loadedmetadata', onMeta);
      videoEl.addEventListener('loadeddata', onMeta);
      videoEl.addEventListener('canplay', onMeta);
      videoEl.addEventListener('error', onError);
    });
  }

  function waitVideoPlaying(videoEl, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (videoEl.readyState >= 2 && !videoEl.paused) return resolve();
      const timer = setTimeout(() => {
        cleanup();
        if (videoEl.readyState >= 2) resolve();
        else reject(new Error('camera did not start'));
      }, timeoutMs);
      const onPlay = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(videoEl.error || new Error('video error')); };
      function cleanup() {
        clearTimeout(timer);
        videoEl.removeEventListener('playing', onPlay);
        videoEl.removeEventListener('canplay', onPlay);
        videoEl.removeEventListener('error', onError);
      }
      videoEl.addEventListener('playing', onPlay);
      videoEl.addEventListener('canplay', onPlay);
      videoEl.addEventListener('error', onError);
    });
  }

  function bootstrapCamera() {
    startCamera(true).then(() => {
      if (cameraStarted) return;
      setTimeout(() => { if (!cameraStarted) startCamera(true); }, 1200);
      document.addEventListener('pointerdown', function onFirstGesture() {
        document.removeEventListener('pointerdown', onFirstGesture);
        if (!cameraStarted) startCamera(false);
      }, { once: true });
    });
  }

  function capture() {
    if (!cameraMode.active || !stream) {
      showToast('Start the camera first');
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      showToast('Camera not ready yet, try again');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedImage = canvas.toDataURL('image/jpeg', 0.85);
    captured.src = capturedImage;
    showCapturedPhoto();
    showToast('Photo captured');
  }

  function retake() {
    clearPhoto();
    if (cameraMode.active) {
      setLiveCameraUI();
    } else {
      setIdleUI();
      startCamera();
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => showPreview(reader.result);
    reader.onerror = () => showToast('Could not read that image');
    reader.readAsDataURL(file);
  }

  function nextId(records) {
    let max = 0;
    records.forEach((r) => {
      const m = String(r.id || '').match(/^EMP(\d+)$/i);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'EMP' + String(max + 1).padStart(3, '0');
  }

  async function save() {
    const name = nameInput.value.trim();
    const office = officeInput.value.trim();
    if (!name || !office) {
      showToast('Please fill in Name and Office');
      return;
    }
    const now = new Date();
    const photo = capturedImage;
    const records = getRecords();
    const record = {
      id: nextId(records),
      name,
      office,
      image: photo,
      imagePath: '',
      timestamp: now.toLocaleString(),
      iso: now.toISOString()
    };
    records.push(record);
    saveRecords(records);
    clearPhoto();
    if (cameraMode.active) {
      setLiveCameraUI();
    } else {
      setIdleUI();
      startCamera();
    }
    nameInput.value = '';
    officeInput.value = '';
    renderTable();
    showToast('Attendance saved');
    if (photo) {
      const filename = imageFilename(name, photo);
      const state = await saveImage(filename, photo);
      if (state === 'ok') {
        record.imagePath = 'images/' + filename;
        const recs = getRecords();
        const idx = recs.findIndex((r) => r.id === record.id);
        if (idx >= 0) {
          recs[idx].imagePath = record.imagePath;
          saveRecords(recs);
          renderTable();
        }
      } else if (state.indexOf('status:') === 0) {
        showToast('Photo not saved · server error (' + state.slice(7) + ') · restart start.bat');
      } else if (state === 'offline') {
        showToast('Photo not saved · server offline');
      }
    } else {
      showToast('Attendance saved · no photo');
    }
    writeAttendanceFile();
  }

  /* ---------------- CSV for attendance ---------------- */

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        if (row.some((f) => f !== '')) rows.push(row);
        row = []; field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
    }
    return rows;
  }

  function csvField(v) {
    v = String(v == null ? '' : v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function toCSV(rows) {
    return rows.map((r) => r.map(csvField).join(',')).join('\r\n');
  }

  function download(filename, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function recordDate(r) {
    if (r.iso) return r.iso.slice(0, 10);
    return r.timestamp ? String(r.timestamp).split(',')[0].trim() : '';
  }

  function recordTime(r) {
    if (r.iso) return r.iso.slice(11, 19);
    const m = r.timestamp && r.timestamp.match(/(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})\s*([AP]M)?/i);
    return m ? (m[1] + (m[2] ? ' ' + m[2] : '')) : '';
  }

  function attendanceRows(records) {
    const header = ['ID', 'Name', 'Office', 'Date', 'Time In', 'Time Out', 'Status', 'File Location'];
    const rows = [header, ...records.map((r) => [
      r.id, r.name, r.office, recordDate(r), recordTime(r), '', 'Present', r.imagePath || ''
    ])];
    return rows;
  }

  function imageFilename(name, dataUrl) {
    const safe = String(name).trim().replace(/[\\/:*?"<>|]+/g, '_') || 'photo';
    const m = /^data:image\/(jpeg|png|webp|gif);base64,/.exec(dataUrl || '');
    const ext = m ? { jpeg: '.jpg', png: '.png', webp: '.webp', gif: '.gif' }[m[1]] : '.jpg';
    return safe + ext;
  }

  function saveImage(filename, dataUrl) {
    if (location.protocol === 'file:') return Promise.resolve('file');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    return fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, dataUrl }),
      signal: ctrl.signal
    })
      .then((res) => { clearTimeout(timer); return res.ok ? 'ok' : 'status:' + res.status; })
      .catch(() => { clearTimeout(timer); return 'offline'; });
  }

  function writeAttendanceFile() {
    const records = getRecords();
    if (!records.length) return;
    syncToServer('POST', toCSV(attendanceRows([records[records.length - 1]]))).then((state) => {
      if (state === 'ok') showToast('Saved · attendance.csv updated');
      else if (state === 'file') showToast('Saved in browser · run start.bat to autosave');
      else if (state === 'error') showToast('Saved locally · attendance.csv is locked (close it in Excel)');
      else showToast('Saved locally · server offline — run node server.js to autosave');
    });
  }

  function syncToServer(mode, csvText) {
    if (location.protocol === 'file:') return Promise.resolve('file');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    return fetch('/api/attendance', {
      method: mode,
      headers: { 'Content-Type': 'text/csv;charset=utf-8' },
      body: csvText,
      signal: ctrl.signal
    })
      .then((res) => { clearTimeout(timer); return res.ok ? 'ok' : 'error'; })
      .catch(() => { clearTimeout(timer); return 'offline'; });
  }

  function overwriteAttendance(records) {
    syncToServer('PUT', toCSV(attendanceRows(records))).then((state) => {
      if (state === 'file') return;
      if (state === 'error') showToast('attendance.csv is locked (close it in Excel) · kept in browser');
      else if (state === 'offline') showToast('Server offline · changes kept in browser (run node server.js)');
    });
  }

  function exportAttendance() {
    const records = getRecords();
    if (records.length === 0) {
      showToast('No records to export');
      return;
    }
    download('attendance.csv', toCSV(attendanceRows(records)));
    showToast('Attendance exported');
  }

  function resolveImageInput(record) {
    if (record.image) return Promise.resolve(record.image);
    if (record.imagePath && location.protocol !== 'file:') {
      return fetch(record.imagePath).then((res) => {
        if (!res.ok) return null;
        return res.blob();
      }).then((blob) => {
        if (!blob || !blob.type.startsWith('image/')) return null;
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }).catch(() => null);
    }
    return Promise.resolve(null);
  }

  async function exportPdf() {
    const records = getRecords();
    if (records.length === 0) {
      showToast('No records to export');
      return;
    }
    if (!window.jspdf) {
      showToast('PDF library failed to load - check internet / refresh');
      return;
    }
    btnExportPdf.disabled = true;
    btnExportPdf.textContent = 'Building PDF...';
    try {
      const images = await Promise.all(records.map(resolveImageInput));
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const photoSize = 22;

      doc.setFontSize(16);
      doc.text('Attendance Report', margin, 16);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('Generated: ' + new Date().toLocaleString(), margin, 22);
      doc.setFontSize(9);
      doc.text('Total records: ' + records.length, margin, 27);
      doc.setTextColor(0);

      let y = 34;
      records.forEach((r, i) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
        }
        let x = margin;
        if (images[i]) {
          try {
            doc.addImage(images[i], 'JPEG', x, y, photoSize, photoSize, undefined, 'FAST');
          } catch (e) {
            x -= 8;
          }
          x += photoSize + 6;
        }
        doc.setFontSize(10);
        doc.text((i + 1) + '. ' + r.name, x, y + 6);
        doc.setFontSize(9);
        doc.setTextColor(80);
        doc.text('ID: ' + (r.id || ''), x, y + 12);
        doc.text('Office: ' + r.office, x, y + 17);
        doc.text('Date: ' + recordDate(r) + '  Time: ' + recordTime(r), x, y + 22);
        doc.setFontSize(9);
        doc.setTextColor(40);
        doc.text('Status: Present', x, y + 27);
        doc.setTextColor(0);
        doc.setFontSize(10);
        y += Math.max(photoSize, 30) + 8;
      });

      doc.save('attendance-report.pdf');
      showToast('PDF saved');
      await savePdfToHost(doc, records.length);
    } finally {
      btnExportPdf.disabled = false;
      btnExportPdf.textContent = 'Save PDF';
    }
  }

  async function savePdfToHost(doc, recordCount) {
    if (location.protocol === 'file:') return;
    const blob = doc.output('blob');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: blob,
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        showToast('PDF saved to laptop (' + json.path + ') · ' + recordCount + ' records');
      } else {
        showToast('PDF downloaded · host could not save it (server restart?)');
      }
    } catch (err) {
      clearTimeout(timer);
      showToast('PDF downloaded · could not reach host');
    }
  }

  function importAttendance(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) {
      showToast('CSV is empty or missing a header row');
      return;
    }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const iId = header.indexOf('id');
    const iName = header.indexOf('name');
    const iOffice = header.indexOf('office');
    const iDate = header.indexOf('date');
    const iIn = header.indexOf('time in');
    const iFile = header.indexOf('file location');

    const records = getRecords();
    let added = 0;
    for (const r of rows.slice(1)) {
      const name = (iName >= 0 ? r[iName] : '').trim();
      const date = (iDate >= 0 ? r[iDate] : '').trim();
      if (!name || !date) continue;
      const timeIn = iIn >= 0 ? (r[iIn] || '').trim() : '';
      const now = new Date(date + (timeIn ? ' ' + timeIn : ''));
      records.push({
        id: iId >= 0 && r[iId] ? r[iId].trim() : Date.now() + added,
        name,
        office: iOffice >= 0 ? (r[iOffice] || '').trim() : '',
        image: null,
        imagePath: iFile >= 0 ? (r[iFile] || '').trim() : '',
        timestamp: isNaN(now.getTime()) ? date : now.toLocaleString(),
        iso: isNaN(now.getTime()) ? '' : now.toISOString()
      });
      added++;
    }
    saveRecords(records);
    renderTable();
    overwriteAttendance(records);
    showToast('Imported ' + added + ' attendance records');
  }

  function rowsToRecords(rows) {
    if (rows.length < 2) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const iId = header.indexOf('id');
    const iName = header.indexOf('name');
    const iOffice = header.indexOf('office');
    const iDate = header.indexOf('date');
    const iIn = header.indexOf('time in');
    const iFile = header.indexOf('file location');
    const out = [];
    for (const r of rows.slice(1)) {
      const name = (iName >= 0 ? r[iName] : '').trim();
      const date = (iDate >= 0 ? r[iDate] : '').trim();
      if (!name && !date) continue;
      if (iId >= 0 && !r[iId]) continue;
      const timeIn = iIn >= 0 ? (r[iIn] || '').trim() : '';
      const now = new Date(date + (timeIn ? ' ' + timeIn : ''));
      out.push({
        id: iId >= 0 ? r[iId].trim() : '',
        name,
        office: iOffice >= 0 ? (r[iOffice] || '').trim() : '',
        image: null,
        imagePath: iFile >= 0 ? (r[iFile] || '').trim() : '',
        timestamp: isNaN(now.getTime()) ? date : now.toLocaleString(),
        iso: isNaN(now.getTime()) ? '' : now.toISOString()
      });
    }
    return out;
  }

  function syncFromServer() {
    if (location.protocol === 'file:') return Promise.resolve();
    return fetch('/api/attendance')
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (!text) return;
        const fileRows = rowsToRecords(parseCSV(text));
        if (!fileRows.length) return;
        const existing = getRecords();
        const have = new Set(existing.map((r) => r.id));
        const missing = fileRows.filter((r) => r.id && !have.has(r.id));
        if (missing.length) {
          saveRecords(existing.concat(missing));
          renderTable();
        }
      })
      .catch(() => {});
  }

  function clearAll() {
    if (!confirm('Delete all attendance records?')) return;
    saveRecords([]);
    renderTable();
    overwriteAttendance([]);
    showToast('All records cleared');
  }

  function showShareCard() {
    if (location.protocol === 'file:' || !shareCard || typeof qrcode !== 'function') return;
    fetch('/api/host').then((res) => (res.ok ? res.json() : null)).then((info) => {
      if (!info || !info.url) return;
      shareUrlEl.textContent = info.url;
      shareUrlEl.href = info.url;
      const qr = qrcode(0, 'M');
      qr.addData(info.url);
      qr.make();
      qrBox.innerHTML = qr.createImgTag(5, 12);
      shareCard.hidden = false;
      showToast('Share: ' + info.url);
    }).catch(() => {});
  }

  btnStartCamera.addEventListener('click', startCamera);
  btnCapture.addEventListener('click', capture);
  btnRetake.addEventListener('click', retake);
  fileInput.addEventListener('change', handleFileUpload);
  btnSave.addEventListener('click', save);
  btnExportAttendance.addEventListener('click', exportAttendance);
  btnExportPdf.addEventListener('click', exportPdf);

  attendanceFile.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { importAttendance(reader.result); e.target.value = ''; };
    reader.onerror = () => showToast('Could not read file');
    reader.readAsText(f);
  });

  btnClearAll.addEventListener('click', clearAll);

  resetToIdle();
  if (location.protocol === 'file:') {
    modeNotice.hidden = false;
    renderTable();
  } else {
    showShareCard();
    syncFromServer().then(() => {
      renderTable();
      bootstrapCamera();
    });
    checkServerVersion();
  }
})();

  function checkServerVersion() {
    fetch('/api/ping')
      .then((res) => {
        if (!res.ok) {
          modeNotice.hidden = false;
          modeNotice.innerHTML = '<strong>Your server is outdated — photos cannot save.</strong> ' +
            'Close the black server window, then double-click <strong>start.bat</strong> again.';
        }
      })
      .catch(() => {});
  }