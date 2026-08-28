// Market Party — DOM UI. Renders the engine state and wires player actions.

import { Game } from './engine.js';
import {
  MASCOTS, CONFIG, BOARD_MIN, BOARD_MAX,
  mascotById, ticketById, spellById,
} from './data.js';
import { mascotSvg } from './mascotArt.js';

const $ = (sel, root = document) => root.querySelector(sel);

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
    this.root.innerHTML = `
      <header class="topbar">
        <div class="brand">${mascotSvg(2, 28)}<span>Market Party</span></div>
        <div class="round-info">${
          g.mode === 1
            ? `Round <b>${Math.min(g.round + 1, CONFIG.onePlayerRounds)}</b> / ${CONFIG.onePlayerRounds}`
            : `Round <b>${g.round + 1}</b> &middot; first to ${CONFIG.twoPlayerGoal} EP`
        }</div>
        <div class="news-banner ${g.news ? 'active' : ''}">${this.newsText()}</div>
        <button class="btn btn-roll" id="roll-btn" ${g.over ? 'disabled' : ''}>🎲 ROLL</button>
        <button class="btn btn-ghost" id="restart-btn">New game</button>
      </header>
      <main>
        <section class="board" id="board">${this.renderBoard()}</section>
        <section class="panels">${g.players.map((_, p) => this.renderPlayerPanel(p)).join('')}</section>
        <section class="log-panel"><h3>Game log</h3><div class="log" id="log">${this.logHtml()}</div></section>
      </main>
      <div class="targeting-banner" id="targeting-banner" hidden></div>
      ${g.over ? this.renderGameOver() : ''}`;

    $('#roll-btn', this.root)?.addEventListener('click', () => this.doRoll());
    $('#restart-btn', this.root).addEventListener('click', () => this.renderStart());
    this.wirePanels();
    this.wireTargeting();
    this.centerLanes();
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

  renderLane(mascot) {
    const g = this.game;
    const step = g.steps[mascot.id];
    const last = g.lastRolls[mascot.id];
    const flag = g.flags[mascot.id];
    const flagBadge =
      flag === 2 ? '<span class="flag">❄ frozen</span>'
      : flag === 1 ? '<span class="flag">⬆ up only</span>'
      : flag === -1 ? '<span class="flag">⬇ down only</span>' : '';
    const cells = [];
    for (let s = BOARD_MIN; s <= BOARD_MAX; s++) {
      const chips = g.players
        .map((player, p) => {
          const ep = player.board[mascot.id][s];
          return ep
            ? `<span class="chip p${p}" data-mascot="${mascot.id}" data-step="${s}" data-player="${p}" title="${PLAYER_NAMES[p]}: ${ep} EP on step ${s}">${ep}</span>`
            : '';
        })
        .join('');
      cells.push(`
        <div class="cell ${s % 10 === 0 ? 'decade' : ''} ${s === step ? 'here' : ''}" data-step="${s}">
          <span class="step-num">${s % 5 === 0 ? s : ''}</span>
          ${s === step ? `<span class="token" style="--mc:${mascot.color}">${mascotSvg(mascot.id, 34)}</span>` : ''}
          <span class="chips">${chips}</span>
        </div>`);
    }
    return `
      <div class="lane" data-mascot="${mascot.id}">
        <div class="lane-label" style="--mc:${mascot.color}">
          ${mascotSvg(mascot.id, 44)}
          <div>
            <b>${mascot.name}</b><span class="class-tag">${mascot.className}</span>
            <div class="lane-sub">at <b>${step}</b>${last ? ` &middot; last ${last > 0 ? '+' : ''}${last}` : ''} ${flagBadge}</div>
          </div>
          <button class="btn btn-tiny stats-btn" data-mascot="${mascot.id}" title="Roll odds">📊</button>
        </div>
        <div class="track-wrap"><div class="track">${cells.join('')}</div></div>
      </div>`;
  }

  centerLanes() {
    for (const lane of this.root.querySelectorAll('.lane')) {
      const mascotId = Number(lane.dataset.mascot);
      const wrap = $('.track-wrap', lane);
      const cell = lane.querySelector(`.cell[data-step="${this.game.steps[mascotId]}"]`);
      if (wrap && cell) wrap.scrollLeft = cell.offsetLeft - wrap.clientWidth / 2 + cell.clientWidth / 2;
    }
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
          <span class="stat">🪙 <b>${player.coins}</b></span>
          <span class="stat">⭐ <b>${player.ep}</b> EP</span>
          <span class="stat level">Level ${level}</span>
        </div>
        <div class="shop">
          <div class="shop-row">
            <div class="shop-title">Betting Tickets <button class="btn btn-tiny" data-action="refresh" data-player="${p}" ${player.coins < CONFIG.refreshCost || g.over ? 'disabled' : ''}>↻ Refresh (${CONFIG.refreshCost}🪙)</button></div>
            <div class="cards">${player.tickets.map((id, slot) => this.renderTicketCard(p, id, slot)).join('')}</div>
          </div>
          <div class="shop-row">
            <div class="shop-title">Spells <span class="hint">(cost EP)</span></div>
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
    const spots = [t.target1, t.target2]
      .filter((x) => x !== null)
      .map((x) => `<b>${Math.max(BOARD_MIN, Math.min(BOARD_MAX, base + x))}</b>`)
      .join(' & ');
    return `
      <div class="card ticket rarity-${t.rarity.toLowerCase()} ${sold ? 'sold' : ''}" style="--mc:${m.color}">
        <div class="card-head">${mascotSvg(m.id, 26)}<span>${m.name}</span><span class="rarity">${t.rarity}</span></div>
        <div class="card-body">
          <div class="reward">⭐ ${t.reward} EP</div>
          <div class="targets">on step ${spots}</div>
          <div class="difficulty">${t.difficulty}</div>
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

  doRoll() {
    this.targeting = null;
    const events = this.game.roll();
    for (const e of events) {
      if (e.type === 'roll') {
        const m = mascotById(e.mascotId);
        this.log(`${m.name} rolled ${e.roll > 0 ? '+' : ''}${e.roll}${e.roll === 0 ? ' (frozen)' : ''} → step ${e.to}.`);
      } else if (e.type === 'collect') {
        this.log(`💰 ${PLAYER_NAMES[e.player]}: ${mascotById(e.mascotId).name} collected ⭐${e.amount} EP from step ${e.step}!`, 'good');
      } else if (e.type === 'news' || e.type === 'newsEnd') {
        this.log(e.message, 'news');
      } else if (e.type === 'gameover') {
        // handled by overlay
      }
    }
    this.renderGame();
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

  // --- Stats popup, log, toast ------------------------------------------------

  showStats(mascotId) {
    const m = mascotById(mascotId);
    const counts = {};
    for (const r of m.rolls) counts[r] = (counts[r] || 0) + 1;
    const rows = Object.entries(counts)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([roll, n]) => `<tr><td>${Number(roll) > 0 ? '+' : ''}${roll}</td><td>${n * 10}%</td></tr>`)
      .join('');
    const avgAbs = m.rolls.reduce((s, r) => s + Math.abs(r), 0) / m.rolls.length;
    this.modal(`
      <div class="stats-head">${mascotSvg(m.id, 56)}<div><h2>${m.name}</h2><p>${m.className} &middot; ${m.sector}</p></div></div>
      <table class="stats-table"><tr><th>Roll</th><th>Odds</th></tr>${rows}</table>
      <p class="hint">Average move size: ${avgAbs.toFixed(1)} steps</p>`);
  }

  modal(html) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="overlay-card">${html}<button class="btn btn-primary close-modal">Close</button></div>`;
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
