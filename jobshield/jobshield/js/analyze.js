/* ==========================================================================
   JobShield — Analyzer page controller
   ========================================================================== */

(() => {
  const stageInput = document.getElementById('stage-input');
  const stageProcessing = document.getElementById('stage-processing');
  const stageResults = document.getElementById('stage-results');

  let lastResult = null;
  let lastInputLabel = '';

  // ---------------- Tab switching ----------------
  const tabs = document.querySelectorAll('.method-tab');
  const panels = document.querySelectorAll('.input-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      panels.forEach(p => p.classList.toggle('input-panel-hidden', p.dataset.panel !== target));
    });
  });

  // ---------------- Text panel ----------------
  const textInput = document.getElementById('text-input');
  const charCount = document.getElementById('char-count');
  textInput.addEventListener('input', () => {
    charCount.textContent = `${textInput.value.length.toLocaleString()} / 10,000 characters`;
  });

  document.getElementById('analyze-text-btn').addEventListener('click', () => {
    const val = textInput.value.trim();
    const err = document.getElementById('text-error');
    if (!val) { err.classList.add('show'); return; }
    err.classList.remove('show');
    lastInputLabel = 'Pasted job text';
    runFlow(() => JobShieldEngine.scoreText(val));
  });

  // ---------------- URL panel ----------------
  const urlInput = document.getElementById('url-input');
  document.getElementById('analyze-url-btn').addEventListener('click', () => {
    const val = urlInput.value.trim();
    const err = document.getElementById('url-error');
    const valid = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(val);
    if (!val || !valid) { err.classList.add('show'); return; }
    err.classList.remove('show');
    lastInputLabel = val;
    runFlow(async () => {
      const result = await JobShieldEngine.scoreUrl(val);
      result.jobInfo = result.jobInfo || {};
      result.jobInfo.source = val;
      return result;
    });
  });

  // ---------------- Image panel ----------------
  const dropzone = document.getElementById('dropzone');
  const imageInput = document.getElementById('image-input');
  const preview = document.getElementById('upload-preview');
  const previewImg = document.getElementById('upload-preview-img');
  const previewName = document.getElementById('upload-preview-name');
  const previewSize = document.getElementById('upload-preview-size');
  const uploadStatus = document.getElementById('upload-status');
  let currentFile = null;

  function setUploadStatus(message, tone = 'neutral') {
    uploadStatus.textContent = message;
    uploadStatus.className = `upload-status ${tone}`;
  }

  dropzone.addEventListener('click', () => imageInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  imageInput.addEventListener('change', () => { if (imageInput.files[0]) handleFile(imageInput.files[0]); });

  function handleFile(file) {
    const err = document.getElementById('image-error');
    err.classList.remove('show');
    const validType = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!validType) { err.textContent = ''; err.innerHTML = `${Icons.alert(15)}Please upload JPG, PNG, JPEG or WEBP.`; err.classList.add('show'); setUploadStatus('Unsupported file type. Please upload JPG, JPEG, PNG, or WEBP.', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { err.innerHTML = `${Icons.alert(15)}Image size exceeds the 10 MB limit.`; err.classList.add('show'); setUploadStatus('Image is too large. Please upload a screenshot under 10 MB.', 'error'); return; }

    currentFile = file;
    const reader = new FileReader();
    reader.onload = e => { previewImg.src = e.target.result; };
    reader.readAsDataURL(file);
    previewName.textContent = file.name;
    previewSize.textContent = `${(file.size / 1024).toFixed(0)} KB`;
    preview.classList.add('show');
    dropzone.style.display = 'none';
    setUploadStatus('Image ready for OCR analysis.', 'success');
  }

  document.getElementById('upload-remove').addEventListener('click', () => {
    currentFile = null;
    imageInput.value = '';
    preview.classList.remove('show');
    dropzone.style.display = '';
    setUploadStatus('No image uploaded yet.', 'neutral');
  });
  document.getElementById('upload-replace').addEventListener('click', () => imageInput.click());

  async function extractImageText(file) {
    if (!window.Tesseract || !window.Tesseract.recognize) {
      throw new Error('Unable to extract readable text from this image. Please upload a clearer screenshot.');
    }

    const { data } = await window.Tesseract.recognize(file, 'eng', {
      logger: () => {}
    });

    const extractedText = (data && data.text ? data.text : '').trim();
    if (!extractedText) {
      throw new Error('Unable to extract readable text from this image. Please upload a clearer screenshot.');
    }

    if (extractedText.length < 30 || !/[A-Za-z]/.test(extractedText)) {
      throw new Error('Not enough readable job information was found in this image.');
    }

    return extractedText;
  }

  document.getElementById('analyze-image-btn').addEventListener('click', () => {
    const err = document.getElementById('image-error');
    if (!currentFile) { err.innerHTML = `${Icons.alert(15)}Please upload a screenshot before analyzing.`; err.classList.add('show'); return; }
    err.classList.remove('show');
    const fallbackText = document.getElementById('image-ocr-fallback').value.trim();
    lastInputLabel = currentFile.name;

    runFlow(async () => {
      let extractedText = fallbackText;

      try {
        extractedText = await extractImageText(currentFile);
        setUploadStatus('Image analyzed successfully.', 'success');
      } catch (ocrError) {
        if (!fallbackText) {
          throw new Error(ocrError && ocrError.message ? ocrError.message : 'Unable to extract readable text from this image. Please upload a clearer screenshot.');
        }
        extractedText = fallbackText;
        setUploadStatus('OCR failed; using the typed fallback text for analysis.', 'warning');
      }

      const result = JobShieldEngine.scoreText(extractedText);
      result.jobInfo = result.jobInfo || {};
      result.jobInfo.source = `Screenshot: ${currentFile.name}`;
      return result;
    });
  });

  // ---------------- Processing → Results flow ----------------
  const stepEls = document.querySelectorAll('.p-step');
  const ringFill = document.getElementById('ring-fill');
  const RING_CIRC = 264;

  function runFlow(getResult) {
    stageInput.style.display = 'none';
    stageResults.classList.remove('show');
    stageProcessing.classList.add('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    stepEls.forEach(s => s.classList.remove('active', 'done'));
    ringFill.style.strokeDashoffset = RING_CIRC;

    let i = 0;
    const total = stepEls.length;
    const tick = () => {
      if (i > 0) stepEls[i - 1].classList.remove('active');
      if (i > 0) stepEls[i - 1].classList.add('done');
      if (i < total) {
        stepEls[i].classList.add('active');
        ringFill.style.strokeDashoffset = String(RING_CIRC - (RING_CIRC * ((i + 1) / total)));
        i++;
        setTimeout(tick, 480);
      } else {
        setTimeout(() => {
          Promise.resolve(getResult())
            .then(result => {
              lastResult = result;
              showResults(lastResult);
            })
            .catch(error => {
              const message = error && error.message ? error.message : 'We couldn\'t complete the analysis. Please try again.';
              showResults({
                score: 0,
                level: 'ANALYSIS ERROR',
                tone: 'error',
                emoji: '⚠️',
                factors: [],
                error: message,
                jobInfo: { title: null, company: null, location: null, salary: null, experience: null, source: lastInputLabel || 'Submission' },
                analyzedAt: new Date().toISOString(),
              });
            });
        }, 380);
      }
    };
    tick();
  }

  function fmt(val) { return val ? val : '<span class="unavailable">Not available</span>'; }

  function showResults(result) {
    stageProcessing.classList.remove('show');
    stageResults.classList.add('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (result.error) {
      document.getElementById('meter-score').innerHTML = `— <small>/100</small>`;
      const badge = document.getElementById('meter-badge');
      badge.className = 'risk-badge high';
      badge.innerHTML = '<span class="dot"></span>ANALYSIS ERROR';
      document.getElementById('results-summary-line').textContent = result.error;
      document.getElementById('meter-summary').textContent = 'We couldn\'t complete the analysis. Please try again with a clearer screenshot or a more complete job description.';
      const meterArc = document.getElementById('meter-arc');
      const arcLen = 290;
      meterArc.style.strokeDasharray = String(arcLen);
      meterArc.style.strokeDashoffset = String(arcLen);
      meterArc.setAttribute('stroke', 'var(--risk-high)');
      const info = result.jobInfo || {};
      document.getElementById('job-info-grid').innerHTML = `
        <div class="job-info-item"><span>Job Title</span><strong>${fmt(info.title)}</strong></div>
        <div class="job-info-item"><span>Company</span><strong>${fmt(info.company)}</strong></div>
        <div class="job-info-item"><span>Location</span><strong>${fmt(info.location)}</strong></div>
        <div class="job-info-item"><span>Salary</span><strong>${fmt(info.salary)}</strong></div>
        <div class="job-info-item"><span>Experience</span><strong>${fmt(info.experience)}</strong></div>
        <div class="job-info-item"><span>Source</span><strong>${fmt(info.source || lastInputLabel)}</strong></div>
      `;
      document.getElementById('factor-list').innerHTML = `<p style="color:var(--text-dim);font-size:14px;">${result.error}</p>`;
      document.getElementById('explain-list').innerHTML = `<div class="explain-item"><span class="explain-num">!</span><div><h4>Analysis unavailable</h4><p>${result.error}</p></div></div>`;
      document.getElementById('reco-list').innerHTML = `<div class="reco-item">${Icons.alert(16)}<span>Please upload a clearer screenshot or try another job description.</span></div>`;
      return;
    }

    // Meter
    document.getElementById('meter-score').innerHTML = `${result.score} <small>/100</small>`;
    const badge = document.getElementById('meter-badge');
    badge.className = `risk-badge ${result.tone}`;
    badge.innerHTML = `<span class="dot"></span>${result.level} ${result.emoji}`;
    document.getElementById('results-summary-line').textContent =
      result.tone === 'high' || result.tone === 'elevated'
        ? 'This job posting contains several indicators commonly associated with potentially fraudulent job offers.'
        : result.tone === 'medium'
        ? 'This posting shows a small number of indicators worth double-checking before you proceed.'
        : 'This posting shows few or no common scam indicators — still verify the employer independently.';
    document.getElementById('meter-summary').textContent =
      result.factors.length
        ? `${result.factors.length} indicator${result.factors.length > 1 ? 's' : ''} detected across payment, contact, and process signals.`
        : 'No strong indicator patterns were detected in the submitted content.';

    const arcLen = 290;
    const meterArc = document.getElementById('meter-arc');
    meterArc.style.strokeDasharray = String(arcLen);
    meterArc.style.strokeDashoffset = String(arcLen - (arcLen * (result.score / 100)));
    const riskColorVar = { low: 'var(--risk-low)', medium: 'var(--risk-medium)', elevated: 'var(--risk-elevated)', high: 'var(--risk-high)' }[result.tone];
    meterArc.setAttribute('stroke', riskColorVar);

    // Job info
    const info = result.jobInfo || {};
    document.getElementById('job-info-grid').innerHTML = `
      <div class="job-info-item"><span>Job Title</span><strong>${fmt(info.title)}</strong></div>
      <div class="job-info-item"><span>Company</span><strong>${fmt(info.company)}</strong></div>
      <div class="job-info-item"><span>Location</span><strong>${fmt(info.location)}</strong></div>
      <div class="job-info-item"><span>Salary</span><strong>${fmt(info.salary)}</strong></div>
      <div class="job-info-item"><span>Experience</span><strong>${fmt(info.experience)}</strong></div>
      <div class="job-info-item"><span>Source</span><strong>${fmt(info.source || lastInputLabel)}</strong></div>
    `;

    // Factor breakdown
    const factorList = document.getElementById('factor-list');
    if (!result.factors.length) {
      factorList.innerHTML = `<p style="color:var(--text-dim);font-size:14px;">No specific risk factors were flagged in this submission.</p>`;
    } else {
      factorList.innerHTML = result.factors.map(f => {
        const color = { medium: 'var(--risk-medium)', elevated: 'var(--risk-elevated)', high: 'var(--risk-high)' }[f.severity];
        const dot = { medium: '🟡', elevated: '🟠', high: '🔴' }[f.severity];
        return `
        <div class="factor-row">
          <div class="factor-head">
            <span class="factor-name">${dot} ${f.name}</span>
            <span class="risk-badge ${f.severity}"><span class="dot"></span>${f.severity.toUpperCase()} RISK</span>
          </div>
          <p class="factor-text">${f.text}</p>
          <div class="factor-bar"><i style="width:${Math.min(100, f.weight * 3.2)}%;background:${color};"></i></div>
        </div>`;
      }).join('');
    }

    // Explanations
    const explainList = document.getElementById('explain-list');
    explainList.innerHTML = result.factors.length
      ? result.factors.map((f, idx) => `
        <div class="explain-item">
          <span class="explain-num">${idx + 1}</span>
          <div><h4>${f.name} detected</h4><p>${f.text}</p></div>
        </div>`).join('')
      : `<div class="explain-item"><span class="explain-num">✓</span><div><h4>No major indicators found</h4><p>The submitted content didn't match common scam-language or process patterns JobShield checks for. This is not a guarantee the offer is legitimate.</p></div></div>`;

    // Recommendations
    document.getElementById('reco-list').innerHTML = JobShieldEngine.recommendations(result.tone)
      .map(r => `<div class="reco-item">${Icons.check(16)}<span>${r}</span></div>`).join('');

    // Save to history
    JobShieldHistory.save({
      jobTitle: info.title || lastInputLabel || 'Untitled submission',
      company: info.company || null,
      score: result.score,
      level: result.level,
      tone: result.tone,
      date: result.analyzedAt,
    });
  }

  // ---------------- Result actions ----------------
  document.getElementById('new-analysis-btn').addEventListener('click', resetToInput);
  document.getElementById('start-new-btn').addEventListener('click', e => { e.preventDefault(); resetToInput(); });

  function resetToInput() {
    stageResults.classList.remove('show');
    stageInput.style.display = '';
    textInput.value = ''; charCount.textContent = '0 / 10,000 characters';
    urlInput.value = '';
    document.getElementById('image-ocr-fallback').value = '';
    currentFile = null; imageInput.value = '';
    preview.classList.remove('show'); dropzone.style.display = '';
    setUploadStatus('No image uploaded yet.', 'neutral');
    document.querySelectorAll('.field-error').forEach(e => e.classList.remove('show'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('download-report-btn').addEventListener('click', () => {
    if (!lastResult) return;
    const r = lastResult;
    const info = r.jobInfo || {};
    const lines = [
      'JOBSHIELD — JOB SAFETY ANALYSIS REPORT',
      '========================================',
      `Generated: ${new Date(r.analyzedAt).toLocaleString()}`,
      '',
      `RISK SCORE: ${r.score} / 100`,
      `RISK LEVEL: ${r.level}`,
      '',
      'JOB INFORMATION',
      '----------------',
      `Title: ${info.title || 'Not available'}`,
      `Company: ${info.company || 'Not available'}`,
      `Location: ${info.location || 'Not available'}`,
      `Salary: ${info.salary || 'Not available'}`,
      `Experience: ${info.experience || 'Not available'}`,
      `Source: ${info.source || lastInputLabel || 'Not available'}`,
      '',
      'DETECTED RISK FACTORS',
      '----------------------',
      ...(r.factors.length ? r.factors.map(f => `[${f.severity.toUpperCase()}] ${f.name} — ${f.text}`) : ['None detected.']),
      '',
      'RECOMMENDATIONS',
      '----------------',
      ...JobShieldEngine.recommendations(r.tone).map(x => `- ${x}`),
      '',
      'DISCLAIMER',
      '----------',
      'This is an automated, indicator-based risk assessment, not a definitive determination.',
      'Always verify employers independently before sharing information or money.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `jobshield-report-${Date.now()}.txt`;
    a.click();
    showToast('Report downloaded');
  });

  document.getElementById('share-results-btn').addEventListener('click', async () => {
    if (!lastResult) return;
    const text = `JobShield analysis: ${lastResult.score}/100 — ${lastResult.level}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'JobShield Analysis', text }); } catch (e) {}
    } else {
      try { await navigator.clipboard.writeText(text); showToast('Summary copied to clipboard'); }
      catch (e) { showToast(text); }
    }
  });
})();
