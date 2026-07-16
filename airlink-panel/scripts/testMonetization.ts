import prisma from '../src/db';
import { EventBus, EVENTS } from '../src/services/monetization/EventBus';
import { StreakService } from '../src/services/monetization/StreakService';
import { AfkService } from '../src/services/monetization/AfkService';
import { FraudService } from '../src/services/monetization/FraudService';
import { EconomyService } from '../src/services/monetization/EconomyService';
import { ProviderRegistry } from '../src/services/monetization/providers/ProviderRegistry';
import { initializeProviders } from '../src/services/monetization/providers';
import { WalletService } from '../src/services/WalletService';
import { EarnStatus, RewardType } from '../src/generated/prisma/client';

async function runTests() {
  console.log('=== STARTING MONETIZATION AUTOMATED TESTING SUITE ===\n');
  let failures = 0;

  await initializeProviders();

  function assert(condition: boolean, message: string) {
    if (!condition) {
      console.error(`  [FAIL] ${message}`);
      failures++;
    } else {
      console.log(`  [PASS] ${message}`);
    }
  }

  const uniqueId = Math.floor(Math.random() * 1000000);

  // Create two test users for multi-account fraud detection
  const user = await prisma.users.create({
    data: { username: `testuser_a_${uniqueId}`, email: `a_${uniqueId}@cynex.gp`, password: 'test123' }
  });
  const user2 = await prisma.users.create({
    data: { username: `testuser_b_${uniqueId}`, email: `b_${uniqueId}@cynex.gp`, password: 'test123' }
  });

  await WalletService.getOrCreate(user.id);
  await WalletService.getOrCreate(user2.id);
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  assert(!!wallet, 'Wallet initialized for test user');

  try {
    // ═══ 1. EVENT BUS ═══
    console.log('\n--- 1. Testing EventBus ---');
    let eventReceived = false;
    let priorityFirst = false;
    let stdReceived = false;

    EventBus.subscribe('test.event', { priority: 100, async handle() { priorityFirst = !stdReceived; } });
    EventBus.subscribe('test.event', { priority: 10, async handle() { stdReceived = true; eventReceived = true; } });
    await EventBus.publish('test.event', { msg: 'hello' });
    await new Promise(r => setTimeout(r, 100));

    assert(eventReceived, 'EventBus emitted and handled event');
    assert(priorityFirst, 'Priority listeners run first');

    let retryCount = 0;
    EventBus.subscribe('test.failure', { priority: 50, async handle() { retryCount++; throw new Error('Simulated'); } });
    await EventBus.publish('test.failure', { item: 1 });
    await new Promise(r => setTimeout(r, 500));
    assert(retryCount > 1, `EventBus retried failed handlers (attempts: ${retryCount})`);

    // ═══ 2. ECONOMY SERVICE ═══
    console.log('\n--- 2. Testing Economy Service ---');
    const initBal = await WalletService.getBalance(user.id);

    await prisma.$transaction(async (tx) => {
      await EconomyService.awardRewards({
        userId: user.id,
        rewards: [{ rewardType: RewardType.COINS, amount: 200 }],
        source: 'Test payout',
        referenceId: 'test_ref_1',
        tx
      });
    });

    const postBal = await WalletService.getBalance(user.id);
    assert(postBal === initBal + 200, `Atomic coin credit (balance: ${postBal})`);

    const txCount = await prisma.walletTransaction.count({ where: { walletId: wallet!.id, referenceId: 'test_ref_1' } });
    assert(txCount > 0, 'Transaction audit trail created');

    // ═══ 3. DAILY STREAKS ═══
    console.log('\n--- 3. Testing Daily Streaks ---');
    await StreakService.getStreak(user.id);
    const c1 = await StreakService.claimDaily(user.id, 'UTC');
    assert(c1.success, 'First daily claim succeeded');
    assert(c1.coinsAwarded > 0, `Streak coins awarded: ${c1.coinsAwarded}`);

    const c2 = await StreakService.claimDaily(user.id, 'UTC');
    assert(!c2.success, 'Duplicate same-day claim rejected');

    const streak = await StreakService.getStreak(user.id);
    assert(streak.currentStreak === 1, 'Streak counter = 1');

    // ═══ 4. AFK ENGINE ═══
    console.log('\n--- 4. Testing AFK Engine ---');
    const tokA = 'sess_tok_a';
    const tokB = 'sess_tok_b';

    const s1 = await AfkService.startSession(user.id, tokA, '127.0.0.1');
    assert(s1.success, 'AFK session started');

    const s2 = await AfkService.startSession(user.id, tokB, '127.0.0.1');
    assert(!s2.success, 'Multi-tab blocked');

    // Backdate heartbeat to pass jitter check
    await prisma.afkSession.update({ where: { id: s1.sessionId }, data: { lastHeartbeat: new Date(Date.now() - 60000) } });

    const hb1 = await AfkService.heartbeat(user.id, tokA, { visible: false, focused: false, ipAddress: '127.0.0.1' });
    assert(hb1.status === 'PAUSED', 'Invisible tab pauses session');

    // Restart and test active heartbeat
    const s3 = await AfkService.startSession(user.id, tokA, '127.0.0.1');
    await prisma.afkSession.update({ where: { id: s3.sessionId }, data: { lastHeartbeat: new Date(Date.now() - 60000) } });

    const hb2 = await AfkService.heartbeat(user.id, tokA, { visible: true, focused: true, mouseX: 50, mouseY: 50, ipAddress: '127.0.0.1' });
    assert(hb2.success, 'Active heartbeat validated');

    await AfkService.stopSession(user.id, tokA);

    // ═══ 5. FRAUD DETECTION ═══
    console.log('\n--- 5. Testing Fraud Detection ---');
    const r1 = await FraudService.evaluateRisk({ userId: user.id, ipAddress: '192.0.2.1', fingerprint: 'fp_clean' });
    assert(r1.verdict === 'SAFE', 'Clean request is SAFE');

    // Create sessions for user2 with the SAME IP to trigger multi-account detection
    const sharedIp = '198.51.100.42';
    for (let i = 0; i < 3; i++) {
      await prisma.earnSession.create({
        data: {
          userId: user2.id, type: 'OFFER', status: EarnStatus.COMPLETED,
          token: `fraud_t_${i}_${uniqueId}`, nonce: `fraud_n_${i}_${uniqueId}`,
          coinsAwarded: 10, ipAddress: sharedIp, metadata: {}
        }
      });
    }

    const r2 = await FraudService.evaluateRisk({ userId: user.id, ipAddress: sharedIp, fingerprint: 'fp_shared' });
    assert(r2.score >= 50, `Multi-account risk score triggered (score: ${r2.score})`);
    assert(r2.verdict !== 'SAFE', `Verdict: ${r2.verdict}`);

    const logs = await prisma.monetizationFraudLog.findMany({ where: { userId: user.id } });
    assert(logs.length > 0, 'Fraud log persisted to DB');

    // ═══ 6. PROVIDER REGISTRY ═══
    console.log('\n--- 6. Testing Provider Registry ---');
    const lv = ProviderRegistry.get('linkvertise');
    const ad = ProviderRegistry.get('adsterra');
    assert(!!lv, 'Linkvertise provider registered');
    assert(!!ad, 'Adsterra provider registered');
    assert(ProviderRegistry.getAll().length >= 2, 'All providers listed');

  } catch (e: any) {
    console.error('Unexpected error:', e);
    failures++;
  } finally {
    console.log('\nCleaning up...');
    try {
      await prisma.monetizationFraudLog.deleteMany({ where: { userId: { in: [user.id, user2.id] } } });
      await prisma.userStreak.deleteMany({ where: { userId: { in: [user.id, user2.id] } } });
      await prisma.afkSession.deleteMany({ where: { userId: { in: [user.id, user2.id] } } });
      await prisma.earnSession.deleteMany({ where: { userId: { in: [user.id, user2.id] } } });
      const w1 = await prisma.wallet.findUnique({ where: { userId: user.id } });
      const w2 = await prisma.wallet.findUnique({ where: { userId: user2.id } });
      if (w1) await prisma.walletTransaction.deleteMany({ where: { walletId: w1.id } });
      if (w2) await prisma.walletTransaction.deleteMany({ where: { walletId: w2.id } });
      await prisma.wallet.deleteMany({ where: { userId: { in: [user.id, user2.id] } } });
      await prisma.users.deleteMany({ where: { id: { in: [user.id, user2.id] } } });
    } catch (e) { console.error('Cleanup error:', e); }
    console.log('Done.');
  }

  console.log('\n====================================================');
  if (failures === 0) {
    console.log('  ALL TESTS PASSED (100% SUCCESS)');
  } else {
    console.error(`  ${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log('====================================================\n');
}

runTests();
