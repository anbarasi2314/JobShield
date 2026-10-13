/* ==========================================================================
   JobShield — Analyzer page controller
   ========================================================================== */

(() => {
  const stageInput = document.getElementById('stage-input');
  const stageProcessing = document.getElementById('stage-processing');
  const stageResults = document.getElementById('stage-results');

  let lastResult = null;
  let lastInputLabel = '';

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

  const textInput = document.getElementById('text-input');
  const charCount = document.getElementById('char-count');
  textInput.addEventListener('input', () => {
    charCount.textContent = `${textInput.value.length.toLocaleString()} / 10,000 characters`;
  });

  document.getElementById('analyze-text-btn').addEventListener('click', async () => {
    const val = textInput.value.trim();
    const err = document.getElementById('text-error');
    if (!val) { err.classList.add('show'); return; }
    err.classList.remove('show');
    lastInputLabel = 'Pasted job text';
    runFlow(async () => JobShieldEngine.scoreText(val));
  });

  const urlInput = document.getElementById('url-input');
  document.getElementById('analyze-url-btn').addEventListener('click', async () => {
    const val = urlInput.value.trim();
    const err = document.getElementById('url-error');
    const valid = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(val);
    if (!val || !valid) { err.classList.add('show'); return; }
    err.classList.remove('show');
    lastInputLabel = val;
    runFlow(async () => JobShieldEngine.scoreUrl(val));
  });

  const dropzone = document.getElementById('dropzone');
  const imageInput = document.getElementById('image-input');
  const preview = document.getElementById('upload-preview');
  const previewImg = document.getElementById('upload-preview-img');
  const previewName = document.getElementById('upload-preview-name');
  const previewSize = document.getElementById('upload-preview-size');
  let currentFile = null;

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
    if (!validType) { err.textContent = ''; err.innerHTML = `${Icons.alert(15)}Please upload JPG, PNG, JPEG or WEBP.`; err.classList.add('show'); return; }
    if (file.size > 10 * 1024 * 1024) { err.innerHTML = `${Icons.alert(15)}Image size exceeds the 10 MB limit.`; err.classList.add('show'); return; }

    currentFile = file;
    const reader = new FileReader();
    reader.onload = e => { previewImg.src = e.target.result; };
    reader.readAsDataURL(file);
    previewName.textContent = file.name;
    previewSize.textContent = `${(file.size / 1024).toFixed(0)} KB`;
    preview.classList.add('show');
    dropzone.style.display = 'none';
  }

  document.getElementById('upload-remove').addEventListener('click', () => {
    currentFile = null;
    imageInput.value = '';
    preview.classList.remove('show');
    dropzone.style.display = '';
  });
  document.getElementById('upload-replace').addEventListener('click', () => imageInput.click());

  async function extractImageText(file) {
    const fallbackText = document.getElementById('image-ocr-fallback').value.trim();
    if (fallbackText) return fallbackText;

    if (typeof window === 'undefined' || !window.Tesseract) {
      return '';
    }

    try {
      const result = await window.Tesseract.recognize(file, 'eng', { logger: () => {} });
      return (result && result.data && typeof result.data.text === 'string') ? result.data.text : '';
    } catch (error) {
      return '';
    }
  }

  document.getElementById('analyze-image-btn').addEventListener('click', async () => {
    const err = document.getElementById('image-error');
    if (!currentFile) { err.innerHTML = `${Icons.alert(15)}Please upload a screenshot before analyzing.`; err.classList.add('show'); return; }
    err.classList.remove('show');
    lastInputLabel = currentFile.name;
    runFlow(async () => {
      const extractedText = await extractImageText(currentFile);
      const jobInfo = JobShieldEngine.extractJobInfo(extractedText);
      const aiDetection = JobShieldEngine.detectAIContent(extractedText);
      const result = JobShieldEngine.calculateRiskScore({
        text: extractedText || 'No text could be extracted from the uploaded image. The image was analyzed only for visual clues and the job details remain incomplete.',
        jobInfo,
        aiDetection,
        source: `Screenshot: ${currentFile.name}`,
        warning: extractedText ? null : 'No OCR text could be extracted from the image. The risk score reflects missing information and should be treated as limited-evidence guidance.',
      });
      result.jobInfo.source = `Screenshot: ${currentFile.name}`;
      return result;
    });
  });

  const stepEls = document.querySelectorAll('.p-step');
  const ringFill = document.getElementById('ring-fill');
  const RING_CIRC = 264;

  async function runFlow(getResult) {
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
        setTimeout(async () => {
          try {
            lastResult = await Promise.resolve(getResult());
            showResults(lastResult);
          } catch (error) {
            lastResult = JobShieldEngine.calculateRiskScore({
              text: `Analysis failed: ${error && error.message ? error.message : 'Unknown error'}.`,
              jobInfo: { ...JobShieldEngine.extractJobInfo(''), source: lastInputLabel },
              aiDetection: { flagged: false, flaggedHigh: false, confidence: 0, label: 'Unavailable', reasons: ['The analysis could not complete.'] },
              warning: 'The submission could not be fully analyzed. This is not proof of fraud, just limited evidence.',
            });
            lastResult.jobInfo.source = lastInputLabel;
            showResults(lastResult);
          }
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

    const factors = Array.isArray(result.factors) ? result.factors : [];
    const ai = result.aiDetection || { flagged: false, flaggedHigh: false, confidence: 0, label: 'No strong AI signal', reasons: ['No strong AI-generation pattern detected.'] };
    const missingWarnings = Array.isArray(result.missingInfoWarnings) ? result.missingInfoWarnings : [];

    document.getElementById('meter-score').innerHTML = `${result.score} <small>/100</small>`;
    const badge = document.getElementById('meter-badge');
    badge.className = `risk-badge ${result.tone}`;
    badge.innerHTML = `<span class="dot"></span>${result.level} ${result.emoji}`;

    const summary = result.warning || (
      result.tone === 'high'
        ? 'This job posting contains several indicators often seen in potentially fraudulent offers.'
        : result.tone === 'medium'
        ? 'This posting shows some warning signs or missing information that should be verified before you proceed.'
        : 'This posting shows few or no strong fraud indicators, though it is still wise to verify the employer independently.'
    );
    document.getElementById('results-summary-line').textContent = summary;
    document.getElementById('meter-summary').textContent =
      factors.length
        ? `${factors.length} indicator${factors.length > 1 ? 's' : ''} detected, including fraud signals and missing-information warnings.`
        : 'No strong indicator patterns were detected in the submitted content.';

    const arcLen = 290;
    const meterArc = document.getElementById('meter-arc');
    meterArc.style.strokeDasharray = String(arcLen);
    meterArc.style.strokeDashoffset = String(arcLen - (arcLen * (result.score / 100)));
    const riskColorVar = { low: 'var(--risk-low)', medium: 'var(--risk-medium)', elevated: 'var(--risk-elevated)', high: 'var(--risk-high)' }[result.tone] || 'var(--risk-medium)';
    meterArc.setAttribute('stroke', riskColorVar);

    const info = result.jobInfo || {};
    document.getElementById('job-info-grid').innerHTML = `
      <div class="job-info-item"><span>Job Title</span><strong>${fmt(info.title)}</strong></div>
      <div class="job-info-item"><span>Company</span><strong>${fmt(info.company)}</strong></div>
      <div class="job-info-item"><span>Location</span><strong>${fmt(info.location)}</strong></div>
      <div class="job-info-item"><span>Salary</span><strong>${fmt(info.salary)}</strong></div>
      <div class="job-info-item"><span>Experience</span><strong>${fmt(info.experience || 'NOT AVAILABLE')}</strong></div>
      <div class="job-info-item"><span>Source</span><strong>${fmt(info.source || lastInputLabel)}</strong></div>
    `;

    const aiBlock = document.getElementById('ai-detection-card');
    aiBlock.innerHTML = `
      <div class="info-card-head">
        <span class="info-card-label">AI Content Signal</span>
        <span class="mini-badge ${ai.flaggedHigh ? 'danger' : ai.flagged ? 'warning' : 'safe'}">${ai.label}</span>
      </div>
      <p class="info-card-value">Confidence: ${ai.confidence || 0}%</p>
      <ul class="mini-list">
        ${ai.reasons.map(r => `<li>${r}</li>`).join('')}
      </ul>
      <p class="tiny-note">AI detection is only one indicator and can produce false positives. It does not prove a job is fraudulent.</p>
    `;

    const missingBlock = document.getElementById('missing-info-card');
    if (missingWarnings.length) {
      missingBlock.innerHTML = `
        <div class="info-card-head">
          <span class="info-card-label">Missing Information</span>
          <span class="mini-badge warning">${missingWarnings.length} item${missingWarnings.length > 1 ? 's' : ''}</span>
        </div>
        <ul class="mini-list">
          ${missingWarnings.map(w => `<li>${w.name}: ${w.text}</li>`).join('')}
        </ul>
      `;
    } else {
      missingBlock.innerHTML = `
        <div class="info-card-head">
          <span class="info-card-label">Missing Information</span>
          <span class="mini-badge safe">No gaps</span>
        </div>
        <p class="tiny-note">The posting includes the main job details needed to assess the offer.</p>
      `;
    }

    const factorList = document.getElementById('factor-list');
    if (!factors.length) {
      factorList.innerHTML = `<p style="color:var(--text-dim);font-size:14px;">No specific risk factors were flagged in this submission.</p>`;
    } else {
      factorList.innerHTML = factors.map(f => {
        const color = { medium: 'var(--risk-medium)', elevated: 'var(--risk-elevated)', high: 'var(--risk-high)' }[f.severity] || 'var(--risk-medium)';
        const text = f.severity === 'high' ? '🔴' : f.severity === 'elevated' ? '🟠' : '🟡';
        return `
        <div class="factor-row">
          <div class="factor-head">
            <span class="factor-name">${text} ${f.name}</span>
            <span class="risk-badge ${f.severity}"><span class="dot"></span>${f.severity.toUpperCase()} RISK</span>
          </div>
          <p class="factor-text">${f.text}</p>
          <div class="factor-bar"><i style="width:${Math.min(100, Number(f.weight) * 3.2)}%;background:${color};"></i></div>
        </div>`;
      }).join('');
    }

    const explainList = document.getElementById('explain-list');
    explainList.innerHTML = factors.length
      ? factors.map((f, idx) => `
        <div class="explain-item">
          <span class="explain-num">${idx + 1}</span>
          <div><h4>${f.name}</h4><p>${f.text}</p></div>
        </div>`).join('')
      : `<div class="explain-item"><span class="explain-num">✓</span><div><h4>No major indicators found</h4><p>The submitted content did not match common scam-language or process patterns JobShield checks for. This is not a guarantee the offer is genuine.</p></div></div>`;

    document.getElementById('reco-list').innerHTML = JobShieldEngine.recommendations(result.level, ai)
      .map(r => `<div class="reco-item">${Icons.check(16)}<span>${r}</span></div>`).join('');

    JobShieldHistory.save({
      jobTitle: info.title || lastInputLabel || 'Untitled submission',
      company: info.company || null,
      score: result.score,
      level: result.level,
      tone: result.tone,
      date: result.analyzedAt,
    });
  }

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
      `Experience: ${info.experience || 'NOT AVAILABLE'}`,
      `Source: ${info.source || lastInputLabel || 'Not available'}`,
      '',
      'AI CONTENT SIGNAL',
      '-----------------',
      `${r.aiDetection ? r.aiDetection.label : 'No AI signal'} — confidence: ${r.aiDetection ? r.aiDetection.confidence : 0}%`,
      ...(r.aiDetection ? r.aiDetection.reasons.map(x => `- ${x}`) : []),
      '',
      'MISSING INFORMATION',
      '-------------------',
      ...(r.missingInfoWarnings && r.missingInfoWarnings.length ? r.missingInfoWarnings.map(x => `- ${x.name}: ${x.text}`) : ['- None identified.']),
      '',
      'DETECTED RISK FACTORS',
      '----------------------',
      ...(r.factors.length ? r.factors.map(f => `[${f.severity.toUpperCase()}] ${f.name} — ${f.text}`) : ['None detected.']),
      '',
      'RECOMMENDATIONS',
      '----------------',
      ...JobShieldEngine.recommendations(r.level, r.aiDetection).map(x => `- ${x}`),
      '',
      'DISCLAIMER',
      '----------',
      'This is an automated, indicator-based risk assessment, not a definitive determination.',
      'AI detection is only one signal and can produce false positives. Always verify employers independently before sharing information or money.',
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
