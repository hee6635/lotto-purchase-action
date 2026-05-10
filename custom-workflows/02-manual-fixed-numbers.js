import fs from 'fs';

export default async ({ purchaseManual, page }) => { // page 객체를 직접 사용
  console.log('=== 🤖 실시간 잔액 정밀 추적 시작 ===');

  const rawNumbers = process.env.APP_NUMBERS;
  const targetNumbers = rawNumbers ? [rawNumbers.split(',').map(n => parseInt(n.trim(), 10))] : [[1, 2, 3, 4, 5, 6]];

  let currentBalance = 0;
  let status = "fail";
  let message = "";

  try {
    // 1. 구매 페이지 접속 후 잠시 대기 (잔액이 로딩될 시간)
    console.log('📡 잔액 위치 탐색 중...');
    await page.goto('https://ol.dhlottery.co.kr/olotto/game/game645.do');
    await page.waitForTimeout(3000); 

    // 2. 화면에서 잔액 숫자를 직접 긁어오기 (셀렉터 기반)
    const balanceText = await page.$eval('#article .user_info .money strong', el => el.innerText).catch(() => null);
    
    if (balanceText) {
      currentBalance = parseInt(balanceText.replace(/,/g, ''), 10);
      console.log(`💰 현장 확인 잔액: ${currentBalance}원`);
    }

    // 3. 구매 시도
    const purchased = await purchaseManual(targetNumbers);
    if (purchased && purchased.length > 0) {
      currentBalance = purchased[0].balance || currentBalance;
      status = "success";
      message = "구매 성공";
    }
  } catch (error) {
    message = filterError(error.message);
    console.log(`⚠️ 상황 발생: ${message}`);
    
    // 구매에 실패했어도 아까 긁어온 잔액이 있다면 그 값을 유지합니다.
    if (currentBalance === 0) {
      // 에러 메시지 내부에서 숫자를 다시 한번 찾아봅니다.
      const match = error.message.match(/([\d,]+)원/);
      if (match) currentBalance = parseInt(match[1].replace(/,/g, ''), 10);
    }
  }

  // 4. 결과 저장 (가짜 데이터 없이 실제 긁어온 값만 저장)
  saveResult(currentBalance, status, message);
};

function filterError(rawMsg) {
  if (rawMsg.includes("한도") || rawMsg.includes("5,000원")) return "오늘 구매 한도를 초과했습니다.";
  if (rawMsg.includes("예치금") || rawMsg.includes("잔액") || rawMsg.includes("부족")) return "예치금이 부족합니다.";
  if (rawMsg.includes("시간") || rawMsg.includes("점검")) return "현재 구매 가능 시간이 아닙니다.";
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
