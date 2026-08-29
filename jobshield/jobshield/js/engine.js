/* ==========================================================================
   JobShield — Analysis Engine (Phase 1-3 demo implementation)

   This is a transparent, client-side, KEYWORD/HEURISTIC based scoring
   engine — it is a stand-in for the real AI-assisted backend described in
   the project's later phases (see README.md, Phase 5). It exists so the
   full frontend flow — submit, process, score, explain, recommend, save —
   is genuinely functional for demos, without requiring a live AI API key
   or backend deployment. Swap `runAnalysis()`'s internals for a real
   backend call and every screen downstream keeps working unchanged.
   ========================================================================== */

const JobShieldEngine = (() => {

  // Each rule: id, label, category, weight, matcher(text) -> bool, explain(text)
  const RULES = [
    {
      id: 'payment',
      name: 'Payment Request',
      weight: 30,
      test: t => /(registration fee|processing fee|security deposit|refundable deposit|pay.{0,15}(to (start|join|secure)|before you start)|advance payment|training fee|kit fee|joining fee)/i.test(t),
      text: 'The posting asks applicants to pay a fee — registration, training, deposit, or similar — before or during hiring.',
      recoLow: null,
    },
    {
      id: 'salary',
      name: 'Salary Claim',
      weight: 18,
      test: t => /(₹\s?[5-9]\d,?\d{3,}\s?\/?\s?(day|week)|\$\s?\d{3,}\s?\/?\s?(day|week)|earn.{0,20}(daily|weekly|per day)|guaranteed income|no experience.{0,25}(high pay|high salary|lakh))/i.test(t),
      text: 'The advertised compensation looks unusually high relative to the stated role, experience level, or working hours.',
    },
    {
      id: 'contact',
      name: 'Contact Information',
      weight: 14,
      test: t => /(whatsapp only|contact.{0,15}on whatsapp|@gmail\.com|@yahoo\.com|@hotmail\.com|telegram (only|group)|no official email)/i.test(t),
      text: 'Contact is routed through a free personal email domain or a messaging app instead of an official company channel.',
    },
    {
      id: 'urgency',
      name: 'Urgency & Pressure',
      weight: 16,
      test: t => /(limited (seats|slots)|act now|apply immediately|only \d+ (spots|seats|positions) left|urgent(ly)? (hiring|required)|hurry|offer expires|today only|immediate joining)/i.test(t),
      text: 'The posting uses pressure-based language pushing applicants toward an immediate decision, which limits time to verify details.',
    },
    {
      id: 'personal-info',
      name: 'Sensitive Data Requests',
      weight: 20,
      test: t => /(bank account (number|details)|aadhaar|passport number|otp|credit card|debit card|upi pin|ifsc code|social security)/i.test(t),
      text: 'The posting or process requests sensitive personal or financial information earlier than a legitimate hiring process typically requires.',
    },
    {
      id: 'links',
      name: 'External / Unofficial Links',
      weight: 10,
      test: t => /(bit\.ly|tinyurl|shorturl|forms\.gle\/[a-z0-9]|click here to (register|verify|claim))/i.test(t),
      text: 'The posting relies on a shortened or generic form link rather than an official company domain.',
    },
    {
      id: 'company-info',
      name: 'Missing Company Details',
      weight: 15,
      test: t => !/(pvt\.?\s?ltd|private limited|inc\.|llc|technologies|solutions|systems|corp|company name|www\.[a-z0-9-]+\.[a-z]{2,})/i.test(t),
      text: 'Important employer information — a registered name, an official website, or a verifiable address — is not clearly provided.',
    },
    {
      id: 'process',
      name: 'Unusual Hiring Process',
      weight: 12,
      test: t => /(no interview|interview.{0,15}chat only|hired instantly|no resume (needed|required)|selected without interview)/i.test(t),
      text: 'The hiring process skips standard steps such as a resume review or interview, which is uncommon for a genuine role.',
    },
  ];

  const BASE_NOISE = 4; // small baseline so a totally clean text isn't a hard 0

  function checkMissingRequiredFields(parsedListing) {
    const normalized = parsedListing || {};
    const missing = [];
    const text = normalizeText((parsedListing && parsedListing.source) || '');

    if (!normalized.title) missing.push('job title');
    if (!normalized.company) missing.push('company name');
    if (!normalized.location) missing.push('location');
    if (!normalized.salary) missing.push('salary details');
    if (!normalized.employmentType && !normalized.workMode) missing.push('employment type or work mode');
    if (!/(?:[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}|\+?\d[\d\s-]{7,}|whatsapp)/i.test(text || '')) {
      missing.push('contact details');
    }

    if (!missing.length) return { missing: [], weight: 0, summary: null, id: 'missing-info', name: 'Missing Information' };

    const weight = Math.min(18, Math.max(8, missing.length * 5));
    const summary = missing.length >= 4
      ? 'The listing is missing several key hiring details, which makes it harder to verify the employer or the role.'
      : 'The listing does not clearly include a few essential hiring details, which reduces transparency and increases risk.';

    return {
      missing,
      weight,
      summary,
      id: 'missing-info',
      name: 'Missing Information',
    };
  }

  function classify(score) {
    if (score >= 70) return { level: 'HIGH RISK', tone: 'high', emoji: '🚨' };
    if (score >= 45) return { level: 'ELEVATED RISK', tone: 'elevated', emoji: '⚠️' };
    if (score >= 20) return { level: 'MEDIUM RISK', tone: 'medium', emoji: '!' };
    return { level: 'LOW RISK', tone: 'low', emoji: '✓' };
  }

  function normalizeText(text) {
    return (text || '').replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function extractJobInfo(text) {
    const cleaned = normalizeText(text);
    const info = {
      title: null,
      company: null,
      location: null,
      salary: null,
      experience: null,
      employmentType: null,
      workMode: null,
      skills: null,
      source: null,
    };

    const lines = cleaned.split(/\n+/).map(line => line.trim()).filter(Boolean);
    const titleLine = lines.find(line => /\b(intern(?:ship)?|developer|engineer|analyst|designer|manager|associate|executive|sales|marketing|business|customer|support)\b/i.test(line) && line.length < 100 && !/(salary|company|location|contact|whatsapp|gmail|aadhaar|pan|bank|urgent|hurry|fee)/i.test(line));
    if (titleLine) {
      info.title = titleLine.replace(/^[\-\*\d\.\s]+/, '').trim();
    }

    const explicitTitle = cleaned.match(/(?:position|role|job title|hiring for|opening for)\s*[:\-]\s*([A-Za-z0-9 &/\-]{3,80})/i);
    if (explicitTitle && !info.title) info.title = explicitTitle[1].trim();

    const companyPattern = /([A-Z][A-Za-z0-9&.'-]+(?:\s+(?:Solutions|Technologies|Systems|Pvt\.?\s?Ltd\.?|Private\s+Limited|Inc\.?|LLC|Corp\.?|Group)))/g;
    const companyMatches = [...cleaned.matchAll(companyPattern)];
    const companyMatch = companyMatches.find(match => !/(whatsapp|gmail|hurry|urgent|apply|job|salary|contact|fee)/i.test(match[1]));
    if (companyMatch) info.company = companyMatch[1].trim();

    const companyLabel = cleaned.match(/(?:company|organization|organisation|employer)\s*[:\-]\s*([A-Za-z0-9 &.,'\-]{2,80})/i);
    if (companyLabel && !info.company) info.company = companyLabel[1].trim();

    const locationMatch = cleaned.match(/(?:location|based in|work from|work mode)\s*[:\-]?\s*([A-Za-z0-9 ,\-]{2,80})/i) || cleaned.match(/\b(?:work from home|remote|wfh|hybrid|onsite|office)\b/i);
    if (locationMatch) info.location = (locationMatch[1] || locationMatch[0]).trim();

    const salaryMatch = cleaned.match(/(?:salary|pay|compensation|monthly salary|package)\s*[:\-]?\s*(₹\s?[\d,]+(?:\s*[-–]\s*₹?\s?[\d,]+)?\s*(?:per|\/)?\s*(?:month|day|week|year|annum))/i)
      || cleaned.match(/(₹\s?[\d,]+(?:\s*[-–]\s*₹?\s?[\d,]+)?\s*(?:per|\/)?\s*(?:month|day|week|year|annum))/i)
      || cleaned.match(/(?:salary|pay)\s*[:\-]?\s*(\$\s?[\d,]+(?:\s*[-–]\s*\$?\s?[\d,]+)?\s*(?:per|\/)?\s*(?:month|day|week|year))/i);
    if (salaryMatch) info.salary = (salaryMatch[1] || salaryMatch[0]).trim();

    const expMatch = cleaned.match(/(?:experience|required|eligibility)\s*[:\-]?\s*([A-Za-z0-9 .,+-]{2,80})/i) || cleaned.match(/\b(?:fresher|no experience|0[- ]?1 year|1[- ]?2 years?|2[- ]?3 years?|3[- ]?5 years?)\b/i);
    if (expMatch) info.experience = (expMatch[1] || expMatch[0]).trim();

    const employmentTypeMatch = cleaned.match(/(?:employment type|job type)\s*[:\-]?\s*([A-Za-z0-9 ,\-]{2,50})/i);
    if (employmentTypeMatch) info.employmentType = employmentTypeMatch[1].trim();

    const workModeMatch = cleaned.match(/(?:work mode|mode of work|work from)\s*[:\-]?\s*([A-Za-z0-9 ,\-]{2,50})/i) || cleaned.match(/\b(?:work from home|remote|wfh|hybrid|onsite)\b/i);
    if (workModeMatch) info.workMode = (workModeMatch[1] || workModeMatch[0]).trim();

    const skillsMatch = cleaned.match(/(?:skills|requirements|preferred skills)\s*[:\-]?\s*([A-Za-z0-9 ,/\-]{2,200})/i);
    if (skillsMatch) info.skills = skillsMatch[1].trim();

    return info;
  }

  /**
   * Run the heuristic scan over a body of text (from paste, URL-derived
   * content, or OCR/typed-fallback text from an image).
   */
  function scoreText(text) {
    const cleaned = normalizeText(text);
    const t = cleaned.toLowerCase();
    const factors = [];
    let raw = BASE_NOISE;

    const jobInfo = extractJobInfo(cleaned);
    const missingInfo = checkMissingRequiredFields(jobInfo);
    if (missingInfo && missingInfo.weight) {
      raw += missingInfo.weight;
      factors.push({
        id: missingInfo.id,
        name: missingInfo.name,
        weight: missingInfo.weight,
        text: missingInfo.summary,
      });
    }

    RULES.forEach(rule => {
      if (rule.test(t)) {
        raw += rule.weight;
        factors.push({
          id: rule.id,
          name: rule.name,
          weight: rule.weight,
          text: rule.text,
        });
      }
    });

    const score = Math.max(0, Math.min(100, Math.round(raw)));
    const { level, tone, emoji } = classify(score);

    // Rank factors by weight for display severity, cap at 6 shown
    factors.sort((a, b) => b.weight - a.weight);
    const factorsOut = factors.slice(0, 6).map(f => ({
      ...f,
      severity: f.weight >= 20 ? 'high' : f.weight >= 13 ? 'elevated' : 'medium',
    }));

    const result = {
      score,
      riskScore: score,
      level,
      riskLevel: level,
      tone,
      emoji,
      factors: factorsOut,
      riskFactors: factorsOut,
      jobInfo,
      recommendations: recommendations(tone),
      analyzedAt: new Date().toISOString(),
    };
    return result;
  }

  async function scoreUrl(url) {
    let combinedText = url || '';
    try {
      const safeUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const u = new URL(safeUrl);
      if (u.protocol !== 'https:') combinedText += ' not-https ';
      if (/bit\.ly|tinyurl|shorturl|is\.gd/i.test(u.hostname)) combinedText += ' click here to verify shortened link ';
      if (/\d{3,}/.test(u.hostname) || /-jobs?-|-hiring-|freegift/i.test(u.hostname)) combinedText += ' limited seats urgent ';
      if (!/\.(com|org|in|net|co)$/i.test(u.hostname)) combinedText += ' missing company details ';

      try {
        const response = await fetch(u.toString(), { method: 'GET', mode: 'cors' });
        if (response.ok) {
          const html = await response.text();
          const textFromHtml = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (textFromHtml) combinedText += ` ${textFromHtml}`;
        }
      } catch (error) {
        // Fall back to URL-based heuristic scanning when the page cannot be fetched directly.
      }
    } catch (e) {
      combinedText = `${url || ''} missing company details suspicious job posting`;
    }

    const result = scoreText(combinedText);
    result.jobInfo = result.jobInfo || {};
    result.jobInfo.source = url;
    return result;
  }

  function recommendations(tone) {
    if (tone === 'high' || tone === 'elevated') {
      return [
        'Do not pay any registration, training, or "refundable" deposit fees.',
        'Verify the company independently through its official website and registered address.',
        'Confirm the recruiter is using an official company email domain, not a free provider.',
        'Avoid sharing bank details, ID numbers, or OTPs during early hiring stages.',
        'Cross-check the posting on trusted job platforms before responding further.',
      ];
    }
    return [
      'Still verify the employer independently, even for lower-risk postings.',
      'Check the official company website and look for an "About" or careers page.',
      'Confirm the recruiter\'s identity and role before an interview.',
      'Avoid sharing sensitive personal information unless the process clearly requires it.',
    ];
  }

  return { scoreText, scoreUrl, recommendations, classify, checkMissingRequiredFields };
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
