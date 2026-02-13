#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
};

function colorize(color, text) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function exists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function walkFiles(dir, out = []) {
  if (!exists(dir)) return out;
  const ignored = new Set(['node_modules', '.next', '.open-next', '.git', '.vercel', '.wrangler', 'out']);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function parseEnvFile(filePath) {
  const env = {};
  if (!exists(filePath)) return env;
  const content = readFileSafe(filePath);
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function collectProjectFiles() {
  const srcFiles = walkFiles(path.join(root, 'src'));
  const supabaseFiles = walkFiles(path.join(root, 'supabase'));
  const scriptsFiles = walkFiles(path.join(root, 'scripts'));
  const rootSql = fs.readdirSync(root).filter((f) => f.endsWith('.sql')).map((f) => path.join(root, f));
  return [...srcFiles, ...supabaseFiles, ...scriptsFiles, ...rootSql];
}

function grepFiles(files, regex) {
  const matches = [];
  for (const file of files) {
    const content = readFileSafe(file);
    if (!content) continue;
    if (regex.test(content)) matches.push(file);
  }
  return matches;
}

function makeResult(id, title, status, details, remediation = '') {
  return { id, title, status, details, remediation };
}

function runChecks() {
  const files = collectProjectFiles();
  const apiFiles = walkFiles(path.join(root, 'src', 'app', 'api')).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  const sqlFiles = files.filter((f) => f.endsWith('.sql') || rel(f).includes('supabase/migrations') || rel(f).includes('supabase-schema'));

  const envLocal = parseEnvFile(path.join(root, '.env.local'));
  const envProduction = parseEnvFile(path.join(root, '.env.production'));
  const env = { ...envProduction, ...envLocal, ...process.env };

  const results = [];

  // 1) Rate limits
  const rateLimitStrong = grepFiles(
    [...apiFiles, path.join(root, 'src', 'middleware.ts')],
    /(rate\s*limit|ratelimit|upstash|limiter|too many requests|x-ratelimit)/i,
  );
  const rateLimitWeak = grepFiles(apiFiles, /(MAX_BODY_BYTES|Math\.min\(raw\.length,\s*\d+\))/i);
  if (rateLimitStrong.length > 0) {
    results.push(makeResult('rate_limits', 'Rate limits', 'PASS', `Found rate limit controls in: ${rateLimitStrong.map(rel).join(', ')}`));
  } else if (rateLimitWeak.length > 0) {
    results.push(makeResult(
      'rate_limits',
      'Rate limits',
      'WARN',
      `Found payload caps but no explicit per-IP/per-user rate limiting. Files: ${rateLimitWeak.map(rel).join(', ')}`,
      'Add request rate limiting in middleware/API (per IP + per user token buckets).',
    ));
  } else {
    results.push(makeResult(
      'rate_limits',
      'Rate limits',
      'FAIL',
      'No explicit rate limiting controls detected in Next API routes or middleware.',
      'Add rate limiting (e.g., middleware or per-route limiter) before launch.',
    ));
  }

  // 2) Row Level Security
  const hasRlsEnable = grepFiles(sqlFiles, /enable\s+row\s+level\s+security/i);
  const hasPolicies = grepFiles(sqlFiles, /create\s+policy/i);
  if (hasRlsEnable.length > 0 && hasPolicies.length > 0) {
    results.push(makeResult(
      'rls',
      'Row Level Security',
      'PASS',
      `Detected RLS enable + policies in SQL schema files (${hasRlsEnable.length} enable markers, ${hasPolicies.length} policy markers).`,
    ));
  } else {
    results.push(makeResult(
      'rls',
      'Row Level Security',
      'FAIL',
      'Could not find both "enable row level security" and "create policy" in SQL files.',
      'Add RLS enable statements and policies for all user data tables.',
    ));
  }

  // 3) CAPTCHA on auth + forms
  const captchaScanFiles = [...walkFiles(path.join(root, 'src')), ...walkFiles(path.join(root, 'supabase', 'functions'))];
  const captchaFiles = grepFiles(captchaScanFiles, /(turnstile|recaptcha|hcaptcha|cf-turnstile-response|captcha)/i);
  const hasCaptchaEnv = Boolean(
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || env.TURNSTILE_SECRET_KEY || env.RECAPTCHA_SECRET_KEY || env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
  );
  if (captchaFiles.length > 0 && hasCaptchaEnv) {
    results.push(makeResult('captcha', 'CAPTCHA on auth/forms', 'PASS', `CAPTCHA integration markers found in: ${captchaFiles.slice(0, 5).map(rel).join(', ')}`));
  } else if (captchaFiles.length > 0 || hasCaptchaEnv) {
    results.push(makeResult(
      'captcha',
      'CAPTCHA on auth/forms',
      'WARN',
      'Partial CAPTCHA setup detected (env or code only).',
      'Ensure both frontend challenge + server-side token verification are implemented on auth and form endpoints.',
    ));
  } else {
    results.push(makeResult(
      'captcha',
      'CAPTCHA on auth/forms',
      'FAIL',
      'No CAPTCHA integration detected.',
      'Add CAPTCHA challenge + server verification for signup/login and public write forms.',
    ));
  }

  // 4) Server-side validation
  const postRoutes = apiFiles.filter((f) => /export\s+async\s+function\s+POST/.test(readFileSafe(f)));
  const weakValidationRoutes = [];
  for (const file of postRoutes) {
    const content = readFileSafe(file);
    const hasJsonBody = /(request|req)\.json\(/.test(content);
    const validationSignals = [
      /zod|safeParse|schema/i,
      /Array\.isArray\(/,
      /typeof\s+[a-zA-Z0-9_.$]+\s*===\s*['"][a-z]+['"]/,
      /if\s*\(\s*!/,
      /Invalid|missing|Unauthorized|must be|length|trim\(\)/i,
    ].filter((rx) => rx.test(content)).length;

    if (hasJsonBody && validationSignals < 2) {
      weakValidationRoutes.push(file);
    }
  }

  if (postRoutes.length === 0) {
    results.push(makeResult('server_validation', 'Server-side validation', 'WARN', 'No POST API routes found to validate.'));
  } else if (weakValidationRoutes.length === 0) {
    results.push(makeResult('server_validation', 'Server-side validation', 'PASS', `Validation signals detected across ${postRoutes.length} POST route(s).`));
  } else {
    results.push(makeResult(
      'server_validation',
      'Server-side validation',
      'FAIL',
      `Weak/unclear validation in: ${weakValidationRoutes.map(rel).join(', ')}`,
      'Add strict payload validation (schema or explicit checks) in these routes.',
    ));
  }

  // 5) API keys secured
  const sourceForSecrets = [...walkFiles(path.join(root, 'src')), ...walkFiles(path.join(root, 'supabase', 'functions'))];
  const secretRegexes = [
    /sk_(live|test)_[A-Za-z0-9]{16,}/g,
    /SG\.[A-Za-z0-9._-]{20,}/g,
    /AIza[0-9A-Za-z\-_]{20,}/g,
    /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g,
  ];
  const secretHits = [];
  for (const file of sourceForSecrets) {
    const content = readFileSafe(file);
    for (const rx of secretRegexes) {
      if (rx.test(content)) {
        secretHits.push(file);
        break;
      }
    }
  }

  if (secretHits.length > 0) {
    results.push(makeResult(
      'api_keys',
      'API keys secured',
      'FAIL',
      `Potential hardcoded secrets detected in: ${secretHits.map(rel).join(', ')}`,
      'Move secrets to env vars/secret manager and rotate exposed keys.',
    ));
  } else {
    results.push(makeResult('api_keys', 'API keys secured', 'PASS', 'No obvious hardcoded secret patterns found in source code.'));
  }

  // 6) Env vars set properly
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_TMDB_API_KEY'];
  const missingRequired = required.filter((k) => !env[k]);
  const serviceRolePresent = Boolean(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE || env.SERVICE_ROLE_KEY);
  const optionalMissing = ['UNOSEND_API_KEY', 'UNOSEND_FROM'].filter((k) => !env[k]);

  if (missingRequired.length > 0 || !serviceRolePresent) {
    const missing = [...missingRequired, ...(serviceRolePresent ? [] : ['SUPABASE_SERVICE_ROLE_KEY (or equivalent)'])];
    results.push(makeResult(
      'env_vars',
      'Env vars set properly',
      'FAIL',
      `Missing required env vars: ${missing.join(', ')}`,
      'Set required env vars in local + deployment provider secrets before launch.',
    ));
  } else if (optionalMissing.length > 0) {
    results.push(makeResult(
      'env_vars',
      'Env vars set properly',
      'WARN',
      `Required env vars are present. Optional missing vars: ${optionalMissing.join(', ')}`,
      'Set optional vars if those features are enabled in production.',
    ));
  } else {
    results.push(makeResult('env_vars', 'Env vars set properly', 'PASS', 'Required and recommended env vars are present in environment/.env files.'));
  }

  // 7) CORS restrictions
  const wildcardCors = grepFiles(files, /Access-Control-Allow-Origin['"]?\s*[:=]\s*['"]\*['"]/i);
  const hasAllowedOriginsList = grepFiles(files, /allowedOrigins\s*=\s*new\s+Set\(/i);
  if (wildcardCors.length > 0) {
    results.push(makeResult(
      'cors',
      'CORS restrictions',
      'FAIL',
      `Wildcard CORS detected in: ${wildcardCors.map(rel).join(', ')}`,
      'Replace wildcard origin with explicit allow-list.',
    ));
  } else if (hasAllowedOriginsList.length > 0) {
    results.push(makeResult('cors', 'CORS restrictions', 'PASS', `CORS allow-list detected (${hasAllowedOriginsList.map(rel).join(', ')}).`));
  } else {
    results.push(makeResult('cors', 'CORS restrictions', 'PASS', 'No wildcard CORS in app routes; default same-origin behavior remains restricted.'));
  }

  // 8) Dependency audit
  const audit = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180000,
  });

  let auditJson = null;
  try {
    const raw = (audit.stdout || '').trim();
    auditJson = raw ? JSON.parse(raw) : null;
  } catch {
    auditJson = null;
  }

  if (!auditJson) {
    results.push(makeResult(
      'dependency_audit',
      'Dependency audit',
      'WARN',
      'Could not parse npm audit JSON output.',
      'Run `npm audit --omit=dev` manually and resolve vulnerabilities.',
    ));
  } else {
    const vulns = auditJson?.metadata?.vulnerabilities || {};
    const critical = Number(vulns.critical || 0);
    const high = Number(vulns.high || 0);
    const moderate = Number(vulns.moderate || 0);
    const low = Number(vulns.low || 0);

    if (critical > 0 || high > 0) {
      results.push(makeResult(
        'dependency_audit',
        'Dependency audit',
        'FAIL',
        `npm audit found vulnerabilities: critical=${critical}, high=${high}, moderate=${moderate}, low=${low}`,
        'Patch or explicitly risk-accept high/critical vulnerabilities before launch.',
      ));
    } else {
      const status = moderate > 0 || low > 0 ? 'WARN' : 'PASS';
      const details = `npm audit: critical=${critical}, high=${high}, moderate=${moderate}, low=${low}`;
      const remediation = status === 'WARN' ? 'Review moderate/low vulnerabilities and patch where feasible.' : '';
      results.push(makeResult('dependency_audit', 'Dependency audit', status, details, remediation));
    }
  }

  return results;
}

function render(results) {
  console.log(colorize('cyan', '\nPrelaunch checklist\n'));

  for (const result of results) {
    const icon = result.status === 'PASS' ? 'PASS' : result.status === 'WARN' ? 'WARN' : 'FAIL';
    const colored =
      result.status === 'PASS'
        ? colorize('green', icon)
        : result.status === 'WARN'
          ? colorize('yellow', icon)
          : colorize('red', icon);

    console.log(`${colored}  ${result.title}`);
    console.log(`      ${result.details}`);
    if (result.remediation) {
      console.log(`      Action: ${result.remediation}`);
    }
  }

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const warnCount = results.filter((r) => r.status === 'WARN').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;

  console.log('\nSummary');
  console.log(`  PASS: ${passCount}`);
  console.log(`  WARN: ${warnCount}`);
  console.log(`  FAIL: ${failCount}`);

  return failCount;
}

const results = runChecks();
const failCount = render(results);

if (failCount > 0) {
  console.error(colorize('red', '\nPrelaunch failed: resolve FAIL items before launch.'));
  process.exit(1);
}

console.log(colorize('green', '\nPrelaunch passed: no blocking checks failed.'));
