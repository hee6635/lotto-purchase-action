// ... (상단 헬퍼 함수 및 autoRechargeOrder는 그대로 유지) ...

// ── 4. 메인 엔진 (스케줄 최적화 버전) ──────────────────────────────────────────────
export default async function(api) {
  const isScheduled = process.env.IS_SCHEDULED === 'true';
  const scheduleCommand = (process.env.INPUT_COMMAND || '').trim(); // 스케줄 명령어
  const inputEnv = (process.env.INPUT_LOTTO_NUMBERS || '').replace(/['"]/g, '').trim();
  const accMode = (process.env.INPUT_ACCOUNT_MODE || 'acc1').trim();
  const displayAccName = accMode === 'acc2' ? '계정 2' : '계정 1'; 

  let results = { balance1: "--", balance2: "--", history: [], ledger: [], reservation: null, last_run: "" };
  try { if (fs.existsSync('result.json')) results = Object.assign(results, JSON.parse(fs.readFileSync('result.json', 'utf8'))); } catch(e) {}

  const page = api.page || (api.session ? api.session.page : null);
  if (!page) return { status: "fail", message: "브라우저 연결 실패" };

  // ── [A] 월요일 오전 07:00: 충전 전용 모드 ──
  if (isScheduled && scheduleCommand === 'RECHARGE_ONLY') {
    const orderRes = await autoRechargeOrder(page, accMode);
    if (orderRes.success) {
      await sendTelegram(`⚡ [${displayAccName} 충전 신청 완료]\n- 대상계좌: 케이뱅크 ${orderRes.account}\n오전 중 자동이체가 완료되면 오후에 구매를 시작합니다.`);
    } else {
      await sendTelegram(`❌ [${displayAccName} 충전 신청 실패]\n- 원인: ${orderRes.error}`);
    }
    return { status: "success" };
  }

  // ── [B] 기본 정보 조회 (잔액 업데이트) ──
  let currentBalance = "0"; 
  try {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const res = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle' });
    const json = JSON.parse(await res.text());
    currentBalance = String(json?.data?.userMndp?.crntEntrsAmt || "0");
  } catch (e) {}
  if (accMode === 'acc2') results.balance2 = currentBalance; else results.balance1 = currentBalance;

  // ── [C] 월요일 오후: 자동 구매 모드 ──
  let isBuy = false; let targetGames = "";
  if (inputEnv !== "SYNC_ONLY" && scheduleCommand !== 'CHECK_WIN') {
    // 스케줄 구매이거나 수동 즉시 구매인 경우
    if (inputEnv || (isScheduled && scheduleCommand === 'PURCHASE_AUTO')) {
        isBuy = true;
        if (isScheduled && scheduleCommand === 'PURCHASE_AUTO') {
            const res = results.reservation;
            if (!res || !res.isActive) return { status: "success" };
            // ... (기존 번호 생성 로직 그대로 작동) ...
            // targetGames 생성 로직 생략 (기존 코드와 동일)
        } else { targetGames = inputEnv; }
    }
  }

  // ── [D] 구매 실행 및 보고 ──
  if (isBuy && targetGames) {
    // ... (기존 구매 실행 및 텔레그램 발송 로직 그대로 사용) ...
    // 단, 여기서 autoRechargeOrder 호출은 이제 필요 없으므로 제거해도 됩니다.
  }

  // ── [E] 장부 동기화 및 토요일 당첨 확인 (기존과 동일) ──
  // ... (기존 코드 유지) ...

  fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
  return { status: "success", balance: currentBalance };
}
