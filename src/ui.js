// Market Party — DOM UI. Renders the engine state and wires player actions.

import { Game, FLAG } from './engine.js';
import {
  MASCOTS, CONFIG, ROGUE, BOARD_MIN, BOARD_MAX,
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
            <button class="btn btn-primary" id="vs-bot-btn">🤖 Play vs Bot &mdash; first to ${CONFIG.twoPlayerGoal} EP</button>
            <button class="btn btn-primary" id="rogue-btn">🗺️ Roguelike &mdash; survive the checkpoints</button>
            <button class="btn" id="tutorial-btn">📖 Tutorial</button>
            <button class="btn" id="leaderboard-btn">🏆 Leaderboard</button>
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
    $('#tutorial-btn', this.root)?.addEventListener('click', () => this.showTutorial());
    $('#vs-bot-btn', this.root)?.addEventListener('click', () => this.showBotPicker());
    $('#rogue-btn', this.root)?.addEventListener('click', () => this.newGame('rogue'));
    $('#leaderboard-btn', this.root)?.addEventListener('click', () => {
      this.modal(`<h2>🏆 Leaderboard</h2>${this.leaderboardHtml()}`);
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

  // Mascots shown on the board: the whole roster in roguelike (locked until
  // drafted), just the fielded four in classic modes.
  laneMascots() {
    return this.game.rogue ? MASCOTS : this.game.activeList();
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
        ? `Roguelike run started! Hit every checkpoint or the run ends. Win with ${ROGUE.targets[ROGUE.rounds]} EP after round ${ROGUE.rounds}.`
        : `New ${mode}-player game. Make some Bets, then Roll!`);
    this.renderGame();
    (async () => {
      await this.showRoundBanner(1);
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
          <div class="board-heads">${this.laneMascots().map((m) => this.renderLaneHead(m)).join('')}</div>
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
            ? '✨ Spells unlocked! Cast one per round for EP.'
            : '✨ Second Spell slot unlocked!', 'news');
          await this.showSpellUnlockPopup(slotsAfter);
        }
      });
    });
    $('#tutorial-btn', this.root)?.addEventListener('click', () => this.showTutorial());
    $('#restart-btn', this.root).addEventListener('click', () => this.renderStart());
    $('#lb-save-btn', this.root)?.addEventListener('click', () => {
      const name = $('#lb-name', this.root)?.value.trim() || 'Anonymous';
      this.lastScoreIndex = this.saveScore(name.slice(0, 16), this.game.players[0].ep);
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
            ? 'SPELLS, a 3rd ticket slot & Epic tickets'
            : 'a 2nd Spell slot, a 4th ticket slot & Legendary tickets'}!</p>` : ''}
          <div class="choice-cards">${cards}</div>
        </div>
      </div>`;
  }

  showSpellUnlockPopup(slotCount) {
    const overlay = document.createElement('div');
    overlay.className = 'news-popup';
    overlay.innerHTML = slotCount === 1
      ? `<div class="news-card unlock-card">
          <h2>✨ SPELLS UNLOCKED!</h2>
          <p>With two mascots on the board you can now cast <b>one Spell per round</b>.
          Spells cost <b>EP</b> instead of Coins — double a bounty on the board, or drag one
          closer to its mascot.</p>
          <p>The shop grows too: a <b>3rd ticket slot</b> opens and <b>Epic tickets</b> can
          now drop!</p>
        </div>`
      : `<div class="news-card unlock-card">
          <h2>✨ SECOND SPELL SLOT!</h2>
          <p>Your growing roster earns you <b>two Spell offers every round</b> from here on —
          plus a <b>4th ticket slot</b> and 👑 <b>Legendary tickets</b> in the shop!</p>
        </div>`;
    document.body.appendChild(overlay);
    const dismissed = new Promise((resolve) => overlay.addEventListener('click', resolve));
    return Promise.race([sleep(3200), dismissed]).then(() => overlay.remove());
  }

  renderRollPanel() {
    const g = this.game;
    const rolled = g.round > 0;
    const target = g.rogue ? this.rogueTarget() : null;
    return `
      <section class="roll-panel">
        <div class="roll-head">
          <div class="round-info">${
            g.rogue
              ? `Round <b>${Math.min(g.round + 1, ROGUE.rounds)}</b> / ${ROGUE.rounds}${
                  target ? ` &middot; 🎯 <b>${target.ep}</b> EP by round ${target.round}` : ''}`
              : g.mode === 1
                ? `Round <b>${Math.min(g.round + 1, CONFIG.onePlayerRounds)}</b> / ${CONFIG.onePlayerRounds}`
                : `Round <b>${g.round + 1}</b> &middot; first to ${CONFIG.twoPlayerGoal} EP`
          }</div>
          <div class="roll-actions">
            <button class="btn btn-tiny" id="skip-btn" hidden>⏭ Skip</button>
            ${g.over
              ? '<button class="btn btn-primary" id="results-btn">🏁 Results</button>'
              : '<button class="btn btn-roll" id="roll-btn">🎲 ROLL</button>'}
          </div>
        </div>
        <div class="dice-row">
          ${this.laneMascots().map((m) => {
            const last = g.lastRolls[m.id];
            const alert = g.news.find((a) => a.mascotId === m.id);
            if (!g.isActive(m.id)) {
              return `
                <div class="die-slot locked" data-mascot="${m.id}" style="--mc:${m.color}" title="${m.name} hasn't joined the run yet">
                  <span class="die-mascot">${mascotSvg(m.id, 54)}</span>
                  <div class="die-col"><div class="d10"><span class="die-num">🔒</span></div>
                  <div class="die-result">&mdash;</div></div>
                </div>`;
            }
            return `
              <div class="die-slot ${alert ? 'alert' : ''}" data-mascot="${m.id}" style="--mc:${m.color}"
                ${alert ? `title="${alert.newsType}! ${m.name} can only move ${alert.direction > 0 ? 'Up' : 'Down'}"` : ''}>
                ${alert ? `
                  <span class="alert-tri"><svg viewBox="0 0 100 100">
                    <path d="M50 6 L97 90 L3 90 Z" fill="#ffd21f" stroke="#1b2440" stroke-width="7" stroke-linejoin="round"/>
                    <text x="50" y="78" text-anchor="middle" font-size="56" font-weight="900" fill="#1b2440">!</text>
                  </svg></span>` : ''}
                <span class="die-mascot">${mascotSvg(m.id, 54)}</span>
                <div class="die-col">
                  <div class="d10"><span class="die-num">${rolled ? (last > 0 ? `+${last}` : last) : '?'}</span></div>
                  <div class="die-result">${alert ? `${alert.direction > 0 ? '⬆ UP' : '⬇ DOWN'} ONLY` : rolled ? this.upDown(last) : '&mdash;'}</div>
                </div>
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
    return this.laneMascots().map((m) => this.renderLane(m)).join('');
  }

  renderLaneHead(mascot) {
    const g = this.game;
    if (!g.isActive(mascot.id)) {
      return `
        <div class="lane-label locked" style="--mc:${mascot.color}">
          ${mascotSvg(mascot.id, 40)}
          <div class="lane-title">
            <b>${mascot.name}</b><span class="class-tag">${mascot.className}</span>
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
  renderLane(mascot) {
    const g = this.game;
    const locked = !g.isActive(mascot.id);
    const step = locked ? null : g.steps[mascot.id];
    const from = g.lastFrom[mascot.id];
    const roll = locked ? 0 : g.lastRolls[mascot.id];
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
                title="${this.playerName(p)}: ${ep} EP on step ${s}">${ep}</span>`
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
      <div class="lane ${locked ? 'locked' : ''}" data-mascot="${mascot.id}" style="--mc:${mascot.color}">
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
    const idx = this.laneMascots().findIndex((m) => m.id === mascotId);
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
          <span class="stat info-click" data-info="coins" title="How the Coin bank works">🪙 <b>${player.coins}</b></span>
          <span class="stat info-click" data-info="ep" title="How EP works">⭐ <b>${player.ep}</b> EP</span>
          <span class="stat level info-click" data-info="ep" title="How EP Levels work">Level ${level}</span>
        </div>
        <div class="shop">
          <div class="shop-row">
            <div class="shop-title">Betting Tickets <button class="btn btn-tiny" data-action="refresh" data-player="${p}" ${player.coins < g.refreshCost(p) || g.over ? 'disabled' : ''}>↻ Refresh (${g.refreshCost(p)}🪙)</button></div>
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
      <div class="card ticket rarity-${t.rarity.toLowerCase()} ${sold ? 'sold' : ''}" style="--mc:${m.color}">
        <div class="card-head info-click" data-stats="${m.id}" title="See ${m.name}'s die">${mascotSvg(m.id, 26)}<span>${m.name}</span><span class="rarity">${t.rarity}</span></div>
        <div class="card-body">
          <div class="reward">⭐ ${t.reward} EP</div>
          <div class="targets">${spots}</div>
          <div class="difficulty">${oddsLabel(prob)}</div>
        </div>
        ${sold
          ? '<div class="sold-tag">SOLD</div>'
          : `<button class="btn btn-buy" data-action="buy-ticket" data-player="${p}" data-slot="${slot}" ${!canAfford || g.over ? 'disabled' : ''}>Bet 🪙${t.cost}</button>`}
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
        this.log(`${this.playerName(p)} bet 🪙${t.cost} on ${mascotById(t.mascotId).name}: ⭐${t.reward} EP on step ${res.placed.map((x) => x.step).join(' & ')}.`);
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
          this.log(`${this.playerName(p)} cast: ${spell.description}.`);
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
        const cost = this.game.refreshCost(p);
        const res = this.game.refreshTickets(p);
        if (!res.ok) return this.toast(res.reason);
        this.log(`${this.playerName(p)} refreshed their Bets for 🪙${cost}.`);
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
          this.log(`${this.playerName(player)} cast: ${spell.description}${detail}`);
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
        this.floatSpend(1, 'coins', coinsBefore - this.game.players[1].coins, '🪙');
        this.floatSpend(1, 'ep', epBefore - this.game.players[1].ep, '⭐');
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
        this.log(`💰 ${this.playerName(c.player)}: ${m.name} collected ⭐${c.amount} EP from step ${c.step}!`, 'good');
      }
      if (!this.skipRequested) await sleep(400);
    }

    const newsEvents = tail.filter((e) => e.type === 'news');
    const checkpoint = tail.find((e) => e.type === 'checkpoint');
    for (const e of tail) {
      if (e.type === 'news' || e.type === 'newsEnd') this.log(e.message, 'news');
      if (e.type === 'checkpoint') {
        this.log(e.passed
          ? `✅ Checkpoint round ${e.round}: ${e.ep} / ${e.target} EP — passed!`
          : `💥 Checkpoint round ${e.round}: ${e.ep} / ${e.target} EP — run over.`, e.passed ? 'good' : 'news');
      }
    }

    // A cleared (non-final) checkpoint gets its own moment before the next round.
    if (checkpoint && checkpoint.passed && !checkpoint.final && !this.skipRequested) {
      await this.showCheckpointPopup(checkpoint);
    }

    // Between-round sequence: round banner, then news popups, then coin gain.
    if (!this.game.over && !this.skipRequested) {
      await this.showRoundBanner(this.game.round + 1);
      for (const e of newsEvents) {
        if (!this.skipRequested) await this.showNewsPopup(e);
      }
      if (!this.skipRequested) await Promise.race([this.animateCoinGain(), this.skipPromise]);
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

  showNewsPopup(e) {
    const m = mascotById(e.mascotId);
    const overlay = document.createElement('div');
    overlay.className = 'news-popup';
    overlay.innerHTML = `
      <div class="news-card">
        <span class="news-tri"><svg viewBox="0 0 100 100">
          <path d="M50 6 L97 90 L3 90 Z" fill="#ffd21f" stroke="#1b2440" stroke-width="7" stroke-linejoin="round"/>
          <text x="50" y="78" text-anchor="middle" font-size="56" font-weight="900" fill="#1b2440">!</text>
        </svg></span>
        ${mascotSvg(m.id, 76)}
        <h2>${NEWS_EMOJI[e.newsType]} ${e.newsType.toUpperCase()}!</h2>
        <p>${m.name} can only move <b>${e.direction > 0 ? 'UP' : 'DOWN'}</b> ${
          this.game.alertOutlastsGame() ? 'until the game ends' : `for the next ${CONFIG.newsDurationRolls} rolls`}!</p>
      </div>`;
    document.body.appendChild(overlay);
    const dismissed = new Promise((resolve) => overlay.addEventListener('click', resolve));
    const waits = [sleep(2400), dismissed];
    if (this.skipPromise) waits.push(this.skipPromise);
    return Promise.race(waits).then(() => overlay.remove());
  }

  showCheckpointPopup(e) {
    const overlay = document.createElement('div');
    overlay.className = 'news-popup';
    overlay.innerHTML = `
      <div class="news-card checkpoint-card">
        <h2>✅ CHECKPOINT PASSED!</h2>
        <p>Round ${e.round}: <b>${e.ep}</b> / ${e.target} EP — the run continues!</p>
      </div>`;
    document.body.appendChild(overlay);
    const dismissed = new Promise((resolve) => overlay.addEventListener('click', resolve));
    const waits = [sleep(2000), dismissed];
    if (this.skipPromise) waits.push(this.skipPromise);
    return Promise.race(waits).then(() => overlay.remove());
  }

  // Coins fly from the Roll button to each player's coin bank, then the
  // number ticks up.
  animateCoinGain() {
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
      float.textContent = `+${gain} 🪙`;
      float.style.left = `${t.left}px`;
      float.style.top = `${t.top - 10}px`;
      document.body.appendChild(float);
      setTimeout(() => float.remove(), 1200);
      await Promise.all([0, 1, 2].map((i) => sleep(i * 150).then(() => new Promise((resolve) => {
        const coin = document.createElement('div');
        coin.className = 'fly-star fly-coin';
        coin.textContent = '🪙';
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

  // Float a "-N" over a player's coin/EP stat when they spend.
  floatSpend(p, stat, amount, icon) {
    if (amount <= 0) return;
    const el = this.root.querySelector(`.player-panel[data-player="${p}"] [data-info="${stat === 'coins' ? 'coins' : 'ep'}"] b`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const float = document.createElement('div');
    float.className = 'float-text spend-float';
    float.textContent = `-${amount} ${icon}`;
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
        detail = `You cleared every checkpoint and finished all ${ROGUE.rounds} rounds with <b>${ep} EP</b> (target: ${ROGUE.targets[ROGUE.rounds]}).`;
      } else {
        const f = g.failedCheckpoint;
        headline = '💥 Run over!';
        detail = `You needed <b>${f.target} EP</b> by round ${f.round} — you finished it with <b>${ep}</b>. Better luck next run!`;
      }
    } else if (g.mode === 1) {
      const ep = g.players[0].ep;
      headline = g.winner ? '🎉 A leaderboard score!' : 'Good game!';
      detail = g.winner
        ? `You scored <b>${ep} EP</b> — over ${CONFIG.onePlayerGoal}!`
        : `You scored <b>${ep} EP</b>. Get ${CONFIG.onePlayerGoal} to prove you're a Market Party master!`;
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

  loadLeaderboard() {
    try {
      return JSON.parse(localStorage.getItem('mp-leaderboard') || '[]');
    } catch {
      return [];
    }
  }

  saveScore(name, ep) {
    const entry = { name, ep, date: new Date().toISOString().slice(0, 10) };
    const list = this.loadLeaderboard();
    list.push(entry);
    list.sort((a, b) => b.ep - a.ep);
    const top = list.slice(0, 10);
    try {
      localStorage.setItem('mp-leaderboard', JSON.stringify(top));
    } catch { /* private mode etc. — the table just won't persist */ }
    return top.indexOf(entry); // -1 if the score didn't crack the top 10
  }

  leaderboardHtml(highlight = null) {
    const list = this.loadLeaderboard();
    if (!list.length) return '<p class="hint">No scores yet — finish a 1 player game!</p>';
    return `
      <table class="stats-table lb-table">
        <tr><th>#</th><th>Name</th><th>EP</th><th>Date</th></tr>
        ${list.map((e, i) => `
          <tr class="${highlight === i ? 'lb-highlight' : ''}">
            <td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td>⭐${e.ep}</td><td>${e.date}</td>
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
        <h2>🪙 The Coin Bank</h2>
        <ul class="info-list">
          <li>Coins buy <b>Betting Tickets</b>.</li>
          <li>You start with <b>${CONFIG.startingCoins}</b> and get <b>+${CONFIG.coinsPerRound}</b> after every roll.</li>
          <li><b>Interest:</b> each round you also earn 1 extra Coin per ${CONFIG.interestDivisor} you're holding
            (max +${CONFIG.maxInterest}) — saving up pays off.</li>
          <li>Refreshing your ticket offers costs <b>${CONFIG.refreshCostFirst} Coin</b> the first time each round,
            then <b>${CONFIG.refreshCostNext} Coins</b> after that; offers refresh free after every roll.</li>
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
        ${this.game?.rogue
          ? `Checkpoints: ${Object.entries(ROGUE.targets).map(([r, ep]) => `${ep} by round ${r}`).join(', ')} — the last one wins the run.`
          : this.game?.mode === 1
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
    const sections = this.laneMascots().map((m) => {
      const rows = TICKETS.filter((t) => t.mascotId === m.id)
        .sort((a, b) => a.cost - b.cost)
        .map((t) => {
          const offsets = [t.target1, t.target2].filter((x) => x !== null);
          const targets = offsets.map((x) => this.upDown(x)).join(' & ');
          const prob = collectProbability(m, offsets, horizon, this.newsConstraint(m.id));
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

  // The prototype's "Drop Rates and more info" box.
  showStatsGeek() {
    const tiers = Object.keys(TICKET_TIER_WEIGHTS).map(Number);
    const levelIdx = [0, 1, 2, 3, 4];
    const ticketSums = levelIdx.map((i) => tiers.reduce((s, t) => s + TICKET_TIER_WEIGHTS[t][i], 0));
    const ticketRows = tiers.map((t) => `
      <tr><td>🪙${t}</td>${levelIdx.map((i) =>
        `<td>${Math.round((TICKET_TIER_WEIGHTS[t][i] / ticketSums[i]) * 100)}%</td>`).join('')}</tr>`).join('');
    const payoutRows = tiers.map((t) => `<tr><td>🪙${t}</td><td>${PAYOUT_RATIOS[t].toFixed(2)}x</td></tr>`).join('');

    const spellNames = {
      51: 'Double', 52: 'Halve <span class="hint">(2P only)</span>', 53: 'Move EP',
      54: 'Steal <span class="hint">(2P only)</span>', 55: 'Mascot Up', 56: 'Mascot Down', 57: 'Mascot Freeze',
    };
    const spellTypes = Object.keys(SPELL_TYPE_WEIGHTS).map(Number);
    const spellSums = levelIdx.map((i) => spellTypes.reduce((s, t) => s + SPELL_TYPE_WEIGHTS[t][i], 0));
    const spellRows = spellTypes.map((t) => `
      <tr><td style="text-align:left">${spellNames[t]}</td>${levelIdx.map((i) =>
        `<td>${Math.round((SPELL_TYPE_WEIGHTS[t][i] / spellSums[i]) * 100)}%</td>`).join('')}</tr>`).join('');

    const overlay = this.modal(`
      <h2>🤓 Drop Rates and more info</h2>
      <h3 class="geek-h3">Betting Tickets</h3>
      <p class="hint">Tickets cost 1, 2, 3, 4, 5, or 10 Coins. As your EP Level goes up, you're
        more likely to see higher-cost tickets in the shop:</p>
      <table class="stats-table full">
        <tr><th>Cost</th><th>Lvl 1</th><th>Lvl 2</th><th>Lvl 3</th><th>Lvl 4</th><th>Lvl 5</th></tr>
        ${ticketRows}
      </table>
      <p class="hint">As the cost goes up, the payout multiplier goes up — the more EP you win
        per Coin. Buying higher-cost tickets is generally better:</p>
      <table class="stats-table"><tr><th>Cost</th><th>Payout ratio</th></tr>${payoutRows}</table>
      <p style="text-align:center"><button class="btn btn-primary" id="geek-all-bets">Show All Possible Bets</button></p>
      <h3 class="geek-h3">Spells</h3>
      <p class="hint">Two spell offers per round, paid in EP. Drop rates by EP Level:</p>
      <table class="stats-table full">
        <tr><th>Spell</th><th>Lvl 1</th><th>Lvl 2</th><th>Lvl 3</th><th>Lvl 4</th><th>Lvl 5</th></tr>
        ${spellRows}
      </table>
      <p class="hint"><b>EP Levels</b> — click your ⭐ EP to see how Levels work.<br>
        <b>Gaining Coins</b> — click your 🪙 Coins to see how the bank works.</p>`, { wide: true });
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
