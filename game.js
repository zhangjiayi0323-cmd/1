const SUITS = {
  FLOWER: 'flower',
  SKULL: 'skull',
};

const PHASES = {
  PLACING: 'placing',
  BIDDING: 'bidding',
  CHALLENGE: 'challenge',
  ROUND_END: 'round_end',
  GAME_END: 'game_end',
};

class SkullGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.activePlayerIndex = 0;
    this.currentBid = null;
    this.highBidderId = null;
    this.challengeFlipCount = 0;
    this.challengeFlipped = [];
    this.phase = PHASES.PLACING;
    this.winnerId = null;
  }

  addPlayer(id, name) {
    if (this.phase !== PHASES.PLACING || this.players.some((p) => p.hasPlaced)) {
      throw new Error('无法在回合中途加入，请等待下一局。');
    }
    if (this.players.find((p) => p.id === id)) {
      throw new Error('玩家已存在。');
    }
    const player = {
      id,
      name: name || `玩家${this.players.length + 1}`,
      hand: [SUITS.FLOWER, SUITS.FLOWER, SUITS.FLOWER, SUITS.SKULL],
      stack: [],
      hasPlaced: false,
      score: 0,
      eliminated: false,
    };
    this.players.push(player);
    return player;
  }

  removePlayer(id) {
    const idx = this.players.findIndex((p) => p.id === id);
    if (idx === -1) return;
    this.players.splice(idx, 1);
    if (this.activePlayerIndex >= this.players.length) {
      this.activePlayerIndex = 0;
    }
    if (this.players.length <= 1 && this.players.length > 0) {
      this.phase = PHASES.GAME_END;
      this.winnerId = this.players[0].id;
    }
  }

  assertPlayerTurn(playerId) {
    if (this.currentPlayer().id !== playerId) {
      throw new Error('还没轮到你行动。');
    }
  }

  currentPlayer() {
    return this.players[this.activePlayerIndex];
  }

  livingPlayers() {
    return this.players.filter((p) => !p.eliminated);
  }

  placeCard(playerId, cardType) {
    if (this.phase !== PHASES.PLACING && this.phase !== PHASES.BIDDING) {
      throw new Error('当前阶段不能出牌。');
    }
    const player = this.getPlayer(playerId);
    if (player.eliminated) throw new Error('你已出局。');
    this.assertPlayerTurn(playerId);

    const cardIdx = player.hand.indexOf(cardType);
    if (cardIdx === -1) {
      throw new Error('你没有这张牌。');
    }

    player.hand.splice(cardIdx, 1);
    player.stack.push(cardType);
    player.hasPlaced = true;

    if (this.phase === PHASES.BIDDING) {
      this.nextTurnSkippingEliminated();
      return { message: `${player.name} 在叫牌阶段补了一张牌。` };
    }

    this.phase = PHASES.PLACING;
    this.nextTurnSkippingEliminated();
    return { message: `${player.name} 放置了1张牌。` };
  }

  canBid(playerId, amount) {
    const totalCards = this.players.reduce((sum, p) => sum + p.stack.length, 0);
    return amount >= 1 && amount <= totalCards && (this.currentBid === null || amount > this.currentBid) && this.currentPlayer().id === playerId;
  }

  startBid(playerId, amount) {
    if (this.phase !== PHASES.PLACING && this.phase !== PHASES.BIDDING) {
      throw new Error('当前阶段无法叫牌。');
    }
    if (!this.players.every((p) => p.eliminated || p.stack.length > 0)) {
      throw new Error('每位存活玩家至少放置1张牌后才能叫牌。');
    }
    if (!this.canBid(playerId, amount)) {
      throw new Error('叫牌无效。');
    }
    this.currentBid = amount;
    this.highBidderId = playerId;
    this.phase = PHASES.BIDDING;
    this.nextTurnSkippingEliminated();
    return { message: `${this.getPlayer(playerId).name} 叫到 ${amount}。` };
  }

  passBid(playerId) {
    if (this.phase !== PHASES.BIDDING) {
      throw new Error('当前不在叫牌阶段。');
    }
    this.assertPlayerTurn(playerId);
    const player = this.getPlayer(playerId);
    player.passed = true;

    const contenders = this.livingPlayers().filter((p) => !p.passed && p.id !== this.highBidderId);
    if (contenders.length === 0) {
      this.phase = PHASES.CHALLENGE;
      this.activePlayerIndex = this.players.findIndex((p) => p.id === this.highBidderId);
      this.challengeFlipCount = 0;
      this.challengeFlipped = [];
      return { message: `所有人弃权，${this.getPlayer(this.highBidderId).name} 开始挑战 ${this.currentBid}。` };
    }

    this.nextTurnSkippingEliminated();
    return { message: `${player.name} 弃权。` };
  }

  raiseBid(playerId, amount) {
    if (this.phase !== PHASES.BIDDING) {
      throw new Error('当前不在叫牌阶段。');
    }
    if (!this.canBid(playerId, amount)) {
      throw new Error('加注无效。');
    }
    this.currentBid = amount;
    this.highBidderId = playerId;

    this.nextTurnSkippingEliminated();
    return { message: `${this.getPlayer(playerId).name} 加注到 ${amount}。` };
  }

  flipOwnTop(playerId) {
    if (this.phase !== PHASES.CHALLENGE) {
      throw new Error('当前不是挑战阶段。');
    }
    if (this.highBidderId !== playerId) {
      throw new Error('只有挑战者可翻牌。');
    }
    const player = this.getPlayer(playerId);
    if (player.stack.length === 0) {
      throw new Error('你的牌堆没有牌。');
    }
    return this.flipCard(playerId, playerId, player.stack.length - 1);
  }

  flipCard(actorId, targetPlayerId, cardIndex) {
    if (this.phase !== PHASES.CHALLENGE) {
      throw new Error('当前不是挑战阶段。');
    }
    if (actorId !== this.highBidderId) {
      throw new Error('只有挑战者可翻牌。');
    }
    const target = this.getPlayer(targetPlayerId);
    if (!target || target.stack.length === 0) {
      throw new Error('目标牌堆为空。');
    }
    if (cardIndex < 0 || cardIndex >= target.stack.length) {
      throw new Error('翻牌索引非法。');
    }

    const key = `${targetPlayerId}:${cardIndex}`;
    if (this.challengeFlipped.includes(key)) {
      throw new Error('这张牌已翻开。');
    }

    const card = target.stack[cardIndex];
    this.challengeFlipped.push(key);
    this.challengeFlipCount += 1;

    if (card === SUITS.SKULL) {
      const challenger = this.getPlayer(this.highBidderId);
      this.resolveChallengeFail(challenger);
      return { message: `${challenger.name} 翻到骷髅，挑战失败。`, card, failed: true };
    }

    if (this.challengeFlipCount >= this.currentBid) {
      const challenger = this.getPlayer(this.highBidderId);
      challenger.score += 1;
      const winGame = challenger.score >= 2;
      this.endRound();
      if (winGame) {
        this.phase = PHASES.GAME_END;
        this.winnerId = challenger.id;
      }
      return { message: `${challenger.name} 挑战成功，获得1分。`, card, success: true, gameEnd: winGame };
    }

    return { message: `翻到花牌，继续挑战。`, card, progress: this.challengeFlipCount };
  }

  resolveChallengeFail(challenger) {
    const all = [];
    this.players.forEach((p) => {
      all.push(...p.hand, ...p.stack);
    });
    if (all.length > 0) {
      const lossCard = all[Math.floor(Math.random() * all.length)];
      if (challenger.hand.includes(lossCard)) {
        challenger.hand.splice(challenger.hand.indexOf(lossCard), 1);
      } else {
        for (const p of this.players) {
          const idx = p.stack.indexOf(lossCard);
          if (idx !== -1) {
            p.stack.splice(idx, 1);
            break;
          }
        }
      }
    }

    if (challenger.hand.length + challenger.stack.length <= 0) {
      challenger.eliminated = true;
    }
    this.endRound();
  }

  endRound() {
    this.players.forEach((p) => {
      p.hand.push(...p.stack);
      p.stack = [];
      p.hasPlaced = false;
      p.passed = false;
    });
    this.currentBid = null;
    this.highBidderId = null;
    this.challengeFlipCount = 0;
    this.challengeFlipped = [];
    this.phase = this.phase === PHASES.GAME_END ? PHASES.GAME_END : PHASES.PLACING;

    const alive = this.livingPlayers();
    if (alive.length === 1) {
      this.phase = PHASES.GAME_END;
      this.winnerId = alive[0].id;
    }
    if (alive.length > 0) {
      this.activePlayerIndex = this.players.findIndex((p) => p.id === alive[0].id);
    }
  }

  getPlayer(id) {
    const player = this.players.find((p) => p.id === id);
    if (!player) throw new Error('玩家不存在。');
    return player;
  }

  nextTurnSkippingEliminated() {
    const alive = this.livingPlayers();
    if (alive.length <= 1) return;

    let tries = 0;
    do {
      this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;
      tries += 1;
      if (tries > this.players.length + 2) break;
    } while (this.players[this.activePlayerIndex].eliminated || (this.phase === PHASES.BIDDING && this.players[this.activePlayerIndex].passed));
  }

  serialize(forPlayerId) {
    return {
      roomId: this.roomId,
      phase: this.phase,
      currentPlayerId: this.currentPlayer()?.id,
      currentBid: this.currentBid,
      highBidderId: this.highBidderId,
      challengeFlipCount: this.challengeFlipCount,
      winnerId: this.winnerId,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        handCount: p.hand.length,
        stackCount: p.stack.length,
        stackTopVisible: forPlayerId === p.id ? p.stack : Array(p.stack.length).fill('unknown'),
        score: p.score,
        eliminated: p.eliminated,
        passed: !!p.passed,
      })),
      yourHand: this.getPlayer(forPlayerId).hand,
      flipped: this.challengeFlipped,
    };
  }
}

module.exports = { SkullGame, PHASES, SUITS };
