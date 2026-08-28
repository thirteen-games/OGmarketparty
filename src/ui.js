// Market Party — DOM UI. Renders the engine state and wires player actions.

import { Game } from './engine.js';
import {
  MASCOTS, CONFIG, BOARD_MIN, BOARD_MAX,
  TICKETS, SPELLS, EP_LEVELS, NEWS_TABLE,
  mascotById, ticketById, spellById,
} from './data.js';
import { mascotSvg } from './mascotArt.js';
import { collectProbability, oddsLabel } from './odds.js';

const $ = (sel, root = document) => root.querySelector(sel);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PLAYER_COLORS = ['var(--p1)', 'var(--p2)'];
const PLAYER_NAMES = ['Player 1', 'Player 2'];

export class UI {
  constructor(root) {
    this.root = root;
    this.game = null;
    this.targeting = null; // {player, slot, spell, steps}
    this.logLines = [];
    this.renderStart();
  }

  // --- Screens -------------------------------------------------------------

  renderStart() {
    this.root.innerHTML = `
      <div class="start-screen">
        <div class="start-card">
          <div class="start-mascots">${MASCOTS.map((m) => mascotSvg(m.id, 72)).join('')}</div>
          <h1>Market Party</h1>
          <p class="tagline">Bet on the mascots. Collect the EP. Throw the best party on the Street.</p>
          <div class="start-buttons">
            <button class="btn btn-primary" data-mode="1">1 Player &mdash; ${CONFIG.onePlayerRounds} rounds, chase ${CONFIG.onePlayerGoal} EP</button>
            <button class="btn btn-primary" data-mode="2">2 Players &mdash; first to ${CONFIG.twoPlayerGoal} EP</button>
          </div>
          <details class="rules">
            <summary>How to play</summary>
            <ol>
              <li>Four mascots random-walk a 0&ndash;100 track. Each has its own move style &mdash; Wolf grinds, Bizarro swings wild.</li>
              <li>Each round, spend <b>Coins</b> on Betting Tickets. A ticket drops an <b>EP bounty</b> on steps near its mascot.</li>
              <li>Hit <b>Roll</b>. When a mascot lands on or passes one of your bounties, you bank the EP.</li>
              <li>Spend banked EP on <b>Spells</b> &mdash; double bounties, drag them closer, freeze a mascot, or raid your opponent.</li>
              <li>Banked EP raises your <b>Level</b>, unlocking rarer tickets and spells. Watch for <b>Mascot News</b>!</li>
            </ol>
          </details>
        </div>
      </div>`;
    this.root.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this.newGame(Number(btn.dataset.mode)));
    });
  }

  newGame(mode) {
    this.game = new Game({ mode });
    this.logLines = [];
    this.targeting = null;
    this.log(`New ${mode}-player game. Make some Bets, then Roll!`);
    this.renderGame();
  }

  // --- Main render -----------------------------------------------------------

  renderGame() {
    const g = this.game;
    const scrollY = window.scrollY;
    this.root.innerHTML = `
      <header class="topbar">
        <div class="brand">${mascotSvg(2, 28)}<span>Market Party</span></div>
        <div class="news-banner info-click ${g.news ? 'active' : ''}" id="news-banner" title="How Mascot News works">${this.newsText()}</div>
        <button class="btn btn-ghost" id="all-bets-btn" title="Every ticket in the game">📋 All Bets</button>
        <button class="btn btn-ghost" id="stats-geek-btn" title="Roll odds for every mascot">🤓 Stats Geek</button>
        <button class="btn btn-ghost" id="restart-btn">New game</button>
      </header>
      <main>
        <section class="board" id="board">
          <div class="board-heads">${MASCOTS.map((m) => this.renderLaneHead(m)).join('')}</div>
          <div class="board-tracks">${this.renderBoard()}</div>
        </section>
        <div class="side">
          ${this.renderRollPanel()}
          <section class="panels">${g.players.map((_, p) => this.renderPlayerPanel(p)).join('')}</section>
          <section class="log-panel"><h3>Game log</h3><div class="log" id="log">${this.logHtml()}</div></section>
        </div>
      </main>
      <div class="targeting-banner" id="targeting-banner" hidden></div>
      ${g.over ? this.renderGameOver() : ''}`;

    $('#roll-btn', this.root)?.addEventListener('click', () => this.doRoll());
    $('#skip-btn', this.root)?.addEventListener('click', () => this.requestSkip?.());
    $('#restart-btn', this.root).addEventListener('click', () => this.renderStart());
    this.wireInfo();
    this.wirePanels();
    this.wireTargeting();
    this.centerLanes();
    window.scrollTo(0, scrollY); // don't jump the page on re-render (e.g. buying a bet)
  }

  renderRollPanel() {
    const g = this.game;
    const rolled = g.round > 0;
    return `
      <section class="roll-panel">
        <div class="roll-head">
          <div class="round-info">${
            g.mode === 1
              ? `Round <b>${Math.min(g.round + 1, CONFIG.onePlayerRounds)}</b> / ${CONFIG.onePlayerRounds}`
              : `Round <b>${g.round + 1}</b> &middot; first to ${CONFIG.twoPlayerGoal} EP`
          }</div>
          <div class="roll-actions">
            <button class="btn btn-tiny" id="skip-btn" hidden>⏭ Skip</button>
            <button class="btn btn-roll" id="roll-btn" ${g.over ? 'disabled' : ''}>🎲 ROLL</button>
          </div>
        </div>
        <div class="dice-row">
          ${MASCOTS.map((m) => {
            const last = g.lastRolls[m.id];
            const alert = g.news && g.news.mascotId === m.id;
            return `
              <div class="die-slot ${alert ? 'alert' : ''}" data-mascot="${m.id}" style="--mc:${m.color}"
                ${alert ? `title="Mascot News! ${m.name} can only move ${g.news.direction > 0 ? 'Up' : 'Down'}"` : ''}>
                ${alert ? `
                  <span class="alert-tri"><svg viewBox="0 0 100 100">
                    <path d="M50 6 L97 90 L3 90 Z" fill="#ffd21f" stroke="#1b2440" stroke-width="7" stroke-linejoin="round"/>
                    <text x="50" y="78" text-anchor="middle" font-size="56" font-weight="900" fill="#1b2440">!</text>
                  </svg></span>` : ''}
                ${mascotSvg(m.id, 26)}
                <div class="d10"><span class="die-num">${rolled ? (last > 0 ? `+${last}` : last) : '?'}</span></div>
                <div class="die-result">${alert ? `${g.news.direction > 0 ? '⬆ UP' : '⬇ DOWN'} ONLY` : rolled ? this.upDown(last) : '&mdash;'}</div>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  newsText() {
    const g = this.game;
    if (!g.news) return 'Mascot News: all quiet on the Street.';
    const m = mascotById(g.news.mascotId);
    return `📣 ${m.name} can only move ${g.news.direction > 0 ? 'UP' : 'DOWN'} (${CONFIG.newsDurationRolls - g.news.count + 1} roll${CONFIG.newsDurationRolls - g.news.count ? 's' : ''} left)`;
  }

  // --- Board -----------------------------------------------------------------

  renderBoard() {
    return MASCOTS.map((m) => this.renderLane(m)).join('');
  }

  renderLaneHead(mascot) {
    const g = this.game;
    const step = g.steps[mascot.id];
    const last = g.lastRolls[mascot.id];
    const flag = g.flags[mascot.id];
    const flagBadge =
      flag === 2 ? '<span class="flag">❄ frozen</span>'
      : flag === 1 ? '<span class="flag">⬆ up only</span>'
      : flag === -1 ? '<span class="flag">⬇ down only</span>' : '';
    return `
      <div class="lane-label" style="--mc:${mascot.color}">
        ${mascotSvg(mascot.id, 40)}
        <div class="lane-title">
          <b>${mascot.name}</b><span class="class-tag">${mascot.className}</span>
          <div class="lane-sub">at <b>${step}</b>${last ? ` &middot; ${this.upDown(last)}` : ''} ${flagBadge}</div>
        </div>
        <button class="btn btn-tiny stats-btn" data-mascot="${mascot.id}" title="Roll odds">📊</button>
      </div>`;
  }

  // Vertical lane column, high steps at the top — like the prototype board.
  renderLane(mascot) {
    const g = this.game;
    const step = g.steps[mascot.id];
    const from = g.lastFrom[mascot.id];
    const roll = g.lastRolls[mascot.id];
    const cells = [];
    for (let s = BOARD_MAX; s >= BOARD_MIN; s--) {
      const here = s === step;
      let trailCls = '';
      if (roll !== 0 && g.round > 0) {
        if (s === from) trailCls = 'prev';
        else if (roll > 0 ? s > from && s < step : s < from && s > step) trailCls = 'trail';
      }
      const chips = g.players
        .map((player, p) => {
          const ep = player.board[mascot.id][s];
          return ep
            ? `<span class="chip p${p}" data-mascot="${mascot.id}" data-step="${s}" data-player="${p}"
                title="${PLAYER_NAMES[p]}: ${ep} EP on step ${s}">${ep}</span>`
            : '';
        })
        .join('');
      cells.push(`
        <div class="cell ${s % 10 === 0 ? 'decade' : ''} ${here ? 'here' : ''} ${trailCls}" data-step="${s}">
          <span class="step-num">${s}</span>
          ${here ? `<span class="token">${mascotSvg(mascot.id, 22)}<b>${mascot.name}</b></span>` : ''}
          <span class="chips">${chips}</span>
        </div>`);
    }
    return `
      <div class="lane" data-mascot="${mascot.id}" style="--mc:${mascot.color}">
        <div class="track">${cells.join('')}</div>
      </div>`;
  }

  upDown(n) {
    return n > 0 ? `Up ${n}` : n < 0 ? `Down ${Math.abs(n)}` : 'Frozen';
  }

  // Each lane scrolls independently so its mascot's current step is always
  // centered in the visible frame (like the prototype's re-centering board).
  // Instant by default so ordinary re-renders (buying a bet) don't visibly
  // scroll; the roll animation re-centers smoothly per lane.
  centerLanes() {
    for (const lane of this.root.querySelectorAll('.lane')) {
      const mascotId = Number(lane.dataset.mascot);
      this.centerLaneOnStep(lane, this.game.steps[mascotId], false);
    }
  }

  centerLaneOnStep(lane, step, smooth) {
    const cell = lane.querySelector(`.cell[data-step="${step}"]`);
    if (!cell) return;
    const top = cell.offsetTop - lane.clientHeight / 2 + cell.clientHeight / 2;
    lane.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }

  // Re-render one lane (and its header) after its die lands, then glide the
  // frame from the old step to the new one.
  updateLane(mascotId, fromStep) {
    const mascot = mascotById(mascotId);
    const lane = this.root.querySelector(`.lane[data-mascot="${mascotId}"]`);
    if (!lane) return;
    lane.outerHTML = this.renderLane(mascot);
    const idx = MASCOTS.findIndex((m) => m.id === mascotId);
    const head = this.root.querySelectorAll('.board-heads .lane-label')[idx];
    if (head) head.outerHTML = this.renderLaneHead(mascot);
    this.root.querySelectorAll('.board-heads .lane-label')[idx]
      ?.querySelector('.stats-btn')?.addEventListener('click', () => this.showStats(mascotId));
    const newLane = this.root.querySelector(`.lane[data-mascot="${mascotId}"]`);
    this.centerLaneOnStep(newLane, fromStep, false);
    requestAnimationFrame(() => this.centerLaneOnStep(newLane, this.game.steps[mascotId], true));
  }

  // --- Player panels -----------------------------------------------------------

  renderPlayerPanel(p) {
    const g = this.game;
    const player = g.players[p];
    const level = g.playerLevel(p);
    return `
      <div class="player-panel" data-player="${p}" style="--pc:${PLAYER_COLORS[p]}">
        <div class="player-head">
          <b>${PLAYER_NAMES[p]}</b>
          <span class="stat info-click" data-info="coins" title="How the Coin bank works">🪙 <b>${player.coins}</b></span>
          <span class="stat info-click" data-info="ep" title="How EP works">⭐ <b>${player.ep}</b> EP</span>
          <span class="stat level info-click" data-info="ep" title="How EP Levels work">Level ${level}</span>
        </div>
        <div class="shop">
          <div class="shop-row">
            <div class="shop-title">Betting Tickets <button class="btn btn-tiny" data-action="refresh" data-player="${p}" ${player.coins < CONFIG.refreshCost || g.over ? 'disabled' : ''}>↻ Refresh (${CONFIG.refreshCost}🪙)</button></div>
            <div class="cards">${player.tickets.map((id, slot) => this.renderTicketCard(p, id, slot)).join('')}</div>
          </div>
          <div class="shop-row">
            <div class="shop-title">Spells <span class="hint">(cost EP)</span> <button class="btn btn-tiny info-click" data-info="spells" title="How Spells work">?</button></div>
            <div class="cards">${player.spells.map((id, slot) => this.renderSpellCard(p, id, slot)).join('')}</div>
          </div>
        </div>
      </div>`;
  }

  renderTicketCard(p, id, slot) {
    const g = this.game;
    const t = ticketById(id);
    const m = mascotById(t.mascotId);
    const sold = g.players[p].ticketSold[slot];
    const canAfford = g.players[p].coins >= t.cost;
    const base = g.steps[t.mascotId];
    const offsets = [t.target1, t.target2].filter((x) => x !== null);
    const spots = offsets
      .map((x) => `<b>${this.upDown(x)}</b> <span class="hint">(step ${Math.max(BOARD_MIN, Math.min(BOARD_MAX, base + x))})</span>`)
      .join('<br>');
    const prob = collectProbability(m, offsets, g.oddsHorizon());
    return `
      <div class="card ticket rarity-${t.rarity.toLowerCase()} ${sold ? 'sold' : ''}" style="--mc:${m.color}">
        <div class="card-head info-click" data-stats="${m.id}" title="See ${m.name}'s die">${mascotSvg(m.id, 26)}<span>${m.name}</span><span class="rarity">${t.rarity}</span></div>
        <div class="card-body">
          <div class="reward">⭐ ${t.reward} EP</div>
          <div class="targets">${spots}</div>
          <div class="difficulty">${oddsLabel(prob)} &middot; ${Math.round(prob * 100)}%</div>
        </div>
        ${sold
          ? '<div class="sold-tag">SOLD</div>'
          : `<button class="btn btn-buy" data-action="buy-ticket" data-player="${p}" data-slot="${slot}" ${!canAfford || g.over ? 'disabled' : ''}>Bet 🪙${t.cost}</button>`}
      </div>`;
  }

  renderSpellCard(p, id, slot) {
    const g = this.game;
    const s = spellById(id);
    const m = mascotById(s.mascotId);
    const sold = g.players[p].spellSold[slot];
    const canAfford = g.players[p].ep >= s.cost;
    return `
      <div class="card spell ${sold ? 'sold' : ''}" style="--mc:${m.color}">
        <div class="card-head">${mascotSvg(m.id, 26)}<span>${m.name}</span><span class="rarity">✨</span></div>
        <div class="card-body"><div class="spell-desc">${s.description}</div></div>
        ${sold
          ? '<div class="sold-tag">SOLD</div>'
          : `<button class="btn btn-buy" data-action="cast-spell" data-player="${p}" data-slot="${slot}" ${!canAfford || g.over ? 'disabled' : ''}>Cast ⭐${s.cost}</button>`}
      </div>`;
  }

  wirePanels() {
    this.root.querySelectorAll('[data-action="buy-ticket"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.animating) return;
        const p = Number(btn.dataset.player);
        const slot = Number(btn.dataset.slot);
        const res = this.game.buyTicket(p, slot);
        if (!res.ok) return this.toast(res.reason);
        const t = res.ticket;
        this.log(`${PLAYER_NAMES[p]} bet 🪙${t.cost} on ${mascotById(t.mascotId).name}: ⭐${t.reward} EP on step ${res.placed.map((x) => x.step).join(' & ')}.`);
        this.renderGame();
      });
    });
    this.root.querySelectorAll('[data-action="cast-spell"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.animating) return;
        const p = Number(btn.dataset.player);
        const slot = Number(btn.dataset.slot);
        const spell = spellById(this.game.players[p].spells[slot]);
        if (!spell.needsTarget) {
          const res = this.game.castSpell(p, slot);
          if (!res.ok) return this.toast(res.reason);
          this.log(`${PLAYER_NAMES[p]} cast: ${spell.description}.`);
          this.renderGame();
        } else {
          const steps = this.game.spellTargets(p, slot);
          if (steps.length === 0) {
            return this.toast(`No EP on any Steps for ${mascotById(spell.mascotId).name}`);
          }
          this.targeting = { player: p, slot, spell, steps };
          this.renderGame();
          this.showTargetingBanner();
        }
      });
    });
    this.root.querySelectorAll('[data-action="refresh"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.animating) return;
        const p = Number(btn.dataset.player);
        const res = this.game.refreshTickets(p);
        if (!res.ok) return this.toast(res.reason);
        this.log(`${PLAYER_NAMES[p]} refreshed their Bets for 🪙${CONFIG.refreshCost}.`);
        this.renderGame();
      });
    });
    this.root.querySelectorAll('.stats-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.showStats(Number(btn.dataset.mascot)));
    });
  }

  // --- Spell targeting ---------------------------------------------------------

  showTargetingBanner() {
    const banner = $('#targeting-banner', this.root);
    const { spell, steps } = this.targeting;
    banner.hidden = false;
    banner.innerHTML = `Pick a highlighted ${mascotById(spell.mascotId).name} step (${steps.join(', ')}) &mdash; <button class="btn btn-tiny" id="cancel-target">Cancel</button>`;
    $('#cancel-target', banner).addEventListener('click', () => {
      this.targeting = null;
      this.renderGame();
    });
  }

  wireTargeting() {
    if (!this.targeting) return;
    const { player, slot, spell, steps } = this.targeting;
    const ownerIndex = spell.targetsOpponent ? 1 - player : player;
    for (const chip of this.root.querySelectorAll(
      `.chip[data-mascot="${spell.mascotId}"][data-player="${ownerIndex}"]`,
    )) {
      const step = Number(chip.dataset.step);
      if (!steps.includes(step)) continue;
      chip.classList.add('targetable');
      chip.addEventListener('click', () => {
        const res = this.game.castSpell(player, slot, step);
        this.targeting = null;
        if (!res.ok) {
          this.toast(res.reason);
        } else {
          let detail = '';
          if (res.collected) detail = ` &mdash; collected ⭐${res.collected} instantly!`;
          else if (res.stolen) detail = ` &mdash; stole ⭐${res.stolen}!`;
          else if (res.movedTo !== undefined) detail = ` &mdash; moved to step ${res.movedTo}.`;
          else if (res.newValue !== undefined) detail = ` &mdash; step ${step} now ⭐${res.newValue}.`;
          this.log(`${PLAYER_NAMES[player]} cast: ${spell.description}${detail}`);
        }
        this.renderGame();
      });
    }
    this.showTargetingBanner();
  }

  // --- Rolling -------------------------------------------------------------

  async doRoll() {
    if (this.animating || this.game.over) return;
    this.targeting = null;
    const events = this.game.roll();
    this.animating = true;
    const rollBtn = $('#roll-btn', this.root);
    if (rollBtn) rollBtn.disabled = true;
    this.skipRequested = false;
    this.skipPromise = new Promise((resolve) => {
      this.requestSkip = () => { this.skipRequested = true; resolve(); };
    });
    const skipBtn = $('#skip-btn', this.root);
    if (skipBtn) skipBtn.hidden = false;

    // Group each roll with the collections it caused, so collections animate
    // right after their mascot moves.
    const batches = [];
    const tail = [];
    for (const e of events) {
      if (e.type === 'roll') batches.push({ roll: e, collects: [] });
      else if (e.type === 'collect') batches[batches.length - 1].collects.push(e);
      else tail.push(e);
    }

    for (const { roll, collects } of batches) {
      const m = mascotById(roll.mascotId);
      await this.animateDie(roll);
      this.updateLane(roll.mascotId, roll.from);
      this.log(`${m.name} rolled ${this.upDown(roll.roll)} → step ${roll.to}.`);
      if (collects.length && !this.skipRequested) {
        await sleep(350); // let the lane glide before the stars take off
        await Promise.race([
          Promise.all(collects.map((c, i) => sleep(i * 180).then(() => this.animateCollect(c)))),
          this.skipPromise,
        ]);
      }
      for (const c of collects) {
        this.log(`💰 ${PLAYER_NAMES[c.player]}: ${m.name} collected ⭐${c.amount} EP from step ${c.step}!`, 'good');
      }
      if (!this.skipRequested) await sleep(400);
    }

    for (const e of tail) {
      if (e.type === 'news' || e.type === 'newsEnd') this.log(e.message, 'news');
    }

    this.animating = false;
    this.renderGame();
  }

  // Floating "+N EP" at the collected step, and a star that flies to the
  // player's EP bank — the number ticks up when it lands.
  animateCollect(c) {
    const lane = this.root.querySelector(`.lane[data-mascot="${c.mascotId}"]`);
    if (!lane) return Promise.resolve();
    const cell = lane.querySelector(`.cell[data-step="${c.step}"]`);
    const laneRect = lane.getBoundingClientRect();
    const cellRect = (cell || lane).getBoundingClientRect();
    const x = cellRect.left + cellRect.width * 0.65;
    const y = Math.min(Math.max(cellRect.top + cellRect.height / 2, laneRect.top + 14), laneRect.bottom - 14);

    const float = document.createElement('div');
    float.className = 'float-text';
    float.textContent = `+${c.amount} EP`;
    float.style.left = `${x}px`;
    float.style.top = `${y - 12}px`;
    document.body.appendChild(float);
    setTimeout(() => float.remove(), 1200);

    const epEl = this.root.querySelector(`.player-panel[data-player="${c.player}"] [data-info="ep"] b`);
    if (!epEl) return Promise.resolve();
    const target = epEl.getBoundingClientRect();
    const star = document.createElement('div');
    star.className = 'fly-star';
    star.textContent = '⭐';
    star.style.left = `${x}px`;
    star.style.top = `${y}px`;
    document.body.appendChild(star);
    const dx = target.left + target.width / 2 - x;
    const dy = target.top + target.height / 2 - y;
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        star.style.transform = `translate(${dx}px, ${dy}px) scale(0.6)`;
      }));
      setTimeout(() => {
        star.remove();
        epEl.textContent = Number(epEl.textContent) + c.amount;
        const stat = epEl.closest('.stat');
        stat?.classList.add('ep-bump');
        setTimeout(() => stat?.classList.remove('ep-bump'), 450);
        resolve();
      }, 800);
    });
  }

  // Spin the mascot's d10 through its real faces, then land on the roll.
  // A skip request cuts straight to the result.
  async animateDie(e) {
    const slot = this.root.querySelector(`.die-slot[data-mascot="${e.mascotId}"]`);
    if (!slot) return;
    const die = slot.querySelector('.d10');
    const num = slot.querySelector('.die-num');
    const result = slot.querySelector('.die-result');
    const setFinal = () => {
      num.textContent = e.roll > 0 ? `+${e.roll}` : `${e.roll}`;
      result.textContent = this.upDown(e.roll);
    };
    if (this.skipRequested) return setFinal();
    const faces = mascotById(e.mascotId).rolls;
    die.classList.add('rolling');
    result.textContent = '…';
    const spin = setInterval(() => {
      const f = faces[Math.floor(Math.random() * faces.length)];
      num.textContent = f > 0 ? `+${f}` : `${f}`;
    }, 65);
    await Promise.race([sleep(700), this.skipPromise]);
    clearInterval(spin);
    die.classList.remove('rolling');
    setFinal();
    if (!this.skipRequested) {
      die.classList.add('landed');
      await sleep(350);
      die.classList.remove('landed');
    }
  }

  renderGameOver() {
    const g = this.game;
    let headline, detail;
    if (g.mode === 1) {
      const ep = g.players[0].ep;
      headline = g.winner ? '🎉 You made the leaderboard!' : 'Good game!';
      detail = g.winner
        ? `You scored <b>${ep} EP</b> — over ${CONFIG.onePlayerGoal}!`
        : `You scored <b>${ep} EP</b>. Get ${CONFIG.onePlayerGoal} to make the leaderboard — better luck next time!`;
    } else {
      const [a, b] = g.players.map((x) => x.ep);
      headline = g.winner === 'tie' ? "🤝 It's a tie!" : `🏆 ${PLAYER_NAMES[g.winner]} wins!`;
      detail = `Final score: <b>${a}</b> to <b>${b}</b>.`;
    }
    return `
      <div class="overlay">
        <div class="overlay-card">
          <div class="start-mascots">${MASCOTS.map((m) => mascotSvg(m.id, 56)).join('')}</div>
          <h2>${headline}</h2>
          <p>${detail}</p>
          <button class="btn btn-primary" id="play-again">Play again</button>
        </div>
      </div>`;
  }

  // --- Info popups (the prototype's clickable Show*Info boxes) -----------------

  wireInfo() {
    $('#all-bets-btn', this.root)?.addEventListener('click', () => this.showAllBets());
    $('#stats-geek-btn', this.root)?.addEventListener('click', () => this.showStatsGeek());
    $('#news-banner', this.root)?.addEventListener('click', () => this.showInfo('news'));
    this.root.querySelectorAll('[data-info]').forEach((el) => {
      el.addEventListener('click', () => this.showInfo(el.dataset.info));
    });
    this.root.querySelectorAll('[data-stats]').forEach((el) => {
      el.addEventListener('click', () => this.showStats(Number(el.dataset.stats)));
    });
  }

  showInfo(topic) {
    if (topic === 'coins') {
      this.modal(`
        <h2>🪙 The Coin Bank</h2>
        <ul class="info-list">
          <li>Coins buy <b>Betting Tickets</b>.</li>
          <li>You start with <b>${CONFIG.startingCoins}</b> and get <b>+${CONFIG.coinsPerRound}</b> after every roll.</li>
          <li><b>Interest:</b> each round you also earn 1 extra Coin per ${CONFIG.interestDivisor} you're holding
            (max +${CONFIG.maxInterest}) — saving up pays off.</li>
          <li>Refreshing your ticket offers costs ${CONFIG.refreshCost} Coins; offers refresh free after every roll.</li>
        </ul>`);
    } else if (topic === 'ep') {
      const rows = EP_LEVELS
        .map((l) => `<tr><td>Level ${l.level}</td><td>${l.minEP}+ EP</td></tr>`)
        .join('');
      this.modal(`
        <h2>⭐ EP &amp; Levels</h2>
        <ul class="info-list">
          <li>EP (Event Points) is your <b>score</b> — and the currency for <b>Spells</b>.</li>
          <li>Earn EP when a mascot lands on or passes one of your bounties.</li>
          <li>Your banked EP sets your <b>Level</b>, and higher levels unlock rarer,
            bigger tickets and spells in the shop:</li>
        </ul>
        <table class="stats-table"><tr><th>Level</th><th>EP in bank</th></tr>${rows}</table>
        <p class="hint">Careful: spending EP on spells can drop your Level (and your score).
        ${this.game?.mode === 1
          ? `Score ${CONFIG.onePlayerGoal}+ in ${CONFIG.onePlayerRounds} rounds to make the leaderboard.`
          : `First player to ${CONFIG.twoPlayerGoal} EP wins.`}</p>`);
    } else if (topic === 'spells') {
      this.modal(`
        <h2>✨ Spells</h2>
        <ul class="info-list">
          <li>You're offered 2 spells per round; casting costs <b>EP</b>, not Coins.</li>
          <li><b>Double</b> (10 EP) — double one of your bounties, up to +50.</li>
          <li><b>Move closer</b> (15 EP) — slide a bounty toward its mascot
            (Mousey/Wolf 2 steps, Flixy 4, Bizarro 6). If it reaches the mascot, collect instantly!</li>
          <li><b>Halve</b> (20 EP) — halve an opponent's bounty, up to −50.</li>
          <li><b>Steal</b> (50 EP) — take up to 50 EP off an opponent's bounty onto yours.</li>
          <li><b>Up only / Down only / Freeze</b> (10–30 EP) — control a mascot's next roll.
            These affect the mascot itself, so <i>both</i> players feel it.</li>
        </ul>`);
    } else if (topic === 'news') {
      const rows = NEWS_TABLE.map((row, i) => {
        const prev = i === 0 ? 1 : NEWS_TABLE[i - 1].threshold;
        const pct = Math.round((prev - row.threshold) * 100);
        return `<tr><td>${mascotById(row.mascotId).name}</td><td>${row.direction > 0 ? '⬆ Up only' : '⬇ Down only'}</td><td>${pct}%</td></tr>`;
      }).join('');
      this.modal(`
        <h2>📣 Mascot News Alerts</h2>
        <ul class="info-list">
          <li>After each roll, if no alert is running, there's a <b>40%</b> chance one hits.</li>
          <li>The named mascot can only move in the reported direction for the next
            <b>${CONFIG.newsDurationRolls} rolls</b> — plan your bets around it!</li>
        </ul>
        <table class="stats-table"><tr><th>Mascot</th><th>Alert</th><th>Odds</th></tr>${rows}</table>`);
    }
  }

  showAllBets() {
    const horizon = this.game.oddsHorizon();
    const sections = MASCOTS.map((m) => {
      const rows = TICKETS.filter((t) => t.mascotId === m.id)
        .sort((a, b) => a.cost - b.cost)
        .map((t) => {
          const offsets = [t.target1, t.target2].filter((x) => x !== null);
          const targets = offsets.map((x) => this.upDown(x)).join(' & ');
          const prob = collectProbability(m, offsets, horizon);
          return `<tr><td>${t.rarity}</td><td>🪙${t.cost}</td><td>⭐${t.reward}</td><td>${targets}</td><td>${oddsLabel(prob)} &middot; ${Math.round(prob * 100)}%</td></tr>`;
        }).join('');
      return `
        <div class="bets-section" style="--mc:${m.color}">
          <div class="bets-head">${mascotSvg(m.id, 30)}<b>${m.name}</b></div>
          <table class="stats-table full">
            <tr><th>Rarity</th><th>Cost</th><th>Reward</th><th>Bounty on</th><th>Odds</th></tr>${rows}
          </table>
        </div>`;
    }).join('');
    this.modal(`<h2>📋 All Possible Bets</h2>
      <p class="hint">Bounties land relative to the mascot's step when you buy.
      Odds are the chance of a payout within the next ${horizon} roll${horizon === 1 ? '' : 's'}.
      Rarer tickets appear in the shop as your Level rises.</p>${sections}`, { wide: true });
  }

  showStatsGeek() {
    const cols = MASCOTS.map((m) => {
      const sorted = [...m.rolls].sort((a, b) => a - b);
      const avg = m.rolls.reduce((s, r) => s + r, 0) / m.rolls.length;
      const avgAbs = m.rolls.reduce((s, r) => s + Math.abs(r), 0) / m.rolls.length;
      const up = m.rolls.filter((r) => r > 0).length * 10;
      return `
        <div class="geek-col" style="--mc:${m.color}">
          <div class="bets-head">${mascotSvg(m.id, 30)}<b>${m.name}</b></div>
          <div class="geek-rolls">${sorted.map((r) => `<span class="${r > 0 ? 'pos' : 'neg'}">${r > 0 ? '+' : ''}${r}</span>`).join('')}</div>
          <div class="geek-stats">
            <div>Chance up: <b>${up}%</b></div>
            <div>Avg move: <b>${avg >= 0 ? '+' : ''}${avg.toFixed(1)}</b></div>
            <div>Avg size: <b>${avgAbs.toFixed(1)}</b></div>
          </div>
        </div>`;
    }).join('');
    this.modal(`<h2>🤓 Stats Geek</h2>
      <p class="hint">Each mascot rolls one of its 10 moves, all equally likely.</p>
      <div class="geek-grid">${cols}</div>`, { wide: true });
  }

  // --- Stats popup, log, toast ------------------------------------------------

  showStats(mascotId) {
    const m = mascotById(mascotId);
    const news = this.game?.news;
    const alert = news && news.mascotId === mascotId ? news : null;
    const blocked = (r) => alert && (alert.direction > 0 ? r <= 0 : r >= 0);
    const pill = (r) => `<span class="${r > 0 ? 'pos' : 'neg'} ${blocked(r) ? 'off' : ''}">${r > 0 ? '+' : ''}${r}</span>`;
    const upFaces = m.rolls.filter((r) => r > 0).sort((a, b) => a - b).map(pill).join('');
    const downFaces = m.rolls.filter((r) => r <= 0).sort((a, b) => b - a).map(pill).join('');
    const avg = m.rolls.reduce((s, r) => s + r, 0) / m.rolls.length;
    const avgAbs = m.rolls.reduce((s, r) => s + Math.abs(r), 0) / m.rolls.length;
    const up = m.rolls.filter((r) => r > 0).length * 10;
    this.modal(`
      <div class="stats-head">${mascotSvg(m.id, 56)}<div><h2>${m.name}</h2><p>${m.className} &middot; ${m.sector}</p></div></div>
      <p class="hint">${m.name} rolls a 10-sided die with exactly these sides:</p>
      <div class="geek-rolls big">${upFaces}</div>
      <div class="geek-rolls big">${downFaces}</div>
      ${alert ? `<p class="hint alert-note">⚠️ Mascot News: ${m.name} can only move <b>${alert.direction > 0 ? 'Up' : 'Down'}</b> right now — greyed sides can't be rolled.</p>` : ''}
      <p class="hint">Chance up: <b>${up}%</b> &middot; Avg move: <b>${avg >= 0 ? '+' : ''}${avg.toFixed(1)}</b> &middot; Avg size: <b>${avgAbs.toFixed(1)}</b></p>`);
  }

  modal(html, { wide = false } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="overlay-card ${wide ? 'wide' : ''}">${html}<button class="btn btn-primary close-modal">Close</button></div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('close-modal')) overlay.remove();
    });
    this.root.appendChild(overlay);
  }

  log(text, cls = '') {
    this.logLines.unshift({ text, cls });
    this.logLines = this.logLines.slice(0, 120);
    const el = $('#log', this.root);
    if (el) el.innerHTML = this.logHtml();
  }

  logHtml() {
    return this.logLines.map((l) => `<div class="log-line ${l.cls}">${l.text}</div>`).join('');
  }

  toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2400);
  }
}

// The game-over overlay's button is re-rendered with the page; delegate once.
document.addEventListener('click', (e) => {
  if (e.target.id === 'play-again') {
    const ui = window.__marketPartyUI;
    if (ui) ui.renderStart();
  }
});
