// Market Party — DOM UI. Renders the engine state and wires player actions.

import { Game, FLAG } from './engine.js';
import {
  MASCOTS, CONFIG, ROGUE, BOARD_MIN, BOARD_MAX, START_STEP,
  TICKETS, SPELLS, EP_LEVELS, NEWS_TABLE, NEWS_EMOJI,
  TICKET_TIER_WEIGHTS, SPELL_TYPE_WEIGHTS, PAYOUT_RATIOS,
  mascotById, ticketById, spellById,
} from './data.js';
import { mascotSvg } from './mascotArt.js';
import { collectProbability, oddsLabel } from './odds.js';
import { TUTORIAL_STEPS } from './tutorial.js';
import { BOT_LEVELS, botName, botTakeTurn } from './bot.js';

const $ = (sel, root = document) => root.querySelector(sel);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Inline gold-bar icon used wherever the old star appeared.
const GOLD = '<svg class="gold-icon" viewBox="0 0 24 14" aria-label="gold"><polygon points="5,1 19,1 23,13 1,13" fill="#ffd21f" stroke="#a06d00" stroke-width="1.5"/><polygon points="7.5,3.5 16.5,3.5 18,6 6,6" fill="#fff3b0"/></svg>';

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
          <p class="tagline">Bet on the mascots. Collect the Gold. Throw the best party on the Street.</p>
          <div class="mode-grid">
            <div class="mode-col">
              <div class="mode-col-title">1 Player</div>
              <button class="mode-tile tile-rogue" id="rogue-btn">
                <span class="tile-emoji">🗺️</span>
                <span class="tile-name">Roguelike</span>
                <span class="tile-sub">draft mascots &middot; survive the checkpoints</span>
              </button>
              <button class="mode-tile tile-solo" data-mode="1">
                <span class="tile-emoji">🎯</span>
                <span class="tile-name">Classic</span>
                <span class="tile-sub">${CONFIG.onePlayerRounds} rounds &middot; chase ${CONFIG.onePlayerGoal} Gold</span>
              </button>
            </div>
            <div class="mode-col">
              <div class="mode-col-title">2 Players</div>
              <button class="mode-tile tile-bot" id="vs-bot-btn">
                <span class="tile-emoji">🤖</span>
                <span class="tile-name">Vs Bot</span>
                <span class="tile-sub">take on Randy, Billy, or Baldy</span>
              </button>
              <button class="mode-tile tile-duel" data-mode="2">
                <span class="tile-emoji">⚔️</span>
                <span class="tile-name">Hotseat</span>
                <span class="tile-sub">first to ${CONFIG.twoPlayerGoal} Gold wins</span>
              </button>
            </div>
          </div>
          <div class="start-utility">
            <button class="btn" id="tutorial-btn">📖 Tutorial</button>
            <button class="btn" id="leaderboard-btn">🏆 Leaderboard</button>
          </div>
          <details class="rules">
            <summary>How to play</summary>
            <ol>
              <li>Four mascots random-walk a 0&ndash;100 track. Each has its own move style &mdash; Wolf grinds, Bizarro swings wild.</li>
              <li>Each round, spend <b>Dollars</b> on Betting Tickets. A ticket drops an <b>Gold bounty</b> on steps near its mascot.</li>
              <li>Hit <b>Roll</b>. When a mascot lands on or passes one of your bounties, you bank the Gold.</li>
              <li>Spend banked Gold on <b>Manipulations</b> &mdash; double bounties, drag them closer, freeze a mascot, or raid your opponent.</li>
              <li>Banked Gold raises your <b>Level</b>, unlocking rarer tickets and manipulations. Watch for <b>Mascot News</b>!</li>
            </ol>
          </details>
        </div>
      </div>`;
    this.root.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this.newGame(Number(btn.dataset.mode)));
    });
    $('#tutorial-btn', this.root)?.addEventListener('click', () => this.showTutorial());
    $('#vs-bot-btn', this.root)?.addEventListener('click', () => this.showBotPicker());
    $('#rogue-btn', this.root)?.addEventListener('click', () => this.newGame('rogue'));
    $('#leaderboard-btn', this.root)?.addEventListener('click', () => {
      this.modal(`<h2>🏆 Leaderboard</h2>
        <h3>🎯 Classic</h3>${this.leaderboardHtml()}
        <h3>🗺️ Roguelike</h3>${this.leaderboardHtml(null, true)}`);
    });
  }

  showBotPicker() {
    const overlay = this.modal(`
      <h2>🤖 Pick your opponent</h2>
      <div class="start-buttons bot-picker">
        ${Object.entries(BOT_LEVELS).map(([key, b]) => `
          <button class="btn btn-primary bot-pick" data-bot="${key}">
            ${b.emoji} <b>${b.name}</b> &mdash; ${b.blurb}
          </button>`).join('')}
      </div>`);
    overlay.querySelectorAll('.bot-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlay.remove();
        this.newGame(2, btn.dataset.bot);
      });
    });
  }

  playerName(p) {
    return p === 1 && this.botLevel ? botName(this.botLevel) : PLAYER_NAMES[p];
  }

  // The board always shows 4 lane slots. Roguelike fills them left to right
  // in draft order, with anonymous "?" slots for mascots yet to join (their
  // identity is unknown until drafted); classic modes show the fielded four.
  laneSlots() {
    const g = this.game;
    if (!g.rogue) return g.activeList();
    const slots = g.activeMascots.map((id) => mascotById(id));
    while (slots.length < 4) slots.push(null);
    return slots;
  }

  newGame(mode, botLevel = null) {
    this.botLevel = botLevel;
    this.game = new Game({ mode });
    this.logLines = [];
    this.targeting = null;
    this.skipPromise = null;
    this.skipRequested = false;
    this.animating = false;
    this.scoreSaved = false;
    this.lastScoreIndex = null;
    this.resultsDismissed = false;
    this.log(botLevel
      ? `New game vs ${botName(botLevel)}! Make some Bets, then Roll — your opponent moves when you do.`
      : mode === 'rogue'
        ? `Roguelike run started! Hit every checkpoint or the run ends. Win with ${ROGUE.targets[ROGUE.rounds]} Gold after round ${ROGUE.rounds}.`
        : `New ${mode}-player game. Make some Bets, then Roll!`);
    this.renderGame();
    (async () => {
      await this.showRoundBanner(1);
      if (this.game.rogue) await this.showTrancheGoal();
      for (const e of this.game.startEvents) {
        if (e.type === 'news') {
          this.log(e.message, 'news');
          await this.showNewsPopup(e);
        }
      }
      this.renderGame(); // refresh the news banner / alert boxes
    })();
  }

  // --- Main render -----------------------------------------------------------

  renderGame() {
    const g = this.game;
    const scrollY = window.scrollY;
    this.root.innerHTML = `
      <header class="topbar">
        <div class="brand">${mascotSvg(2, 28)}<span>Market Party</span></div>
        <div class="news-banner info-click ${g.news.length ? 'active' : ''}" id="news-banner" title="How Mascot News works">${this.newsText()}</div>
        <button class="btn btn-ghost" id="tutorial-btn" title="Learn how to play">📖 Tutorial</button>
        <button class="btn btn-ghost" id="all-bets-btn" title="Every ticket in the game">📋 All Bets</button>
        <button class="btn btn-ghost" id="stats-geek-btn" title="Roll odds for every mascot">🤓 Stats Geek</button>
        <button class="btn btn-ghost" id="restart-btn">New game</button>
      </header>
      <main>
        <section class="board" id="board">
          <div class="board-heads">${this.laneSlots().map((m) => this.renderLaneHead(m)).join('')}</div>
          <div class="board-tracks">${this.renderBoard()}</div>
        </section>
        <div class="side">
          ${this.renderRollPanel()}
          <section class="panels">${g.players.map((_, p) => this.renderPlayerPanel(p)).join('')}</section>
          <section class="log-panel"><h3>Game log</h3><div class="log" id="log">${this.logHtml()}</div></section>
        </div>
      </main>
      <div class="targeting-banner" id="targeting-banner" hidden></div>
      ${g.over && !this.resultsDismissed ? this.renderGameOver() : ''}
      ${!g.over && g.pendingChoice ? this.renderMascotChoice() : ''}`;

    $('#roll-btn', this.root)?.addEventListener('click', () => this.doRoll());
    $('#skip-btn', this.root)?.addEventListener('click', () => this.requestSkip?.());
    $('#results-btn', this.root)?.addEventListener('click', () => {
      this.resultsDismissed = false;
      this.renderGame();
    });
    $('#close-results', this.root)?.addEventListener('click', () => {
      this.resultsDismissed = true;
      this.root.querySelector('.overlay')?.remove();
    });
    this.root.querySelectorAll('.choice-pick').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.mascot);
        const slotsBefore = this.game.spellSlotCount();
        const res = this.game.chooseMascot(id);
        if (!res.ok) return this.toast(res.reason);
        this.log(`🗺️ ${mascotById(id).name} joins the run!`, 'news');
        this.renderGame();
        const slotsAfter = this.game.spellSlotCount();
        if (slotsAfter > slotsBefore) {
          this.log(slotsAfter === 1
            ? '✨ Manipulations unlocked! Execute one per round for Gold.'
            : '✨ Second Manipulation slot unlocked!', 'news');
          await this.showSpellUnlockPopup(slotsAfter);
        } else if (this.game.activeMascots.length === 4) {
          this.log('👑 Legendary tickets can now appear in the shop!', 'news');
          await this.showLegendaryUnlockPopup();
        }
      });
    });
    $('#tutorial-btn', this.root)?.addEventListener('click', () => this.showTutorial());
    $('#restart-btn', this.root).addEventListener('click', () => this.renderStart());
    $('#lb-save-btn', this.root)?.addEventListener('click', () => {
      const name = $('#lb-name', this.root)?.value.trim() || 'Anonymous';
      this.lastScoreIndex = this.saveScore(name.slice(0, 16), this.game.players[0].ep, this.game.rogue);
      this.scoreSaved = true;
      this.renderGame();
    });
    this.wireInfo();
    this.wirePanels();
    this.wireTargeting();
    this.centerLanes();
    window.scrollTo(0, scrollY); // don't jump the page on re-render (e.g. buying a bet)
  }

  // The next unpassed checkpoint of a roguelike run.
  rogueTarget() {
    for (const r of Object.keys(ROGUE.targets).map(Number).sort((a, b) => a - b)) {
      if (r > this.game.round) return { round: r, ep: ROGUE.targets[r] };
    }
    return null;
  }

  renderMascotChoice() {
    const g = this.game;
    const first = g.activeMascots.length === 0;
    const pill = (r) => `<span class="${r > 0 ? 'pos' : 'neg'}">${r > 0 ? '+' : ''}${r}</span>`;
    const cards = g.pendingChoice.map((id) => {
      const m = mascotById(id);
      const up = m.rolls.filter((r) => r > 0).sort((a, b) => a - b).map(pill).join('');
      const down = m.rolls.filter((r) => r <= 0).sort((a, b) => b - a).map(pill).join('');
      return `
        <div class="choice-card" style="--mc:${m.color}">
          <div class="bets-head">${mascotSvg(m.id, 40)}<b>${m.name}</b><span class="class-tag">${m.className}</span></div>
          <div class="geek-rolls">${up}</div>
          <div class="geek-rolls">${down}</div>
          <button class="btn btn-primary choice-pick" data-mascot="${id}">Choose ${m.name}</button>
        </div>`;
    }).join('');
    const unlocksSpell = g.spellSlotCount() < 2 && g.activeMascots.length >= 1;
    return `
      <div class="overlay">
        <div class="overlay-card wide">
          <h2>${first ? '🗺️ Choose your starting mascot!' : '🎉 A new mascot joins the run!'}</h2>
          <p class="hint">${
            first ? 'Your run begins with a single mascot on the board — study their die.'
            : g.pendingChoice.length > 1 ? 'Checkpoint cleared! Pick one of these two to add to your board.'
            : 'Checkpoint cleared! Only one mascot remains — welcome them aboard.'
          }</p>
          ${unlocksSpell ? `<p class="unlock-note">✨ This draft also unlocks ${g.spellSlotCount() === 0
            ? 'MANIPULATIONS & a 3rd ticket slot — and Super Rare tickets hit the shop this round'
            : 'a 2nd Manipulation slot & a 4th ticket slot — and Epic tickets hit the shop this round'}!</p>`
          : g.activeMascots.length === 3 ? `<p class="unlock-note">👑 Legendary tickets hit the shop this round!</p>` : ''}
          <div class="choice-cards">${cards}</div>
        </div>
      </div>`;
  }

  showSpellUnlockPopup(slotCount) {
    return this.showAcknowledgePopup('unlock-card', slotCount === 1
      ? `<h2>✨ MANIPULATIONS UNLOCKED!</h2>
        <p>With two mascots on the board you can now execute <b>one Manipulation per round</b>.
        Manipulations cost <b>Gold</b> instead of Dollars — double a bounty on the board, or drag one
        closer to its mascot.</p>
        <p>The shop grows too: a <b>3rd ticket slot</b> opens and <b>Super Rare
        tickets</b> can now drop!</p>`
      : `<h2>✨ SECOND MANIPULATION SLOT!</h2>
        <p>Your growing roster earns you <b>two Manipulation offers every round</b> from here on —
        plus a <b>4th ticket slot</b> and ✨ <b>Epic tickets</b> in the shop!</p>`);
  }

  showLegendaryUnlockPopup() {
    return this.showAcknowledgePopup('unlock-card', `<h2>👑 LEGENDARY TICKETS!</h2>
      <p>Your full roster of four brings out the big money — <b>Legendary tickets</b>
      can now appear in the shop. 10 Dollars a piece, and the fattest payouts in the game.</p>`);
  }

  // Tiny market-style chart of a mascot's step history: green above the
  // step-50 start line, red below, dashed reference at 50 — like a day chart
  // anchored at the open.
  sparkline(history) {
    const W = 132, H = 24, P = 3;
    const data = (history ?? [START_STEP]).slice(-20);
    const lo = Math.min(...data, START_STEP) - 1;
    const hi = Math.max(...data, START_STEP) + 1;
    // Each move spans at most 20% of the width: the chart fills in from the
    // left over the first 5 moves, then scrunches to fit as more arrive.
    const usable = W - 2 * P;
    const step = data.length > 1 ? usable * Math.min(0.2, 1 / (data.length - 1)) : 0;
    const x = (i) => P + i * step;
    const y = (v) => P + ((hi - v) * (H - 2 * P)) / (hi - lo);
    let segs = '';
    let dots = '';
    for (let i = 1; i < data.length; i++) {
      const up = data[i] >= START_STEP;
      segs += `<line x1="${x(i - 1).toFixed(1)}" y1="${y(data[i - 1]).toFixed(1)}" x2="${x(i).toFixed(1)}" y2="${y(data[i]).toFixed(1)}" stroke="${up ? '#1e8a4c' : '#d63430'}" stroke-width="2" stroke-linecap="round"/>`;
    }
    for (let i = 0; i < data.length; i++) {
      const isLast = i === data.length - 1;
      dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(data[i]).toFixed(1)}" r="${isLast ? 2.6 : 1.9}" fill="${data[i] >= START_STEP ? '#1e8a4c' : '#d63430'}"/>`;
    }
    const ref = y(START_STEP).toFixed(1);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="${ref}" x2="${W}" y2="${ref}" stroke="#8a93a8" stroke-width="1" stroke-dasharray="3 3"/>
      ${segs}${dots}</svg>`;
  }

  renderRollPanel() {
    const g = this.game;
    const target = g.rogue ? this.rogueTarget() : null;
    return `
      <section class="roll-panel">
        <div class="roll-head">
          <div class="round-info">${
            g.rogue
              ? `Round <b>${Math.min(g.round + 1, ROGUE.rounds)}</b> / ${ROGUE.rounds}${
                  target ? ` &middot; 🎯 <b>${target.ep}</b> Gold by round ${target.round}` : ''}${
                  target && ROGUE.bonuses[target.round]
                    ? ` &middot; 💰 +${ROGUE.bonuses[target.round].coins}💵 if ${ROGUE.bonuses[target.round].over}+`
                    : ''}`
              : g.mode === 1
                ? `Round <b>${Math.min(g.round + 1, CONFIG.onePlayerRounds)}</b> / ${CONFIG.onePlayerRounds}`
                : `Round <b>${g.round + 1}</b> &middot; first to ${CONFIG.twoPlayerGoal} Gold`
          }</div>
          <div class="roll-actions">
            <button class="btn btn-tiny" id="skip-btn" hidden>⏭ Skip</button>
            ${g.over
              ? '<button class="btn btn-primary" id="results-btn">🏁 Results</button>'
              : '<button class="btn btn-roll" id="roll-btn">🎲 ROLL</button>'}
          </div>
        </div>
        <div class="dice-row">
          ${this.laneSlots().map((m) => {
            const rolled = m && g.rolledOnce[m.id];
            if (!m) {
              return `
                <div class="die-slot mystery" title="A mystery mascot joins later">
                  <div class="die-top">
                    <span class="mystery-q">?</span>
                    <div class="die-col"><div class="d10"><span class="die-num">?</span></div>
                    <div class="die-result">&mdash;</div></div>
                  </div>
                  <div class="die-chart"></div>
                </div>`;
            }
            const last = g.lastRolls[m.id];
            const alert = g.news.find((a) => a.mascotId === m.id);
            return `
              <div class="die-slot ${alert ? 'alert' : ''}" data-mascot="${m.id}" style="--mc:${m.color}"
                ${alert ? `title="${alert.newsType}! ${m.name} can only move ${alert.direction > 0 ? 'Up' : 'Down'}"` : ''}>
                ${alert ? `
                  <span class="alert-tri"><svg viewBox="0 0 100 100">
                    <path d="M50 6 L97 90 L3 90 Z" fill="#ffd21f" stroke="#1b2440" stroke-width="7" stroke-linejoin="round"/>
                    <text x="50" y="78" text-anchor="middle" font-size="56" font-weight="900" fill="#1b2440">!</text>
                  </svg></span>` : ''}
                <div class="die-top">
                  <span class="die-mascot">${mascotSvg(m.id, 54)}</span>
                  <div class="die-col">
                    <div class="d10"><span class="die-num">${rolled ? (last > 0 ? `+${last}` : last) : '?'}</span></div>
                    <div class="die-result">${alert ? `${alert.direction > 0 ? '⬆ UP' : '⬇ DOWN'} ONLY` : ''}</div>
                  </div>
                </div>
                <div class="die-chart" title="${m.name}'s run so far — now on step ${g.steps[m.id]}">${this.sparkline(g.history[m.id])}</div>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  newsText() {
    const g = this.game;
    if (!g.news.length) return 'Mascot News: all quiet on the Street.';
    return g.news.map((a) => {
      const m = mascotById(a.mascotId);
      const left = CONFIG.newsDurationRolls - a.count + 1;
      const dur = left >= g.roundsLeft() ? 'until the game ends' : `${left} roll${left === 1 ? '' : 's'} left`;
      return `${NEWS_EMOJI[a.newsType]} ${a.newsType}: ${m.name} ${a.direction > 0 ? 'UP' : 'DOWN'} only (${dur})`;
    }).join(' &nbsp;•&nbsp; ');
  }

  // --- Board -----------------------------------------------------------------

  renderBoard() {
    return this.laneSlots().map((m, i) => this.renderLane(m, i)).join('');
  }

  renderLaneHead(mascot) {
    const g = this.game;
    if (!mascot) {
      return `
        <div class="lane-label mystery">
          <span class="mystery-q">?</span>
          <div class="lane-title">
            <b>???</b>
            <div class="lane-sub">🔒 joins later</div>
          </div>
        </div>`;
    }
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
  renderLane(mascot, laneIndex = 0) {
    const g = this.game;
    if (!mascot) {
      return `<div class="lane mystery" data-mystery="${laneIndex}"><div class="mystery-fill">?</div></div>`;
    }
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
                title="${this.playerName(p)}: ${ep} Gold on step ${s}">${ep}</span>`
            : '';
        })
        .join('');
      const shade = this.laneShade(mascot.color, s);
      cells.push(`
        <div class="cell ${here ? 'here' : ''} ${trailCls} ${shade.light ? 'light' : ''}" data-step="${s}"
          ${here ? '' : `style="background:${shade.bg}"`}>
          <span class="step-num">${s}</span>
          ${here ? `<span class="token">${mascotSvg(mascot.id, 42)}</span>` : ''}
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

  // Per-step lane tint: step 0 is the lightest shade of the mascot's color,
  // step 100 the darkest.
  laneShade(hex, step) {
    const m = 0.55 - 0.95 * (step / 100); // >0 mixes toward white, <0 toward black
    const target = m >= 0 ? 255 : 0;
    const k = Math.abs(m);
    const channel = (i) => {
      const c = parseInt(hex.slice(i, i + 2), 16);
      return Math.round(c + (target - c) * k);
    };
    return {
      bg: `rgb(${channel(1)}, ${channel(3)}, ${channel(5)})`,
      light: m > 0.25, // light cells switch to dark step numbers
    };
  }

  // Active news alert for a mascot, as a constraint for the odds math.
  newsConstraint(mascotId) {
    const alert = this.game.news.find((a) => a.mascotId === mascotId);
    return alert
      ? { direction: alert.direction, rolls: CONFIG.newsDurationRolls - alert.count + 1 }
      : null;
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
    const idx = this.laneSlots().findIndex((m) => m && m.id === mascotId);
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
    const isBot = p === 1 && this.botLevel;
    return `
      <div class="player-panel ${isBot ? 'bot-panel' : ''}" data-player="${p}" style="--pc:${PLAYER_COLORS[p]}">
        <div class="player-head">
          <b>${this.playerName(p)}</b>
          ${isBot ? '<span class="hint bot-hint">plays when you Roll</span>' : ''}
          <span class="stat info-click" data-info="coins" title="How the Dollar bank works">💵 <b>${player.coins}</b></span>
          <span class="stat info-click" data-info="ep" title="How Gold works">${GOLD} <b>${player.ep}</b> Gold</span>
          <span class="stat level info-click" data-info="ep" title="How Gold Levels work">Level ${level}</span>
        </div>
        <div class="shop">
          <div class="shop-row">
            <div class="shop-title">Betting Tickets <button class="btn btn-tiny" data-action="refresh" data-player="${p}" ${player.coins < g.refreshCost(p) || g.over ? 'disabled' : ''}>↻ Refresh (${g.refreshCost(p)}💵)</button></div>
            <div class="cards">${player.tickets.map((id, slot) => this.renderTicketCard(p, id, slot)).join('')}</div>
          </div>
          <div class="shop-row">
            <div class="shop-title">Manipulations <span class="hint">(cost Gold)</span> <button class="btn btn-tiny info-click" data-info="spells" title="How Manipulations work">?</button></div>
            <div class="cards">${player.spells.map((id, slot) => this.renderSpellCard(p, id, slot)).join('')}</div>
          </div>
        </div>
      </div>`;
  }

  renderTicketCard(p, id, slot) {
    const g = this.game;
    if (!id) {
      if (g.rogue) {
        const msg = slot < 2
          ? '🔒 Waiting for your first mascot…'
          : `🔒 Unlocks when your ${slot === 2 ? '2nd' : '3rd'} mascot joins the run`;
        return `<div class="card ticket locked-slot"><div class="locked-msg">${msg}</div></div>`;
      }
      return '<div class="card ticket empty-card"></div>';
    }
    const t = ticketById(id);
    const m = mascotById(t.mascotId);
    const sold = g.players[p].ticketSold[slot];
    const canAfford = g.players[p].coins >= t.cost;
    const base = g.steps[t.mascotId];
    const offsets = [t.target1, t.target2].filter((x) => x !== null);
    const spots = offsets
      .map((x) => `<b>${this.upDown(x)}</b> <span class="hint">(step ${Math.max(BOARD_MIN, Math.min(BOARD_MAX, base + x))})</span>`)
      .join('<br>');
    const prob = collectProbability(m, offsets, g.oddsHorizon(), this.newsConstraint(t.mascotId));
    return `
      <div class="card ticket rarity-${t.rarity.toLowerCase().replace(/\s+/g, '-')} ${sold ? 'sold' : ''}" style="--mc:${m.color}">
        <div class="card-head info-click" data-stats="${m.id}" title="See ${m.name}'s die">${mascotSvg(m.id, 26)}<span>${m.name}</span><span class="rarity">${t.rarity}</span></div>
        <div class="card-body">
          <div class="reward">${GOLD} ${t.reward} Gold</div>
          <div class="targets">${spots}</div>
          <div class="difficulty">${oddsLabel(prob)}</div>
        </div>
        ${sold
          ? '<div class="sold-tag">SOLD</div>'
          : `<button class="btn btn-buy" data-action="buy-ticket" data-player="${p}" data-slot="${slot}" ${!canAfford || g.over ? 'disabled' : ''}>Bet 💵${t.cost}</button>`}
      </div>`;
  }

  renderSpellCard(p, id, slot) {
    const g = this.game;
    if (!id) {
      if (g.rogue) {
        return `<div class="card spell locked-slot">
          <div class="locked-msg">🔒 Unlocks when your ${slot === 0 ? '2nd' : '3rd'} mascot joins the run</div>
        </div>`;
      }
      return '<div class="card spell empty-card"></div>';
    }
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
          : `<button class="btn btn-buy" data-action="cast-spell" data-player="${p}" data-slot="${slot}" ${!canAfford || g.over ? 'disabled' : ''}>Execute ${GOLD}${s.cost}</button>`}
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
        this.log(`${this.playerName(p)} bet 💵${t.cost} on ${mascotById(t.mascotId).name}: ${GOLD}${t.reward} Gold on step ${res.placed.map((x) => x.step).join(' & ')}.`);
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
          this.log(`${this.playerName(p)} executed: ${spell.description}.`);
          this.renderGame();
        } else {
          const steps = this.game.spellTargets(p, slot);
          if (steps.length === 0) {
            return this.toast(`No Gold on any Steps for ${mascotById(spell.mascotId).name}`);
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
        const cost = this.game.refreshCost(p);
        const res = this.game.refreshTickets(p);
        if (!res.ok) return this.toast(res.reason);
        this.log(`${this.playerName(p)} refreshed their Bets for 💵${cost}.`);
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
          if (res.collected) detail = ` &mdash; collected ${GOLD}${res.collected} instantly!`;
          else if (res.stolen) detail = ` &mdash; stole ${GOLD}${res.stolen}!`;
          else if (res.movedTo !== undefined) detail = ` &mdash; moved to step ${res.movedTo}.`;
          else if (res.newValue !== undefined) detail = ` &mdash; step ${step} now ${GOLD}${res.newValue}.`;
          this.log(`${this.playerName(player)} executed: ${spell.description}${detail}`);
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
    this.animating = true;

    // Bot turn: act, then show its new bets pulsing on the board (and its
    // coins dropping) for a beat before the dice start.
    if (this.botLevel) {
      const before = this.snapshotBoard(1);
      const coinsBefore = this.game.players[1].coins;
      const epBefore = this.game.players[1].ep;
      const actions = botTakeTurn(this.game, this.botLevel);
      for (const action of actions) this.log(`${this.playerName(1)} ${action}`);
      if (actions.length) {
        this.renderGame();
        $('#roll-btn', this.root)?.setAttribute('disabled', '');
        this.highlightNewChips(1, before);
        this.floatSpend(1, 'coins', coinsBefore - this.game.players[1].coins, '💵');
        this.floatSpend(1, 'ep', epBefore - this.game.players[1].ep, GOLD);
        await sleep(1500);
      }
    }

    const events = this.game.roll();
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
        this.log(`💰 ${this.playerName(c.player)}: ${m.name} collected ${GOLD}${c.amount} Gold from step ${c.step}!`, 'good');
      }
      if (!this.skipRequested) await sleep(400);
    }

    const newsEvents = tail.filter((e) => e.type === 'news');
    const checkpoint = tail.find((e) => e.type === 'checkpoint');
    const bonus = tail.find((e) => e.type === 'bonus');
    for (const e of tail) {
      if (e.type === 'news' || e.type === 'newsEnd') this.log(e.message, 'news');
      if (e.type === 'checkpoint') {
        this.log(e.passed
          ? `✅ Checkpoint round ${e.round}: ${e.ep} / ${e.target} Gold — passed!`
          : `💥 Checkpoint round ${e.round}: ${e.ep} / ${e.target} Gold — run over.`, e.passed ? 'good' : 'news');
      }
      if (e.type === 'bonus') {
        this.log(`💰 Bonus! +${e.coins} Dollars for passing round ${e.round} with ${e.threshold}+ Gold.`, 'good');
      }
    }

    // A cleared (non-final) checkpoint gets its own moment, then the next
    // tranche's goal is announced — before any mascot draft appears.
    if (checkpoint && checkpoint.passed && !checkpoint.final && !this.skipRequested) {
      await this.showCheckpointPopup(checkpoint);
      await this.showTrancheGoal();
    }
    if (bonus && !this.skipRequested) {
      await this.showAcknowledgePopup('bonus-card', `
        <h2>💰 COIN BONUS!</h2>
        <p>You cleared round ${bonus.round} with <b>${bonus.ep} Gold</b> — reaching the ${bonus.threshold} stretch
        target. <b>+${bonus.coins} Dollars</b>, banked before this round's interest!</p>`);
    }

    // Between-round sequence: round banner, then news popups, then coin gain.
    if (!this.game.over && !this.skipRequested) {
      await this.showRoundBanner(this.game.round + 1);
      for (const e of newsEvents) {
        if (!this.skipRequested) await this.showNewsPopup(e);
      }
      if (!this.skipRequested) await Promise.race([this.animateDollarGain(), this.skipPromise]);
    }

    this.animating = false;
    this.renderGame();
  }

  showRoundBanner(n) {
    const banner = document.createElement('div');
    banner.className = 'round-banner';
    banner.innerHTML = `<div class="round-banner-text">ROUND ${n}!</div>`;
    document.body.appendChild(banner);
    const waits = [sleep(1200)];
    if (this.skipPromise) waits.push(this.skipPromise);
    return Promise.race(waits).then(() => banner.remove());
  }

  // A popup card that stays until acknowledged: click anywhere (or the
  // button) to dismiss. A roll-skip request also clears it.
  showAcknowledgePopup(cardClass, innerHtml) {
    const overlay = document.createElement('div');
    overlay.className = 'news-popup';
    overlay.innerHTML = `
      <div class="news-card ${cardClass}">
        ${innerHtml}
        <button class="btn btn-primary popup-ok">Got it!</button>
      </div>`;
    document.body.appendChild(overlay);
    return new Promise((resolve) => {
      let done = false;
      const dismiss = () => {
        if (done) return;
        done = true;
        overlay.remove();
        resolve();
      };
      overlay.addEventListener('click', dismiss); // anywhere on screen, card included
      if (this.skipPromise) this.skipPromise.then(dismiss);
    });
  }

  showNewsPopup(e) {
    const m = mascotById(e.mascotId);
    return this.showAcknowledgePopup('', `
      <span class="news-tri"><svg viewBox="0 0 100 100">
        <path d="M50 6 L97 90 L3 90 Z" fill="#ffd21f" stroke="#1b2440" stroke-width="7" stroke-linejoin="round"/>
        <text x="50" y="78" text-anchor="middle" font-size="56" font-weight="900" fill="#1b2440">!</text>
      </svg></span>
      ${mascotSvg(m.id, 76)}
      <h2>${NEWS_EMOJI[e.newsType]} ${e.newsType.toUpperCase()}!</h2>
      <p>${m.name} can only move <b>${e.direction > 0 ? 'UP' : 'DOWN'}</b> ${
        this.game.alertOutlastsGame() ? 'until the game ends' : `for the next ${CONFIG.newsDurationRolls} rolls`}!</p>`);
  }

  showCheckpointPopup(e) {
    return this.showAcknowledgePopup('checkpoint-card', `
      <h2>✅ CHECKPOINT PASSED!</h2>
      <p>Round ${e.round}: <b>${e.ep}</b> / ${e.target} Gold — the run continues!</p>`);
  }

  // Announce the goal for the tranche of rounds that is about to begin
  // (shown before any mascot draft, so the player picks with the target in mind).
  showTrancheGoal() {
    const g = this.game;
    const target = this.rogueTarget();
    if (!g.rogue || !target) return Promise.resolve();
    const bonus = ROGUE.bonuses[target.round];
    const final = target.round === ROGUE.rounds;
    const ep = g.players[0].ep;
    // A hot run can already be past the tranche's checkpoint — celebrate it
    // and point at what actually matters next instead of a stale demand.
    if (ep >= target.ep) {
      const later = Object.keys(ROGUE.targets).map(Number).filter((r) => r > target.round);
      const nextRound = later.length ? Math.min(...later) : null;
      return this.showAcknowledgePopup('tranche-card', `
        <h2>🎯 ${final ? 'FINAL STRETCH!' : `ROUNDS ${g.round + 1}–${target.round}`}</h2>
        <p>You're sitting on <b>${ep} Gold</b> — the ${final ? 'victory target' : `round-${target.round} checkpoint`}
        of ${target.ep} is already banked! 🔥</p>
        ${nextRound
          ? `<p>Eyes ahead: <b>${ROGUE.targets[nextRound]} Gold</b> by round ${nextRound}.</p>`
          : '<p>Play out the run and take the win! 🏆</p>'}`);
    }
    return this.showAcknowledgePopup('tranche-card', `
      <h2>🎯 ${final ? 'FINAL STRETCH!' : `ROUNDS ${g.round + 1}–${target.round}`}</h2>
      <p>${final ? 'Win the run with' : 'Reach'} <b>${target.ep} Gold</b> by the end of
      round ${target.round}${final ? '' : ' — or the run ends'}.</p>
      ${bonus ? `<p>💵 Stretch bonus: finish round ${target.round} with <b>${bonus.over}+ Gold</b>
        and earn <b>+${bonus.coins} Dollars</b> (paid before interest)!</p>` : ''}`);
  }

  // Dollars fly from the Roll button to each player's coin bank, then the
  // number ticks up.
  animateDollarGain() {
    const g = this.game;
    const rollRect = $('#roll-btn', this.root)?.getBoundingClientRect()
      ?? { left: window.innerWidth / 2, top: 120, width: 0, height: 0 };
    const sx = rollRect.left + rollRect.width / 2;
    const sy = rollRect.top + rollRect.height / 2;
    return Promise.all(g.players.map(async (player, p) => {
      const gain = g.lastCoinGain?.[p] ?? 0;
      const coinEl = this.root.querySelector(`.player-panel[data-player="${p}"] [data-info="coins"] b`);
      if (!gain || !coinEl) return;
      const t = coinEl.getBoundingClientRect();
      const float = document.createElement('div');
      float.className = 'float-text coin-float';
      float.textContent = `+${gain} 💵`;
      float.style.left = `${t.left}px`;
      float.style.top = `${t.top - 10}px`;
      document.body.appendChild(float);
      setTimeout(() => float.remove(), 1200);
      await Promise.all([0, 1, 2].map((i) => sleep(i * 150).then(() => new Promise((resolve) => {
        const coin = document.createElement('div');
        coin.className = 'fly-star fly-coin';
        coin.textContent = '💵';
        coin.style.left = `${sx}px`;
        coin.style.top = `${sy}px`;
        document.body.appendChild(coin);
        const dx = t.left + t.width / 2 - sx;
        const dy = t.top + t.height / 2 - sy;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          coin.style.transform = `translate(${dx}px, ${dy}px) scale(0.7)`;
        }));
        setTimeout(() => { coin.remove(); resolve(); }, 700);
      }))));
      coinEl.textContent = Number(coinEl.textContent) + gain;
      const stat = coinEl.closest('.stat');
      stat?.classList.add('ep-bump');
      setTimeout(() => stat?.classList.remove('ep-bump'), 450);
    }));
  }

  // Floating "+N Gold" at the collected step, and a star that flies to the
  // player's Gold bank — the number ticks up when it lands.
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
    float.textContent = `+${c.amount} Gold`;
    float.style.left = `${x}px`;
    float.style.top = `${y - 12}px`;
    document.body.appendChild(float);
    setTimeout(() => float.remove(), 1200);

    const epEl = this.root.querySelector(`.player-panel[data-player="${c.player}"] [data-info="ep"] b`);
    if (!epEl) return Promise.resolve();
    const target = epEl.getBoundingClientRect();
    const star = document.createElement('div');
    star.className = 'fly-star';
    star.innerHTML = GOLD;
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

  // Snapshot of one player's board chips: mascotId -> {step: ep}.
  snapshotBoard(p) {
    const snap = {};
    for (const m of MASCOTS) snap[m.id] = { ...this.game.players[p].board[m.id] };
    return snap;
  }

  // Pulse every chip that appeared or grew since the snapshot. Returns how
  // many were highlighted.
  highlightNewChips(p, before) {
    let count = 0;
    for (const m of MASCOTS) {
      const now = this.game.players[p].board[m.id];
      for (const [step, ep] of Object.entries(now)) {
        if (ep > (before[m.id][step] || 0)) {
          const chip = this.root.querySelector(
            `.chip[data-player="${p}"][data-mascot="${m.id}"][data-step="${step}"]`);
          if (chip) {
            chip.classList.add('bot-new');
            count += 1;
          }
        }
      }
    }
    return count;
  }

  // Float a "-N" over a player's coin/Gold stat when they spend.
  floatSpend(p, stat, amount, icon) {
    if (amount <= 0) return;
    const el = this.root.querySelector(`.player-panel[data-player="${p}"] [data-info="${stat === 'coins' ? 'coins' : 'ep'}"] b`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const float = document.createElement('div');
    float.className = 'float-text spend-float';
    float.innerHTML = `-${amount} ${icon}`;
    float.style.left = `${rect.left}px`;
    float.style.top = `${rect.top - 8}px`;
    document.body.appendChild(float);
    setTimeout(() => float.remove(), 1200);
    const statEl = el.closest('.stat');
    statEl?.classList.add('ep-bump');
    setTimeout(() => statEl?.classList.remove('ep-bump'), 450);
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
      // The chart ticks the moment the die lands, so it reads like a live feed.
      const chart = slot.querySelector('.die-chart');
      if (chart) chart.innerHTML = this.sparkline(this.game.history[e.mascotId]);
    };
    if (this.skipRequested) return setFinal();
    // Under an alert (or a cast spell), only spin through the possible faces.
    let faces = mascotById(e.mascotId).rolls;
    if (e.flag === FLAG.UP) faces = faces.filter((r) => r > 0);
    else if (e.flag === FLAG.DOWN) faces = faces.filter((r) => r < 0);
    else if (e.flag === FLAG.FREEZE) return setFinal(); // frozen: nothing to spin
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
    let headline, detail, leaderboard = '';
    if (g.rogue) {
      const ep = g.players[0].ep;
      if (g.winner) {
        headline = '👑 Run complete — you win!';
        detail = `You cleared every checkpoint and finished all ${ROGUE.rounds} rounds with <b>${ep} Gold</b> (target: ${ROGUE.targets[ROGUE.rounds]}).`;
        leaderboard = `
          ${this.scoreSaved ? '' : `
            <div class="lb-save">
              <input id="lb-name" maxlength="16" placeholder="Your name">
              <button class="btn btn-primary" id="lb-save-btn">Save run</button>
            </div>`}
          <h3>🗺️ Roguelike Leaderboard</h3>
          ${this.leaderboardHtml(this.lastScoreIndex, true)}`;
      } else {
        const f = g.failedCheckpoint;
        headline = '💥 Run over!';
        detail = `You needed <b>${f.target} Gold</b> by round ${f.round} — you finished it with <b>${ep}</b>. Better luck next run!`;
      }
    } else if (g.mode === 1) {
      const ep = g.players[0].ep;
      headline = g.winner ? '🎉 A leaderboard score!' : 'Good game!';
      detail = g.winner
        ? `You scored <b>${ep} Gold</b> — over ${CONFIG.onePlayerGoal}!`
        : `You scored <b>${ep} Gold</b>. Get ${CONFIG.onePlayerGoal} to prove you're a Market Party master!`;
      leaderboard = `
        ${this.scoreSaved ? '' : `
          <div class="lb-save">
            <input id="lb-name" maxlength="16" placeholder="Your name">
            <button class="btn btn-primary" id="lb-save-btn">Save score</button>
          </div>`}
        <h3>🏆 Leaderboard</h3>
        ${this.leaderboardHtml(this.lastScoreIndex)}`;
    } else {
      const [a, b] = g.players.map((x) => x.ep);
      headline = g.winner === 'tie' ? "🤝 It's a tie!" : `🏆 ${this.playerName(g.winner)} wins!`;
      detail = `Final score: <b>${a}</b> to <b>${b}</b>.`;
    }
    return `
      <div class="overlay">
        <div class="overlay-card">
          <div class="start-mascots">${MASCOTS.map((m) => mascotSvg(m.id, 56)).join('')}</div>
          <h2>${headline}</h2>
          <p>${detail}</p>
          ${leaderboard}
          <div class="over-actions">
            <button class="btn" id="close-results">Close &mdash; see the board</button>
            <button class="btn btn-primary" id="play-again">Play again</button>
          </div>
        </div>
      </div>`;
  }

  // --- Leaderboard (local, per browser) ----------------------------------------

  loadLeaderboard(rogue = false) {
    try {
      return JSON.parse(localStorage.getItem(rogue ? 'mp-leaderboard-rogue' : 'mp-leaderboard') || '[]');
    } catch {
      return [];
    }
  }

  saveScore(name, ep, rogue = false) {
    const entry = { name, ep, date: new Date().toISOString().slice(0, 10) };
    const list = this.loadLeaderboard(rogue);
    list.push(entry);
    list.sort((a, b) => b.ep - a.ep);
    const top = list.slice(0, 10);
    try {
      localStorage.setItem(rogue ? 'mp-leaderboard-rogue' : 'mp-leaderboard', JSON.stringify(top));
    } catch { /* private mode etc. — the table just won't persist */ }
    return top.indexOf(entry); // -1 if the score didn't crack the top 10
  }

  leaderboardHtml(highlight = null, rogue = false) {
    const list = this.loadLeaderboard(rogue);
    if (!list.length) {
      return rogue
        ? '<p class="hint">No winning runs yet — survive all 15 rounds of a roguelike!</p>'
        : '<p class="hint">No scores yet — finish a 1 player game!</p>';
    }
    return `
      <table class="stats-table lb-table">
        <tr><th>#</th><th>Name</th><th>Gold</th><th>Date</th></tr>
        ${list.map((e, i) => `
          <tr class="${highlight === i ? 'lb-highlight' : ''}">
            <td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td>${GOLD}${e.ep}</td><td>${e.date}</td>
          </tr>`).join('')}
      </table>`;
  }

  // --- Tutorial (ported from the prototype's speech-bubble sequence) ----------

  showTutorial() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    let step = 0;
    const render = () => {
      const s = TUTORIAL_STEPS[step];
      const last = step === TUTORIAL_STEPS.length - 1;
      overlay.innerHTML = `
        <div class="overlay-card tut-card">
          <div class="tut-host">${mascotSvg(2, 56)}<div><h2>${s.title}</h2>
            <span class="hint">Tutorial &middot; step ${step + 1} of ${TUTORIAL_STEPS.length}</span></div></div>
          <p class="tut-body">${s.html}</p>
          <div class="tut-nav">
            <button class="btn" id="tut-prev" ${step === 0 ? 'disabled' : ''}>← Back</button>
            <button class="btn btn-tiny" id="tut-close">Close</button>
            <button class="btn btn-primary" id="tut-next">${last ? 'Done ✔' : 'Next →'}</button>
          </div>
        </div>`;
      $('#tut-prev', overlay).addEventListener('click', () => { step -= 1; render(); });
      $('#tut-close', overlay).addEventListener('click', () => overlay.remove());
      $('#tut-next', overlay).addEventListener('click', () => {
        if (last) overlay.remove();
        else { step += 1; render(); }
      });
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    render();
    this.root.appendChild(overlay);
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
        <h2>💵 The Dollar Bank</h2>
        <ul class="info-list">
          <li>Dollars buy <b>Betting Tickets</b>.</li>
          <li>You start with <b>${CONFIG.startingCoins}</b> and get <b>+${CONFIG.coinsPerRound}</b> after every roll.</li>
          <li><b>Interest:</b> each round you also earn 1 extra Dollar per ${CONFIG.interestDivisor} you're holding
            (max +${CONFIG.maxInterest}) — saving up pays off.</li>
          <li>Refreshing your ticket offers costs <b>${CONFIG.refreshCostFirst} Dollar</b> the first time each round,
            then <b>${CONFIG.refreshCostNext} Dollars</b> after that; offers refresh free after every roll.</li>
        </ul>`);
    } else if (topic === 'ep') {
      const rows = EP_LEVELS
        .map((l) => `<tr><td>Level ${l.level}</td><td>${l.minEP}+ Gold</td></tr>`)
        .join('');
      this.modal(`
        <h2>${GOLD} Gold &amp; Levels</h2>
        <ul class="info-list">
          <li>Gold bars are your <b>score</b> — and the currency for <b>Manipulations</b>.</li>
          <li>Earn Gold when a mascot lands on or passes one of your bounties.</li>
          <li>Your banked Gold sets your <b>Level</b>, and higher levels unlock rarer,
            bigger tickets and manipulations in the shop:</li>
        </ul>
        <table class="stats-table"><tr><th>Level</th><th>Gold in bank</th></tr>${rows}</table>
        <p class="hint">Careful: spending Gold on manipulations can drop your Level (and your score).
        ${this.game?.rogue
          ? `Checkpoints: ${Object.entries(ROGUE.targets).map(([r, ep]) => `${ep} by round ${r}`).join(', ')} — the last one wins the run.
            Stretch bonuses: ${Object.entries(ROGUE.bonuses).map(([r, b]) => `+${b.coins} Dollars for ${b.over}+ Gold at round ${r}`).join(', ')} (paid before interest).`
          : this.game?.mode === 1
            ? `Score ${CONFIG.onePlayerGoal}+ in ${CONFIG.onePlayerRounds} rounds to make the leaderboard.`
            : `First player to ${CONFIG.twoPlayerGoal} Gold wins.`}</p>`);
    } else if (topic === 'spells') {
      this.modal(`
        <h2>✨ Manipulations</h2>
        <ul class="info-list">
          <li>You're offered 2 manipulations per round; executing one costs <b>Gold</b>, not Dollars.</li>
          <li><b>Double</b> (10 Gold) — double one of your bounties, up to +50.</li>
          <li><b>Move closer</b> (15 Gold) — slide a bounty toward its mascot
            (Mousey/Wolf 2 steps, Flixy 4, Bizarro 6). If it reaches the mascot, collect instantly!</li>
          <li><b>Halve</b> (20 Gold) — halve an opponent's bounty, up to −50.</li>
          <li><b>Steal</b> (40 Gold) — take up to 50 Gold off an opponent's bounty onto yours.</li>
          <li><b>Up only / Down only</b> (5–25 Gold) / <b>Freeze</b> (25 Gold) — control a mascot's next roll.
            These affect the mascot itself, so <i>both</i> players feel it. Freeze (like Halve
            and Steal) only appears in 2 player games.</li>
        </ul>`);
    } else if (topic === 'news') {
      // Only mascots in the current game can make news.
      const fielded = this.game.activeList();
      const totalPct = NEWS_TABLE
        .filter((r) => this.game.isActive(r.mascotId))
        .reduce((s, r) => s + r.weight, 0);
      const rows = fielded.map((m) => {
        const up = NEWS_TABLE.find((r) => r.mascotId === m.id && r.direction === 1).weight;
        const down = NEWS_TABLE.find((r) => r.mascotId === m.id && r.direction === -1).weight;
        return `<tr><td>${m.name}</td><td>${up}%</td><td>${down}%</td></tr>`;
      }).join('');
      this.modal(`
        <h2>📣 Mascot News Alerts</h2>
        <ul class="info-list">
          <li>Every round — including before Round 1 — there's a <b>${totalPct}%</b> chance an alert hits.</li>
          <li>${NEWS_EMOJI['Oil Strike']} <b>Oil Strike</b> — the mascot can only move <b>Up</b> for ${CONFIG.newsDurationRolls} rolls.</li>
          <li>${NEWS_EMOJI.Earthquake} <b>Earthquake</b> — the mascot can only move <b>Down</b> for ${CONFIG.newsDurationRolls} rolls.</li>
          <li>Up to <b>3 alerts</b> can run at once — but each mascot can only have one.</li>
        </ul>
        <table class="stats-table"><tr><th>Mascot</th><th>${NEWS_EMOJI['Oil Strike']} Oil Strike</th><th>${NEWS_EMOJI.Earthquake} Earthquake</th></tr>${rows}</table>`);
    }
  }

  showAllBets() {
    const horizon = this.game.oddsHorizon();
    const sections = this.game.activeList().map((m) => {
      const rows = TICKETS.filter((t) => t.mascotId === m.id)
        .sort((a, b) => a.cost - b.cost)
        .map((t) => {
          const offsets = [t.target1, t.target2].filter((x) => x !== null);
          const targets = offsets.map((x) => this.upDown(x)).join(' & ');
          const prob = collectProbability(m, offsets, horizon, this.newsConstraint(m.id));
          return `<tr><td>${t.rarity}</td><td>💵${t.cost}</td><td>${GOLD}${t.reward}</td><td>${targets}</td><td>${oddsLabel(prob)} &middot; ${Math.round(prob * 100)}%</td></tr>`;
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

  // The prototype's "Drop Rates and more info" box.
  showStatsGeek() {
    const tiers = Object.keys(TICKET_TIER_WEIGHTS).map(Number);
    const levelIdx = [0, 1, 2, 3, 4];
    const ticketSums = levelIdx.map((i) => tiers.reduce((s, t) => s + TICKET_TIER_WEIGHTS[t][i], 0));
    const ticketRows = tiers.map((t) => `
      <tr><td>💵${t}</td>${levelIdx.map((i) =>
        `<td>${Math.round((TICKET_TIER_WEIGHTS[t][i] / ticketSums[i]) * 100)}%</td>`).join('')}</tr>`).join('');
    const payoutRows = tiers.map((t) => `<tr><td>💵${t}</td><td>${PAYOUT_RATIOS[t].toFixed(2)}x</td></tr>`).join('');

    const spellNames = {
      51: 'Double', 52: 'Halve <span class="hint">(2P only)</span>', 53: 'Move Gold',
      54: 'Steal <span class="hint">(2P only)</span>', 55: 'Mascot Up', 56: 'Mascot Down',
      57: 'Mascot Freeze <span class="hint">(2P only)</span>',
    };
    const spellTypes = Object.keys(SPELL_TYPE_WEIGHTS).map(Number);
    const spellSums = levelIdx.map((i) => spellTypes.reduce((s, t) => s + SPELL_TYPE_WEIGHTS[t][i], 0));
    const spellRows = spellTypes.map((t) => `
      <tr><td style="text-align:left">${spellNames[t]}</td>${levelIdx.map((i) =>
        `<td>${Math.round((SPELL_TYPE_WEIGHTS[t][i] / spellSums[i]) * 100)}%</td>`).join('')}</tr>`).join('');

    const overlay = this.modal(`
      <h2>🤓 Drop Rates and more info</h2>
      <h3 class="geek-h3">Betting Tickets</h3>
      <p class="hint">Tickets cost 1, 2, 3, 4, 5, or 10 Dollars. As your Gold Level goes up, you're
        more likely to see higher-cost tickets in the shop:</p>
      <table class="stats-table full">
        <tr><th>Cost</th><th>Lvl 1</th><th>Lvl 2</th><th>Lvl 3</th><th>Lvl 4</th><th>Lvl 5</th></tr>
        ${ticketRows}
      </table>
      <p class="hint">As the cost goes up, the payout multiplier goes up — the more Gold you win
        per Dollar. Buying higher-cost tickets is generally better:</p>
      <table class="stats-table"><tr><th>Cost</th><th>Payout ratio</th></tr>${payoutRows}</table>
      <p style="text-align:center"><button class="btn btn-primary" id="geek-all-bets">Show All Possible Bets</button></p>
      <h3 class="geek-h3">Manipulations</h3>
      <p class="hint">Two manipulation offers per round, paid in Gold. Drop rates by Gold Level:</p>
      <table class="stats-table full">
        <tr><th>Manipulation</th><th>Lvl 1</th><th>Lvl 2</th><th>Lvl 3</th><th>Lvl 4</th><th>Lvl 5</th></tr>
        ${spellRows}
      </table>
      <p class="hint"><b>Gold Levels</b> — click your ${GOLD} Gold to see how Levels work.<br>
        <b>Gaining Dollars</b> — click your 💵 Dollars to see how the bank works.</p>`, { wide: true });
    $('#geek-all-bets', overlay)?.addEventListener('click', () => {
      overlay.remove();
      this.showAllBets();
    });
  }

  // --- Stats popup, log, toast ------------------------------------------------

  showStats(mascotId) {
    const m = mascotById(mascotId);
    const alert = this.game?.news.find((a) => a.mascotId === mascotId) ?? null;
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
      ${alert ? `<p class="hint alert-note">${NEWS_EMOJI[alert.newsType]} ${alert.newsType}: ${m.name} can only move <b>${alert.direction > 0 ? 'Up' : 'Down'}</b> right now — greyed sides can't be rolled.</p>` : ''}
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
    return overlay;
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
