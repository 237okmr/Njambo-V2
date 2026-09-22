import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldBotAcceptBetIncrease } from '../../src/utils/ai';

test('shouldBotAcceptBetIncrease - safety cap at 40% of capital', () => {
  const botCapital = 100;
  // proposedBet = 45 > 40 (40% of capital), must be rejected
  const acceptOverCap = shouldBotAcceptBetIncrease(45, botCapital, 'AGGRESSIVE_LEADER', 'EASY');
  assert.equal(acceptOverCap, false, 'Bot should reject proposal exceeding 40% of its capital');

  // proposedBet = 40 <= 40 (40% of capital), should be evaluated normally
  // With EASY difficulty, acceptance rate is 95%
  let acceptWithinCapCount = 0;
  for (let i = 0; i < 100; i++) {
    if (shouldBotAcceptBetIncrease(40, botCapital, 'AGGRESSIVE_LEADER', 'EASY')) {
      acceptWithinCapCount++;
    }
  }
  assert.ok(acceptWithinCapCount > 70, 'Bot should accept proposals within safety cap high rate on EASY');
});

test('shouldBotAcceptBetIncrease - personality variations', () => {
  const botCapital = 1000;
  const proposedBet = 50; // Well below 40% cap (400)

  // Test CONSERVATIVE bot
  let conservativeAccepts = 0;
  for (let i = 0; i < 1000; i++) {
    if (shouldBotAcceptBetIncrease(proposedBet, botCapital, 'CONSERVATIVE', 'NORMAL')) {
      conservativeAccepts++;
    }
  }
  // Expect around 45% acceptance (450 +/- 80)
  assert.ok(conservativeAccepts > 350 && conservativeAccepts < 550, `Conservative accepts: ${conservativeAccepts}`);

  // Test AGGRESSIVE_LEADER bot
  let aggressiveAccepts = 0;
  for (let i = 0; i < 1000; i++) {
    if (shouldBotAcceptBetIncrease(proposedBet, botCapital, 'AGGRESSIVE_LEADER', 'NORMAL')) {
      aggressiveAccepts++;
    }
  }
  // Expect around 85% acceptance (850 +/- 80)
  assert.ok(aggressiveAccepts > 750 && aggressiveAccepts < 930, `Aggressive accepts: ${aggressiveAccepts}`);
});
