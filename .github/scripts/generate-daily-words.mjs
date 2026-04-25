// Generates word-game/daily.json by calling the public Heroku backend that
// already serves the word-game frontend. Mirrors the prompt and parsing in
// word-game/app.js so daily pairs feel identical to free-play pairs.

import fs from 'node:fs/promises';

const BACKEND_URL = 'https://morning-hollows-92414-17784c643d81.herokuapp.com/api/chat';
const DAILY_PATH = 'word-game/daily.json';
const HISTORY_LIMIT = 60;
const AVOID_LIMIT = 30;
const MAX_ATTEMPTS = 3;

const WORD_GEN_INSTRUCTIONS = [
  'You are generating the two endpoint words for a word-association puzzle.',
  'Produce two common English words that are as semantically UNRELATED as you can possibly make them.',
  'Hard requirements:',
  '  - Each word must be a SINGLE word (no spaces, no hyphens), at least 3 letters long, all lowercase letters only.',
  '  - Both must be everyday words a general audience instantly recognizes. Prefer concrete nouns. No rare, technical, archaic, or proper nouns.',
  '  - They must come from entirely different conceptual domains.',
  '  - No shared cultural association, metaphor, idiom, or common co-occurrence.',
  '  - No surface similarity: no rhyme, no alliteration, no shared distinctive letters.',
  '  - Avoid obvious dichotomies (hot/cold, up/down).',
  '  - The pair should be solvable — a motivated player CAN eventually bridge them — but the direct association should be effectively zero.',
  'Process: silently brainstorm 5 candidate pairs that satisfy the letter and avoid-list constraints, then pick the pair with the greatest semantic distance.',
  'Output (strict JSON only, no prose, no markdown fences):',
  '  {"left":"<word>","right":"<word>","rationale":"<1 sentence on why these are unrelated>"}'
].join('\n');

const GEN_LETTERS = 'abcdefghijklmnoprstuvwy';
const pickLetter = () => GEN_LETTERS[Math.floor(Math.random() * GEN_LETTERS.length)];

function extractJson(text) {
  if (!text) return null;
  const normalized = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : normalized;
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  try { return JSON.parse(body.slice(first, last + 1)); } catch {}
  let depth = 0, inStr = false, esc = false;
  for (let i = first; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(body.slice(first, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

async function callBackend(prompt) {
  const res = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: prompt }),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  const data = await res.json();
  return data?.content ?? data?.message ?? '';
}

async function generatePair(avoid) {
  const l1 = pickLetter();
  let l2 = pickLetter();
  while (l2 === l1) l2 = pickLetter();

  const constraints = [
    '',
    'Constraints for THIS generation (MUST be satisfied exactly):',
    `  - The first word must start with the letter "${l1}".`,
    `  - The second word must start with the letter "${l2}".`,
  ];
  if (avoid.length) {
    constraints.push(`  - Do NOT use any of these recently-used words: ${avoid.join(', ')}.`);
  }
  constraints.push(`  - Variety nonce (produce a different answer each time this changes): ${Math.random().toString(36).slice(2, 10)}`);

  const prompt = `${WORD_GEN_INSTRUCTIONS}\n${constraints.join('\n')}`;
  const clean = (s) => String(s).trim().toLowerCase().replace(/[^a-z]/g, '');

  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let content = '';
    try {
      content = await callBackend(prompt);
    } catch (err) {
      lastErr = err.message;
      console.warn(`Attempt ${attempt} backend error: ${err.message}`);
      continue;
    }
    const parsed = extractJson(content);
    if (parsed && typeof parsed.left === 'string' && typeof parsed.right === 'string') {
      const left = clean(parsed.left);
      const right = clean(parsed.right);
      if (left && right && left !== right && left.length >= 3 && right.length >= 3) {
        return { left, right, rationale: (parsed.rationale || '').toString().trim() };
      }
      lastErr = `unusable pair: left="${parsed.left}" right="${parsed.right}"`;
    } else {
      lastErr = 'unparseable response';
    }
    console.warn(`Attempt ${attempt} failed (${lastErr}). Raw:`, content);
  }
  throw new Error(`Could not generate a valid pair after ${MAX_ATTEMPTS} attempts. Last error: ${lastErr}`);
}

// Daily puzzles flip at midnight Eastern. The cron fires twice (04:00 and
// 05:00 UTC) to cover both EDT and EST; whichever run lands on the new
// Eastern calendar date wins, the other run no-ops.
const TZ = 'America/New_York';
const todayEastern = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function main() {
  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(DAILY_PATH, 'utf8'));
  } catch {}

  const today = todayEastern();
  if (existing && existing.date === today && !process.env.FORCE) {
    console.log(`daily.json already up to date for ${today} (Eastern). Set FORCE=1 to regenerate.`);
    return;
  }

  const history = Array.isArray(existing?.history) ? existing.history.slice() : [];
  if (existing?.date && existing.left && existing.right) {
    history.unshift({ date: existing.date, left: existing.left, right: existing.right });
  }

  const avoid = [];
  for (const entry of history.slice(0, AVOID_LIMIT)) {
    if (entry.left) avoid.push(entry.left);
    if (entry.right) avoid.push(entry.right);
  }

  const pair = await generatePair(avoid);

  const next = {
    date: today,
    left: pair.left,
    right: pair.right,
    rationale: pair.rationale,
    history: history.slice(0, HISTORY_LIMIT),
  };

  await fs.writeFile(DAILY_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`Wrote ${DAILY_PATH}: ${pair.left} ↔ ${pair.right}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
