// The prototype's tutorial (speech bubbles shown by VBA Module2, in the
// Tutorial1 → Tutorial17 order), lightly adapted where this version's UI
// differs from the Excel original (Next buttons instead of numbered shapes,
// auto-centering lanes, the current Mascot News rules).

export const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Market Party!',
    html: `I'm your co-host, <b>Billy Bull</b>. My friend Baldy Bear and I used fun things
      from the stock market to create this new, riskless, fast-paced game. And we brought
      some of our mascot friends with us!<br><br>
      Click <b>Next</b> to walk through how it all works. If you want, you can skip the
      "Gamer Details" parts and come back to them later — you'll still be able to play.`,
  },
  {
    title: 'Market Party!',
    html: `Our mascot friends represent different stocks. They roll unique dice to move up
      and down a staircase, like stocks do in the real world. Some move larger amounts than
      others, and some are more likely to move up than others.<br><br>
      Each round, you make bets on the mascots' moves. When you win a bet, you collect
      <b>EP (Equity Points)</b>. The goal of this game is to get <b>1000 EP</b> before your
      opponent. In one player mode the goal is to get 1000 EP within 10 rounds.`,
  },
  {
    title: 'Game Play',
    html: `This is meant to be a 2 player game, but can also be played in 1 player mode.
      Each player has their own panel of Bets and Spells.<br><br>
      Each round consists of 2 parts:<br>
      <b>1.</b> First, each player can place <b>Bets</b> and cast <b>Spells</b>.<br>
      <b>2.</b> Then, each Mascot rolls its die and moves up or down the number of Steps
      they roll.`,
  },
  {
    title: 'The Game Board',
    html: `The game board is a huge <b>100-Step staircase</b>. Each mascot has its own
      color-coded lane, and you can see them sitting on their current Step.<br><br>
      All mascots start on Step 50 and move from there based on their dice roll each
      round. Each lane keeps its mascot centered in view — scroll a lane if you ever want
      to peek further up or down the staircase.`,
  },
  {
    title: 'Coins and EP',
    html: `You start the game with <b>7 Coins</b> and <b>0 EP</b>, shown in your bank.
      You start at EP Level 1, which increases up to Level 5 as you gain EP. As your EP
      Level increases, you are more likely to see better Bets and Spells in the shop.<br><br>
      <i>Gamer Details — click ⭐ <b>EP</b> in your bank to see the EP required for each
      Level, and the 🤓 <b>Stats Geek</b> button for drop rates.</i>`,
  },
  {
    title: 'Placing Bets',
    html: `Each round, <b>4 betting tickets</b> appear in the shop for each player — one
      for each mascot.<br><br>
      Clicking a mascot's picture on a ticket (or the 📊 button on its lane) shows you its
      possible dice rolls. Knowing how the mascots move will help you decide which bets to
      make — mascots move both <b>up and down</b> the Steps!`,
  },
  {
    title: 'Reading a Ticket',
    html: `When you click a green <b>Bet</b> button, you are betting on that mascot to
      reach a Step on the staircase — you pay Coins to hopefully win EP.<br><br>
      • The <b>EP you can win</b> is at the top of the ticket.<br>
      • Below it: the <b>Step(s)</b> the EP lands on — Up or Down from wherever the mascot
      currently stands — plus a live difficulty rating.<br>
      • The <b>Coin cost</b> is on the Bet button.<br>
      • Some Bets place EP on <b>two Steps</b> at once!<br><br>
      <i>Gamer Details — to see every ticket in the game, click 📋 <b>All Bets</b>.</i>`,
  },
  {
    title: 'Seeing New Bets',
    html: `If you don't like any of the bets offered in the shop, you can press the
      <b>↻ Refresh</b> button to see 4 new bets. The first refresh each round costs
      1 Coin; after that they cost 2. The shop also refreshes for free after every roll.`,
  },
  {
    title: 'Casting Spells',
    html: `Each round, you have the opportunity to spend <b>EP</b> to cast up to 2
      <b>Spells</b>. Spells can help you win more EP — and can also be used to play
      defense against your opponent (Halve and Steal target the other player's bounties,
      so they only appear in 2 player games).<br><br>
      <i>Gamer Details — the <b>?</b> next to the Spells shop lists every spell type, and
      🤓 Stats Geek shows their drop rates.</i>`,
  },
  {
    title: 'The Roll',
    html: `Once everyone is done placing Bets and casting Spells, click the yellow
      <b>ROLL</b> button. Each mascot's die spins and it moves up or down the Steps —
      hopefully winning your bets and collecting EP for you!<br><br>
      Then a new round begins: 4 new Bets and 2 new Spells appear in the shop, and Coins
      are added to your bank. The more Coins you hold, the more interest you earn each
      round.<br><br>
      <i>Gamer Details — click 🪙 <b>Coins</b> in your bank to see how Coin income is
      calculated.</i>`,
  },
  {
    title: 'Collecting EP',
    html: `The EP you can win sits on the game board as a chip in that mascot's lane —
      amber chips for Player 1, purple for Player 2.<br><br>
      If the mascot <b>passes through or lands on</b> the Step with EP, the EP flies into
      your bank and comes off the board. Only that mascot can collect it — the others pass
      right by!<br><br>
      After each roll, an open circle marks the Step each mascot started from, with dots
      tracing its path, so you can easily see the round's movement.`,
  },
  {
    title: 'Mascot News Alerts',
    html: `Each round — including before Round 1 — there is a chance of a <b>Mascot News
      Alert</b>:<br><br>
      🛢️ <b>Oil Strike</b> — that mascot can only move <b>Up</b> for 3 rolls.<br>
      🌍 <b>Earthquake</b> — that mascot can only move <b>Down</b> for 3 rolls.<br><br>
      Several alerts can run at once, but each mascot can only have one. Use them to help
      decide which Bets to place and Spells to buy!<br><br>
      <i>Gamer Details — click the yellow news banner at the top to see every alert and
      its odds.</i>`,
  },
  {
    title: 'How Does The Game End?',
    html: `In <b>two player mode</b>, there is no limit to the number of rounds. The first
      player to collect <b>1000 EP</b> is the winner. If either player reaches 1000 EP
      mid-round, the round is played out and whoever has more EP after it wins.<br><br>
      In <b>one player mode</b>, the game ends after 10 rounds. Collect at least 1000 EP
      to earn a spot on the leaderboard and show you are a Market Party master!<br><br>
      Now close this, place some Bets, and hit Roll. <b>Good luck!</b> 🎉`,
  },
];
