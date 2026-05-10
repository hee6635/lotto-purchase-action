import fs from 'fs';

export default async ({ purchaseManual, page }) => {
  console.log('=== 🤖 현장 정밀 진단 및 잔액 추적 시작 ===');

  const rawNumbers = process.env.APP_NUMBERS;
  const targetNumbers = rawNumbers ? [rawNumbers.split(',').map(n => parseInt(n.trim(), 10))] : [[1, 2, 3, 4, 5, 6]];

  let currentBalance = 0;
  let status = "fail";
  let message = "";

  try {
    // 1. 우선 구매 시도를 통해 로그인을 수행합니다.
    console.log('📡 구매 엔진 가동 및 로그인 시도...');
    const purchased = await purchaseManual(targetNumbers);
    
    if (purchased && purchased.length > 0) {
      currentBalance = purchased[0].balance || 0;
      status = "success";
      message = "구매 성공";
    }
  } catch (error) {
    // 💡 [핵심] 여기서 에러가 났을 때, 로봇이 본 '진짜 이유'를 분석합니다.
    const rawError = error.message;
    console.log(`❌ 로봇이 보고한 원본 에러: ${rawError}`);

    message = filterError(rawError);

    // 2. 만약 에러가 났더라도, 로그인은 되어 있을 수 있으니 메인 페이지에서 잔액을 다시 찾습니다.
    try {
      console.log('🔍 점검 중일 수 있으니 메인 페이지에서 잔액 재조회...');
      await page.goto('https://dhlottery.co.kr/common.do?method=main');
      await page.waitForTimeout(2000);
      
      // 메인 페이지의 잔액 셀렉터 (로그인 상태일 때)
      const balanceText = await page.$eval('.money strong', el => el.innerText).catch(() => null);
      if (balanceText) {
        currentBalance = parseInt(balanceText.replace(/,/g, ''), 10);
        console.log(`💰 메인 페이지에서 확인된 진짜 잔액: ${currentBalance}원`);
      }
    } catch (e) {
      console.log('⚠️ 메인 페이지 잔액 조회도 실패 (로그인 세션 만료 가능성)');
    }
  }

  // 3. 최종 결과 기록
  saveResult(currentBalance, status, message);
};

function filterError(rawMsg) {
  // 로봇이 뱉는 에러 메시지들을 더 촘촘하게 분석
  if (rawMsg.includes("한도") || rawMsg.includes("5,000원")) return "오늘 구매 한도를 초과했습니다.";
  if (rawMsg.includes("예치금") || rawMsg.includes("잔액") || rawMsg.includes("부족")) return "예치금이 부족합니다.";
  if (rawMsg.includes("시간") || rawMsg.includes("점검") || rawMsg.includes("24시")) return "사이트 점검 시간입니다 (00~06시).";
  if (rawMsg.includes("timeout") || rawMsg.includes("waiting")) return "사이트 응답이 너무 느려 타임아웃되었습니다.";
  
  return "사이트 응답 지연 또는 일시적 오류입니다.";
}

function saveResult(balance, status, msg) {
  const resultData = {
    balance: balance,
    status: status,
    message: msg,
    last_run: new Date().toISOString()
  };
  fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
}
