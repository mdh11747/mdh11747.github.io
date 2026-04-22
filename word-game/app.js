(() => {
  // ---------- config ----------
  const LINK_THRESHOLD = 60;
  const BACKEND_URL = (window.BL_CONFIG && window.BL_CONFIG.backendUrl) || '';

  // ---------- custom instructions for the scoring model ----------
  // These are appended to every scoring request. They fully define how the
  // model should behave for this game, regardless of any system prompt baked
  // into the Heroku backend.
  const MODEL_INSTRUCTIONS = [
    'You are a semantic-relatedness judge for a word-association game called Better Linxicon.',
    'For each target word, rate how closely it relates to the candidate word on a 0-100 integer scale.',
    'Use these anchors precisely:',
    '  0-20  = unrelated (no meaningful association)',
    '  21-40 = faint or very abstract link',
    '  41-60 = clear but indirect association',
    '  61-80 = strongly related (shared domain, common co-occurrence, or typical pairing)',
    '  81-100 = near-synonym, part-of, iconic pairing, or cultural shorthand',
    'Rules:',
    '  - Be decisive. Do NOT reward merely sharing a letter, sounding alike, or rhyming.',
    '  - Do NOT reward generic relations like "both are nouns" or "both exist".',
    '  - Metaphor, idiom, and cultural association count. Surface-form similarity does not.',
    '  - If a target word is gibberish or unrecognized, score 0.',
    'Output format (strict): a single JSON object, no prose, no markdown fences, no commentary:',
    '  {"scores":[{"word":"<target>","score":<0-100>,"reason":"<short>"}, ...]}',
    'Return exactly one entry per target word, preserving the order provided.'
  ].join('\n');

  // Prompt for generating new start-word pairs. The goal is maximum
  // semantic distance between two everyday words — the harder the bridge,
  // the better the puzzle.
  const WORD_GEN_INSTRUCTIONS = [
    'You are generating the two endpoint words for a word-association puzzle.',
    'Produce two common English words that are as semantically UNRELATED as you can possibly make them.',
    'Hard requirements:',
    '  - Both must be everyday words a general audience instantly recognizes. Prefer concrete nouns like "bicycle", "potato", "museum". No rare, technical, archaic, or proper nouns.',
    '  - They must come from entirely different conceptual domains (e.g., a kitchen object and a weather phenomenon; a farm animal and an abstract emotion).',
    '  - No shared cultural association, metaphor, idiom, or common co-occurrence.',
    '  - No surface similarity: no rhyme, no alliteration, no shared distinctive letters.',
    '  - Avoid obvious dichotomies (hot/cold, up/down, happy/sad).',
    '  - The pair should be solvable — a motivated player CAN eventually bridge them with enough intermediate words — but the direct association should be effectively zero.',
    'Process: silently brainstorm 5 candidate pairs, then pick the pair with the greatest semantic distance.',
    'Output (strict JSON only, no prose, no markdown fences):',
    '  {"left":"<word>","right":"<word>","rationale":"<1 sentence on why these are maximally unrelated>"}'
  ].join('\n');

  async function generateStartWords() {
    if (!BACKEND_URL) throw new Error('No backend URL configured.');
    const nonce = Math.random().toString(36).slice(2, 10);
    const prompt = `${WORD_GEN_INSTRUCTIONS}\n\nVariety nonce (ignore for content, but use to produce a different answer than you would without it): ${nonce}`;

    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt }),
    });
    if (!res.ok) throw new Error(`Backend ${res.status}`);
    const data = await res.json();
    const content = data?.content ?? data?.message ?? '';
    const parsed = extractJson(content);
    if (!parsed || typeof parsed.left !== 'string' || typeof parsed.right !== 'string') {
      console.warn('[generate] bad model output:', content);
      throw new Error('Model returned unparseable word pair.');
    }
    const clean = s => s.trim().toLowerCase().replace(/[^a-z\- ]/g, '');
    const left = clean(parsed.left);
    const right = clean(parsed.right);
    if (!left || !right || left === right) throw new Error('Model returned an invalid pair.');
    return [left, right];
  }

  const SEED_WORDS = [
    'banana','telephone','volcano','library','tornado','piano','astronaut','bicycle','magnet','whisper',
    'glacier','saxophone','pirate','submarine','origami','cathedral','avalanche','cactus','compass','dolphin',
    'hurricane','lantern','marshmallow','nebula','octopus','pineapple','quartz','robot','satellite','tumbleweed',
    'umbrella','violin','windmill','xylophone','yogurt','zeppelin','accordion','blueprint','chandelier','dynamite',
    'elevator','firework','gargoyle','harpoon','iceberg','jellyfish','kaleidoscope','labyrinth','mosquito','nostalgia',
    'obelisk','parachute','quicksand','rainbow','scarecrow','telescope','unicorn','vortex','waterfall','yoga',
    'blackboard','campfire','detective','earthquake','fossil','galaxy','hammock','island','jungle','kitten',
    'lighthouse','mountain','noodle','orchestra','puzzle','quilt','river','skyscraper','trumpet','vineyard',
    'wheelbarrow','zipper','archaeology','bakery','cemetery','desert','echo','factory','garden','honey'
  ];

  function pickTwoWords() {
    const a = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
    let b = a;
    while (b === a) b = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)];
    return [a, b];
  }

  // ---------- LLM call via shared Heroku backend ----------
  function buildPrompt(candidate, targets) {
    return [
      MODEL_INSTRUCTIONS,
      '',
      'Input:',
      JSON.stringify({ candidate, targets }),
    ].join('\n');
  }

  function extractJson(text) {
    if (!text) return null;
    // Strip markdown fences if the model wrapped its output.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : text;
    // Find the first { and last } and try to parse that slice.
    const first = body.indexOf('{');
    const last = body.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    const slice = body.slice(first, last + 1);
    try { return JSON.parse(slice); } catch { return null; }
  }

  async function scoreRelatedness(candidate, targets) {
    if (!BACKEND_URL) throw new Error('No backend URL configured (edit config.js).');
    const prompt = buildPrompt(candidate, targets);

    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt }),
    });

    if (!res.ok) {
      let msg = `Backend ${res.status}`;
      try { const err = await res.json(); msg = err?.error || err?.message || msg; } catch {}
      throw new Error(msg);
    }

    const data = await res.json();
    const content = data?.content ?? data?.message ?? '';
    const parsed = extractJson(content);
    if (!parsed || !Array.isArray(parsed.scores)) {
      console.warn('[score] unparseable model output:', content);
      throw new Error('Model returned unparseable output. Try again.');
    }

    const scores = {};
    for (const entry of parsed.scores) {
      if (entry && typeof entry.word === 'string' && Number.isFinite(entry.score)) {
        scores[entry.word.toLowerCase()] = {
          score: Math.max(0, Math.min(100, Math.round(entry.score))),
          reason: entry.reason || ''
        };
      }
    }
    for (const t of targets) {
      if (!(t in scores)) scores[t] = { score: 0, reason: 'no response from model' };
    }
    return scores;
  }

  // ---------- DOM ----------
  const svgEl = document.getElementById('graph');
  const statusEl = document.getElementById('status');
  const wordLeftEl = document.getElementById('word-left');
  const wordRightEl = document.getElementById('word-right');
  const form = document.getElementById('word-form');
  const input = document.getElementById('word-input');
  const submitBtn = document.getElementById('submit-btn');
  const newGameBtn = document.getElementById('new-game-btn');
  const thresholdInfo = document.getElementById('threshold-info');
  const logList = document.getElementById('log-list');

  // ---------- state ----------
  const state = {
    threshold: LINK_THRESHOLD,
    leftId: null,
    rightId: null,
    nodes: [],
    links: [],
    adjacency: new Map(),
    connectedToLeft: new Set(),
    connectedToRight: new Set(),
    won: false,
  };

  // ---------- D3 ----------
  const svg = d3.select('#graph');
  let width = svgEl.clientWidth || 800;
  let height = svgEl.clientHeight || 460;
  svg.attr('viewBox', [0, 0, width, height]);
  const zoomContainer = svg.append('g').attr('class', 'zoom-container');
  const linkGroup = zoomContainer.append('g').attr('class', 'links');
  const nodeGroup = zoomContainer.append('g').attr('class', 'nodes');

  // Zoom / pan: wheel scroll and pinch zoom the board. Clicking a node
  // still starts a drag because the filter below lets mousedown/touchstart
  // on nodes pass through to the drag behavior.
  const zoom = d3.zoom()
    .scaleExtent([0.3, 4])
    .filter((event) => {
      if (event.type === 'mousedown' || event.type === 'touchstart') {
        if (event.target && event.target.closest && event.target.closest('.node')) {
          return false;
        }
      }
      return !event.ctrlKey && !event.button;
    })
    .on('zoom', (event) => {
      zoomContainer.attr('transform', event.transform);
    });
  svg.call(zoom);

  function resetZoom() {
    svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity);
  }

  const simulation = d3.forceSimulation()
    .force('link', d3.forceLink().id(d => d.id).distance(d => 110 - (d.score || 50) * 0.4).strength(0.7))
    .force('charge', d3.forceManyBody().strength(-280))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide().radius(38))
    .on('tick', ticked);

  function ticked() {
    linkGroup.selectAll('line')
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    nodeGroup.selectAll('.node').attr('transform', d => `translate(${d.x},${d.y})`);
  }

  const colorFor = k => ({ left:'#ffb86b', right:'#9ece6a', chain:'#7aa2f7', float:'#a78bfa' })[k] || '#7aa2f7';
  const radiusFor = k => (k === 'left' || k === 'right') ? 28 : 18;

  function linkKey(d) {
    const s = typeof d.source === 'object' ? d.source.id : d.source;
    const t = typeof d.target === 'object' ? d.target.id : d.target;
    return s < t ? `${s}__${t}` : `${t}__${s}`;
  }

  function linkTooltip(d) {
    const s = typeof d.source === 'object' ? d.source.label : '';
    const t = typeof d.target === 'object' ? d.target.label : '';
    const pair = (s && t) ? `${s} ↔ ${t}  (${d.score})` : `score ${d.score}`;
    return d.reason ? `${pair}\n${d.reason}` : pair;
  }

  function redraw() {
    const linkSel = linkGroup.selectAll('line').data(state.links, linkKey);
    linkSel.exit().remove();
    const linkEnter = linkSel.enter().append('line').attr('class', 'link');
    linkEnter.append('title');
    const mergedLinks = linkEnter.merge(linkSel);
    mergedLinks
      .attr('stroke', d => d.score >= 70 ? '#9ece6a' : d.score >= 50 ? '#7aa2f7' : '#4a5566')
      .attr('stroke-width', d => Math.max(1, d.score / 30));
    mergedLinks.select('title').text(linkTooltip);

    const nodeSel = nodeGroup.selectAll('.node').data(state.nodes, d => d.id);
    nodeSel.exit().remove();
    const nodeEnter = nodeSel.enter().append('g').attr('class', 'node')
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          if (d.kind !== 'left' && d.kind !== 'right') { d.fx = null; d.fy = null; }
        })
      );
    nodeEnter.append('circle');
    nodeEnter.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em');

    const merged = nodeEnter.merge(nodeSel);
    merged.select('circle').attr('r', d => radiusFor(d.kind)).attr('fill', d => colorFor(d.kind));
    merged.select('text').text(d => d.label).attr('y', d => radiusFor(d.kind) + 14);

    simulation.nodes(state.nodes);
    simulation.force('link').links(state.links);
    simulation.alpha(0.7).restart();
  }

  function addEdge(aId, bId, score, reason) {
    if (aId === bId) return;
    const key = aId < bId ? `${aId}__${bId}` : `${bId}__${aId}`;
    if (state.links.some(l => linkKey(l) === key)) return;
    state.links.push({ source: aId, target: bId, score, reason: reason || '' });
    if (!state.adjacency.has(aId)) state.adjacency.set(aId, new Set());
    if (!state.adjacency.has(bId)) state.adjacency.set(bId, new Set());
    state.adjacency.get(aId).add(bId);
    state.adjacency.get(bId).add(aId);
  }

  function bfsReachable(startId) {
    const seen = new Set([startId]);
    const queue = [startId];
    while (queue.length) {
      const cur = queue.shift();
      const neighbors = state.adjacency.get(cur);
      if (!neighbors) continue;
      for (const n of neighbors) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    }
    return seen;
  }

  function recomputeConnectivity() {
    if (state.leftId == null || state.rightId == null) return;
    state.connectedToLeft = bfsReachable(state.leftId);
    state.connectedToRight = bfsReachable(state.rightId);
    for (const node of state.nodes) {
      if (node.id === state.leftId || node.id === state.rightId) continue;
      const onLeft = state.connectedToLeft.has(node.id);
      const onRight = state.connectedToRight.has(node.id);
      node.kind = (onLeft || onRight) ? 'chain' : 'float';
    }
    if (state.connectedToLeft.has(state.rightId) && !state.won) {
      state.won = true;
      setStatus(`You connected ${nodeById(state.leftId).label} to ${nodeById(state.rightId).label}!`, 'win');
    }
  }

  const nodeById = id => state.nodes.find(n => n.id === id);

  function setStatus(msg, cls = '') {
    statusEl.textContent = msg;
    statusEl.className = `status ${cls}`.trim();
  }

  function appendLog(candidate, scoreMap) {
    const li = document.createElement('li');

    const header = document.createElement('div');
    header.className = 'log-candidate';
    header.textContent = candidate;
    li.appendChild(header);

    const rows = document.createElement('ul');
    rows.className = 'log-scores';
    const sorted = Object.entries(scoreMap).sort(([, a], [, b]) => b.score - a.score);
    for (const [word, info] of sorted) {
      const row = document.createElement('li');
      row.className = info.score >= state.threshold ? 'hit' : 'miss';

      const label = document.createElement('span');
      label.className = 'log-score-label';
      label.textContent = `${word}: ${info.score}`;
      row.appendChild(label);

      if (info.reason) {
        const reason = document.createElement('span');
        reason.className = 'log-score-reason';
        reason.textContent = info.reason;
        row.appendChild(reason);
      }
      rows.appendChild(row);
    }
    li.appendChild(rows);
    logList.prepend(li);
  }

  async function startGame() {
    newGameBtn.disabled = true;
    submitBtn.disabled = true;
    setStatus('Generating a new puzzle...');
    wordLeftEl.textContent = '…';
    wordRightEl.textContent = '…';

    let left, right, usedFallback = false;
    try {
      [left, right] = await generateStartWords();
    } catch (err) {
      console.warn('[startGame] AI generation failed, falling back to seed list:', err.message);
      [left, right] = pickTwoWords();
      usedFallback = true;
    }

    state.leftId = 0;
    state.rightId = 1;
    state.nodes = [
      { id: 0, label: left, kind: 'left', fx: 80, fy: height / 2 },
      { id: 1, label: right, kind: 'right', fx: width - 80, fy: height / 2 },
    ];
    state.links = [];
    state.adjacency = new Map();
    state.connectedToLeft = new Set([0]);
    state.connectedToRight = new Set([1]);
    state.won = false;

    wordLeftEl.textContent = left;
    wordRightEl.textContent = right;
    thresholdInfo.textContent = `Links form when the LLM scores relatedness ≥ ${state.threshold}%.`;
    logList.innerHTML = '';
    setStatus(usedFallback
      ? 'Couldn\'t reach the AI word generator. Fell back to a random pair.'
      : 'Pick a word you think relates to either endpoint.',
      usedFallback ? 'error' : '');
    resetZoom();
    redraw();
    newGameBtn.disabled = false;
    submitBtn.disabled = false;
    input.focus();
  }

  async function submitWord(e) {
    e.preventDefault();
    const word = input.value.trim().toLowerCase();
    if (!word) return;
    if (state.nodes.some(n => n.label === word)) {
      setStatus(`"${word}" is already on the board.`, 'error');
      return;
    }

    submitBtn.disabled = true;
    setStatus(`Scoring "${word}"...`);

    const existingWords = state.nodes.map(n => n.label);
    try {
      const scoreMap = await scoreRelatedness(word, existingWords);

      const newId = state.nodes.length ? Math.max(...state.nodes.map(n => n.id)) + 1 : 0;
      state.nodes.push({ id: newId, label: word, kind: 'float' });

      let linkedCount = 0;
      for (const existing of state.nodes) {
        if (existing.id === newId) continue;
        const info = scoreMap[existing.label];
        if (info && info.score >= state.threshold) {
          addEdge(newId, existing.id, info.score, info.reason);
          linkedCount++;
        }
      }

      recomputeConnectivity();
      appendLog(word, scoreMap);
      redraw();
      input.value = '';

      if (!state.won) {
        if (linkedCount === 0) setStatus(`"${word}" didn't cross ${state.threshold}% with anything. It's floating.`);
        else setStatus(`"${word}" linked to ${linkedCount} word${linkedCount > 1 ? 's' : ''}.`);
      }
    } catch (err) {
      setStatus(`Error: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      input.focus();
    }
  }

  // ---------- resize / startup ----------
  window.addEventListener('resize', () => {
    width = svgEl.clientWidth || 800;
    height = svgEl.clientHeight || 460;
    svg.attr('viewBox', [0, 0, width, height]);
    simulation.force('center', d3.forceCenter(width / 2, height / 2));
    const left = nodeById(state.leftId);
    const right = nodeById(state.rightId);
    if (left) { left.fx = 80; left.fy = height / 2; }
    if (right) { right.fx = width - 80; right.fy = height / 2; }
    simulation.alpha(0.3).restart();
  });

  form.addEventListener('submit', submitWord);
  newGameBtn.addEventListener('click', startGame);

  startGame();
})();
