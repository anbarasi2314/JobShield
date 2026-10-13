/* ==========================================================================
   JobShield — Centralized Risk Engine

   This version keeps the same frontend-only design but replaces the old
   score-by-keyword logic with a single scoring flow that:
   - collects all fraud indicators,
   - validates missing critical information,
   - runs AI-content heuristics as an additional signal,
   - enforces minimum-risk rules for missing title/location/company,
   - and applies the final risk level consistently across text, URL, and image
   inputs.
   ========================================================================== */

const JobShieldEngine = (() => {
  const CONFIG = {
    thresholds: { low: 29, medium: 59, high: 60 },
    aiHighRisk: true,
    aiConfidenceHigh: 0.75,
    aiConfidenceMedium: 0.55,
    minimumMediumForMissingCriticalFields: true,
  };

  const RULES = [
    {
      id: 'payment',
      name: 'Payment Request',
      weight: 35,
      test: t => /(registration fee|processing fee|security deposit|refundable deposit|advance payment|training fee|kit fee|joining fee|pay.{0,20}(to (start|join|secure)|before you start)|pay upfront|registration charges)/i.test(t),
      text: 'The posting asks applicants to pay a fee before or during the hiring process, which is uncommon in legitimate hiring.',
    },
    {
      id: 'salary',
      name: 'Salary Claim',
      weight: 18,
      test: t => /(₹\s?[5-9]\d,?\d{3,}\s?(?:\/|per)?\s?(?:day|week)|\$\s?\d{3,}\s?(?:\/|per)?\s?(?:day|week)|guaranteed income|earn.{0,20}(daily|weekly|per day)|no experience.{0,25}(high pay|high salary|lakh))/i.test(t),
      text: 'The compensation is unusually high or unrealistic for the role, experience, or work pattern described.',
    },
    {
      id: 'contact',
      name: 'Contact Information',
      weight: 14,
      test: t => /(whatsapp only|contact.{0,15}on whatsapp|@gmail\.com|@yahoo\.com|@hotmail\.com|telegram (only|group)|no official email|reach us on whatsapp)/i.test(t),
      text: 'Contact is routed through a free personal email or messaging app instead of an official company channel.',
    },
    {
      id: 'urgency',
      name: 'Urgency & Pressure',
      weight: 16,
      test: t => /(limited (seats|slots)|act now|apply immediately|only \d+ (spots|seats|positions) left|urgent(ly)? (hiring|required)|hurry|offer expires|today only|immediate joining)/i.test(t),
      text: 'The posting uses pressure-based language that pushes applicants to decide quickly without proper verification.',
    },
    {
      id: 'personal-info',
      name: 'Sensitive Data Requests',
      weight: 30,
      test: t => /(bank account (number|details)|aadhaar|passport number|otp|credit card|debit card|upi pin|ifsc code|pan number|social security|account details)/i.test(t),
      text: 'The process requests sensitive personal or banking information much earlier than a standard hiring workflow would normally require.',
    },
    {
      id: 'links',
      name: 'External / Unofficial Links',
      weight: 10,
      test: t => /(bit\.ly|tinyurl|shorturl|forms\.gle\/[a-z0-9]|click here to (register|verify|claim)|join via link|register here)/i.test(t),
      text: 'The posting relies on shortened or generic links rather than a clear official company channel.',
    },
    {
      id: 'process',
      name: 'Unusual Hiring Process',
      weight: 12,
      test: t => /(no interview|interview.{0,15}chat only|hired instantly|no resume (needed|required)|selected without interview|immediate selection)/i.test(t),
      text: 'The hiring process skips standard screening steps such as a resume review or interview.',
    },
  ];

  const DEFAULT_INFO = {
    title: null,
    company: null,
    location: null,
    salary: null,
    experience: null,
    skills: null,
    contact: null,
    application: null,
    payment: null,
    source: null,
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function severityFromWeight(weight) {
    if (weight >= 25) return 'high';
    if (weight >= 13) return 'elevated';
    return 'medium';
  }

  function dedupeById(items) {
    const seen = new Set();
    return (items || []).filter(item => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function classifyByScore(score) {
    if (score >= CONFIG.thresholds.high) return { level: 'HIGH RISK', tone: 'high', emoji: '🚨' };
    if (score >= CONFIG.thresholds.low) return { level: 'MEDIUM RISK', tone: 'medium', emoji: '!' };
    return { level: 'LOW RISK', tone: 'low', emoji: '✓' };
  }

  function extractJobInfo(text) {
    const info = { ...DEFAULT_INFO };
    const raw = normalizeText(text);
    if (!raw) return info;

    const titlePatterns = [
      /(?:position|role|job title|hiring for|title)\s*[:\-]\s*([A-Za-z0-9 &/\-.]{3,80})/i,
      /\b([A-Z][A-Za-z0-9 &/\-.]{2,80}\s(?:Intern(?:ship)?|Engineer|Developer|Analyst|Designer|Manager|Associate|Executive|Specialist|Coordinator|Writer|Consultant|Architect))\b/i,
      /\b(?:Data Analyst(?: Intern)?|Software Engineer|Business Analyst|HR Executive|Marketing Executive|Customer Support Executive|Content Writer|UI\/UX Designer|Python Developer|Internship)\b/i,
    ];
    for (const pattern of titlePatterns) {
      const match = raw.match(pattern);
      if (match && match[1]) {
        info.title = match[1].trim();
        break;
      }
    }

    const companyPatterns = [
      /(?:company|organization|organisation|employer|firm)\s*[:\-]\s*([A-Za-z0-9 &.,'\-]{2,80})/i,
      /\bat\s+([A-Z][A-Za-z0-9 &.'\-]{2,80}(?:\s(?:Technologies|Technology|Solutions|Systems|Pvt\.?\s?Ltd\.?|Private Limited|Inc\.?|LLC|Corp\.?|Group|Labs|Consulting|Services))?)/i,
      /\bwith\s+([A-Z][A-Za-z0-9 &.'\-]{2,80}(?:\s(?:Technologies|Technology|Solutions|Systems|Pvt\.?\s?Ltd\.?|Private Limited|Inc\.?|LLC|Corp\.?|Group|Labs|Consulting|Services))?)/i,
    ];
    for (const pattern of companyPatterns) {
      const match = raw.match(pattern);
      if (match && match[1]) {
        info.company = match[1].trim();
        break;
      }
    }

    const locationPatterns = [
      /(?:location|based in|work from|city|place)\s*[:\-]\s*([A-Za-z0-9 .,'-]{2,80})/i,
      /\b(remote|work from home|wfh|hybrid|onsite|Bengaluru|Delhi|Mumbai|Hyderabad|Pune|Chennai|Kolkata|Noida|Gurugram|Jaipur)\b/i,
    ];
    for (const pattern of locationPatterns) {
      const match = raw.match(pattern);
      if (match && (match[1] || match[0])) {
        info.location = (match[1] || match[0]).trim();
        break;
      }
    }

    const salaryMatch = raw.match(/(?:salary|stipend|pay|compensation)\s*[:\-]?\s*(₹\s?[\d,]+(?:\s*[-–to]+\s*₹?\s?[\d,]+)?\s*(?:LPA|lakhs?|k|K)?|\$\s?[\d,]+(?:\s*[-–to]+\s*\$?\s?[\d,]+)?\s*(?:k|K)?)\b/i)
      || raw.match(/(₹\s?[\d,]+\s*(?:LPA|lakhs?|k|K)|\$\s?[\d,]+\s*(?:k|K))\b/i)
      || raw.match(/(₹\s?[\d,]+(?:\s*[-–to]+\s*₹?\s?[\d,]+)?\s*(?:per\s*(?:month|day|week|year)|\/\s*(?:month|day|week|year))?)/i);
    if (salaryMatch) info.salary = String(salaryMatch[1] || salaryMatch[0] || '').trim();

    const expMatch = raw.match(/(?:experience|requirements?)\s*[:\-]?\s*(?:required|minimum)?\s*(fresher|no experience|\d+\+?\s?years?\s?(?:of)?\s?experience|\d+\s?[-–to]?\s?\d*\s?years?|entry[- ]level|0-?\d+\s?years?)/i)
      || raw.match(/\b(fresher|no experience|\d+\+?\s?years?\s?(?:of)?\s?experience|\d+\s?[-–to]?\s?\d*\s?years?|entry[- ]level)\b/i);
    if (expMatch) info.experience = expMatch[1] || expMatch[0];

    const skillsMatch = raw.match(/(?:skills|required skills|must have|good to have)\s*[:\-]\s*([A-Za-z0-9, /&.()\-]{3,220})/i);
    if (skillsMatch) info.skills = skillsMatch[1].trim();

    const contactMatch = raw.match(/(?:contact|email|reach us|apply at|send resume to)\s*[:\-]?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+?\d{10,14}|whatsapp\s*[:\-]?\s*\+?\d{10,14})/i);
    if (contactMatch) info.contact = contactMatch[1].trim();

    const appMatch = raw.match(/(?:apply|application|submission)\s*(?:via|through|on|using)?\s*[:\-]?\s*([A-Za-z0-9 .,'/-]{2,80})/i);
    if (appMatch) info.application = appMatch[1].trim();

    const paymentMatch = raw.match(/(?:payment|registration|processing|training|deposit|joining)\s*(?:fee|charges?|amount)\s*[:\-]?\s*(₹?\s?[\d,]+|\$?\s?[\d,]+)/i);
    if (paymentMatch) info.payment = paymentMatch[0].trim();

    return info;
  }

  function detectAIContent(text) {
    const raw = normalizeText(text);
    if (!raw) {
      return {
        flagged: false,
        flaggedHigh: false,
        confidence: 0,
        label: 'No text available',
        reasons: ['No textual content was provided to evaluate.'],
      };
    }

    const lower = raw.toLowerCase();
    let score = 0;
    const reasons = [];

    const aiPhrases = [
      'dynamic team', 'innovative', 'cutting-edge', 'driven by', 'passionate', 'synergy', 'seamless', 'state-of-the-art',
      'fast-paced environment', 'revolutionize', 'game changer', 'excellent communication skills', 'disruptive', 'robust', 'solution-driven', 'collaborative',
      'unlock opportunities', 'transformative', 'strategic thinker', 'stay ahead'
    ];

    aiPhrases.forEach(phrase => {
      if (lower.includes(phrase)) {
        score += 8;
      }
    });

    if ((lower.match(/\b(?:we are looking for|we are seeking|seeking a motivated|dynamic individual|passionate professional)\b/gi) || []).length >= 2) {
      score += 12;
      reasons.push('The wording uses generic hiring language commonly associated with AI-generated copy.');
    }

    if ((lower.match(/\b(?:python|sql|excel|power bi|tableau|data analysis|analytics|business intelligence)\b/gi) || []).length >= 3) {
      score -= 10;
    }

    if (/(resume|interview|location|salary|company|apply|selection process|job description)/i.test(raw)) {
      score -= 4;
    }

    const bulletCount = (raw.match(/(?:^|\n)\s*[-*•]/g) || []).length;
    if (bulletCount >= 4) {
      score += 10;
      reasons.push('The description contains a highly repetitive bullet list structure often used in templated AI output.');
    }

    const genericWordCount = (lower.match(/\b(?:dynamic|passionate|innovative|excellent|cutting-edge|seamless|strategic|proactive|driven|collaborative|creative)\b/g) || []).length;
    if (genericWordCount >= 4) {
      score += 12;
      reasons.push('The text contains multiple generic buzzwords without enough concrete company or role details.');
    }

    const specificitySignals = [
      /\b(?:Bengaluru|Delhi|Mumbai|Hyderabad|Pune|Chennai|Kolkata|Noida|Gurugram|Jaipur)\b/i,
      /(?:company|organization|firm)\s*[:\-]/i,
      /(?:role|position|title)\s*[:\-]/i,
      /(?:salary|stipend|experience|location)\s*[:\-]/i,
      /\b[A-Z][a-z]+\s+(?:Technologies|Systems|Solutions|Private Limited|Pvt\.?\s?Ltd\.)\b/
    ];
    const specificityMatches = specificitySignals.filter(re => re.test(raw)).length;
    if (specificityMatches >= 2) score -= 8;

    const confidence = clamp(score / 100, 0, 1);
    const flaggedHigh = confidence >= CONFIG.aiConfidenceHigh;
    const flagged = confidence >= CONFIG.aiConfidenceMedium || flaggedHigh;

    return {
      flagged,
      flaggedHigh,
      confidence: Math.round(confidence * 100),
      label: flaggedHigh ? 'Highly likely AI-generated' : flagged ? 'Possibly AI-generated' : 'No strong AI-generation signal',
      reasons: reasons.length ? reasons : (flagged ? ['The language appears somewhat generic or template-like, but this is not proof of fraud.'] : ['The text used concrete, specific language and did not match typical AI-generation warning patterns.']),
    };
  }

  function buildFactor(id, name, weight, text, extra = {}) {
    return {
      id,
      name,
      weight,
      text,
      severity: extra.severity || severityFromWeight(weight),
      ...extra,
    };
  }

  function detectFraudFactors(text) {
    const normalized = normalizeText(text).toLowerCase();
    const factors = [];

    RULES.forEach(rule => {
      if (rule.test(normalized)) {
        factors.push(buildFactor(rule.id, rule.name, rule.weight, rule.text, { source: 'heuristic' }));
      }
    });

    return dedupeById(factors);
  }

  function calculateRiskScore(input = {}) {
    const sourceText = normalizeText(input.text || '');
    const jobInfo = {
      ...DEFAULT_INFO,
      ...(input.jobInfo || extractJobInfo(sourceText)),
    };
    const aiDetection = input.aiDetection || detectAIContent(sourceText);

    const factors = [...(input.factors || [])];
    const heuristicFactors = detectFraudFactors(sourceText);
    heuristicFactors.forEach(f => factors.push(f));

    const missingInfoWarnings = [];
    const criticalFieldChecks = [
      { key: 'title', label: 'Job title', weight: 18, text: 'The posting does not clearly state the role or position being offered.' },
      { key: 'location', label: 'Location', weight: 16, text: 'The posting does not clearly state where the role is based.' },
      { key: 'company', label: 'Company name', weight: 12, text: 'The posting does not identify the company or employer clearly.' },
    ];

    criticalFieldChecks.forEach(field => {
      if (!jobInfo[field.key]) {
        missingInfoWarnings.push({
          id: `missing-${field.key}`,
          name: `Missing ${field.label}`,
          weight: field.weight,
          text: field.text,
          severity: 'medium',
          source: 'missing-field',
        });
      }
    });

    if (!jobInfo.salary) {
      missingInfoWarnings.push({
        id: 'missing-salary',
        name: 'Missing salary information',
        weight: 6,
        text: 'The role does not clearly state the salary or stipend, which can make the offer harder to verify.',
        severity: 'medium',
        source: 'missing-field',
      });
    }

    missingInfoWarnings.forEach(m => {
      const exists = factors.some(f => f.id === m.id);
      if (!exists) factors.push(buildFactor(m.id, m.name, m.weight, m.text, { severity: m.severity, source: m.source }));
    });

    if (aiDetection && aiDetection.flaggedHigh && CONFIG.aiHighRisk) {
      factors.push(buildFactor('ai-generated', 'AI-generated content signal', 42, 'AI-content detection flagged the text as highly likely to be machine-generated or templated. This is only one indicator and can produce false positives.', { severity: 'high', source: 'ai-detector' }));
    } else if (aiDetection && aiDetection.flagged) {
      factors.push(buildFactor('ai-generated', 'AI-content signal', 18, 'AI-content detection suggests the posting may be formulaic or machine-generated. This should be treated as one signal and not as proof of fraud.', { severity: 'elevated', source: 'ai-detector' }));
    }

    const uniqueFactors = dedupeById(factors);
    const numericScore = uniqueFactors.reduce((total, factor) => total + Number(factor.weight || 0), 0);
    const cappedScore = clamp(Math.round(numericScore), 0, 100);

    let finalScore = cappedScore;
    const missingCritical = criticalFieldChecks.filter(field => !jobInfo[field.key]).length;
    if (CONFIG.minimumMediumForMissingCriticalFields && missingCritical > 0) {
      finalScore = Math.max(finalScore, 30);
    }

    const seriousFraud = uniqueFactors.filter(f => ['payment', 'personal-info', 'ai-generated'].includes(f.id) || f.weight >= 25).length;
    const hasHighRiskRule = aiDetection && aiDetection.flaggedHigh && CONFIG.aiHighRisk;
    if (hasHighRiskRule || seriousFraud >= 2) {
      finalScore = Math.max(finalScore, 60);
    }

    finalScore = clamp(finalScore, 0, 100);
    const classified = classifyByScore(finalScore);

    const evidence = {
      score: finalScore,
      level: classified.level,
      tone: classified.tone,
      emoji: classified.emoji,
      aiDetection,
      missingInfoWarnings,
      factors: uniqueFactors
        .sort((a, b) => Number(b.weight) - Number(a.weight))
        .slice(0, 8)
        .map(f => ({
          ...f,
          severity: f.severity || severityFromWeight(f.weight),
        })),
      jobInfo: {
        ...jobInfo,
        source: input.source || jobInfo.source || null,
      },
      analyzedAt: new Date().toISOString(),
      warning: input.warning || null,
    };

    evidence.level = (finalScore >= CONFIG.thresholds.high || hasHighRiskRule) ? 'HIGH RISK'
      : (finalScore >= CONFIG.thresholds.low || missingCritical > 0) ? 'MEDIUM RISK'
      : 'LOW RISK';
    evidence.tone = evidence.level === 'HIGH RISK' ? 'high' : evidence.level === 'MEDIUM RISK' ? 'medium' : 'low';
    evidence.emoji = evidence.level === 'HIGH RISK' ? '🚨' : evidence.level === 'MEDIUM RISK' ? '!' : '✓';

    return evidence;
  }

  function scoreText(text) {
    const cleanText = normalizeText(text);
    const jobInfo = extractJobInfo(cleanText);
    const aiDetection = detectAIContent(cleanText);
    return calculateRiskScore({ text: cleanText, jobInfo, aiDetection, source: 'Pasted job text' });
  }

  async function fetchUrlContent(url) {
    const safeUrl = normalizeText(url);
    if (!safeUrl) {
      return { ok: false, text: '', error: 'A URL was not provided.' };
    }

    let parsed;
    try {
      parsed = new URL(/^https?:\/\//i.test(safeUrl) ? safeUrl : `https://${safeUrl}`);
    } catch (error) {
      return { ok: false, text: '', error: 'The provided URL is malformed or cannot be parsed.' };
    }

    try {
      const response = await fetch(parsed.toString(), {
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}.`);
      const html = await response.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text ? { ok: true, text, url: parsed.toString() } : { ok: false, text: '', error: 'The page loaded, but no readable text could be extracted.' };
    } catch (error) {
      return { ok: false, text: '', error: 'The page could not be downloaded or is blocked by browser security settings or CORS.' };
    }
  }

  async function scoreUrl(url) {
    const safeUrl = normalizeText(url);
    if (!safeUrl) {
      return calculateRiskScore({
        text: 'No job URL was provided.',
        jobInfo: { ...DEFAULT_INFO, source: safeUrl },
        aiDetection: { flagged: false, flaggedHigh: false, confidence: 0, label: 'Unavailable', reasons: ['No URL was supplied.'] },
        warning: 'No URL was provided for analysis.',
      });
    }

    let fetchResult;
    try {
      fetchResult = await fetchUrlContent(safeUrl);
    } catch (error) {
      fetchResult = { ok: false, text: '', error: String(error) };
    }

    const extractedText = fetchResult.ok ? fetchResult.text : `The URL could not be accessed for extraction. ${fetchResult.error} This does not automatically mean the job is fraudulent; the page may be blocked, inaccessible, or protected from automated reading.`;
    const aiDetection = detectAIContent(extractedText);
    const result = calculateRiskScore({
      text: extractedText,
      jobInfo: extractJobInfo(extractedText),
      aiDetection,
      source: fetchResult.url || safeUrl,
      warning: fetchResult.ok ? null : 'Insufficient evidence: the URL could not be accessed or parsed. This is not proof of fraud.',
    });

    if (!fetchResult.ok) {
      result.warning = 'Insufficient evidence: the URL could not be accessed or parsed. This is not proof of fraud.';
      result.factors.push(buildFactor('url-unreadable', 'URL content not accessible', 12, 'The page could not be accessed or parsed so the assessment is based on limited evidence only.', { severity: 'medium', source: 'url-fetch' }));
      result.factors = dedupeById(result.factors).sort((a, b) => Number(b.weight) - Number(a.weight));
      result.score = clamp(Math.max(result.score, 20), 0, 100);
      result.level = result.score >= 60 ? 'HIGH RISK' : result.score >= 30 ? 'MEDIUM RISK' : 'LOW RISK';
      result.tone = result.level === 'HIGH RISK' ? 'high' : result.level === 'MEDIUM RISK' ? 'medium' : 'low';
      result.emoji = result.level === 'HIGH RISK' ? '🚨' : result.level === 'MEDIUM RISK' ? '!' : '✓';
    }

    return result;
  }

  function scoreCombined(evidence = {}) {
    const textSegments = [
      evidence.text || '',
      evidence.urlText || '',
      evidence.imageText || '',
    ].filter(Boolean);

    const combinedText = textSegments.join('\n');
    const jobInfo = extractJobInfo(combinedText);
    const aiDetection = detectAIContent(combinedText);
    return calculateRiskScore({ text: combinedText, jobInfo, aiDetection, source: evidence.source || 'Combined evidence' });
  }

  function recommendations(level, aiDetection) {
    const base = [
      'Verify the company independently through its official website, registration details, and a real careers page.',
      'Look for a proper interview process, recruiter identity, and business email rather than personal inboxes or chats.',
      'Never pay a fee, deposit, or advance payment before confirming the company and role are authentic.',
      'Avoid sharing bank details, Aadhaar, PAN, passport, or OTPs unless the hiring process is clearly established and legitimate.',
    ];

    if (level === 'HIGH RISK' || level === 'MEDIUM RISK') {
      base.unshift('Treat this as a warning sign, not proof of fraud — use it to prompt independent verification before you proceed.');
    }

    if (aiDetection && aiDetection.flaggedHigh) {
      base.unshift('AI-content detection suggests the text may be templated or machine-generated. This can be a false positive, so check the company and hiring process independently.');
    }

    return base;
  }

  return { CONFIG, classify: classifyByScore, scoreText, scoreUrl, scoreCombined, recommendations, extractJobInfo, detectAIContent, calculateRiskScore };
})();

/* ---------------------------------- History store ---------------------------------- */

const JobShieldHistory = (() => {
  const KEY = 'jobshield_history_v1';

  function all() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }

  function save(entry) {
    const list = all();
    list.unshift(entry);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100)));
  }

  function clear() { localStorage.removeItem(KEY); }

  return { all, save, clear };
})();
