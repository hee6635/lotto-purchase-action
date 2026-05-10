import fs from 'fs';

export default async ({ purchaseManual, page }) => {
  console.log('=== 🛰️ 실시간 자산 관리 및 구매 시스템 가동 ===');

  let currentBalance = 0;
  let status = "fail";
  let message = "";

  try {
    // 1. [우선 순위 1] 메인 페이지 접속 및 로그인 상태 확인
    console.log('📡 동행복권 메인 접속 중...');
    await page.goto('https://dhlottery.co.kr/common.do?method=main');
    await page.waitForTimeout(3000); // 로딩 대기

    // 2. [핵심] 로또 구매와 상관없이 화면에 보이는 예치금 무조건 긁어오기
    // 로그인만 되어 있다면 메인 페이지의 잔액은 항상 보입니다.
    const balanceText = await page.$eval('.money strong', el => el.innerText).catch(() => null);
    
    if (balanceText) {
      currentBalance = parseInt(balanceText.replace(/,/g, ''), 10);
      console.log(`💰 현장 확인 진짜 잔액: ${currentBalance}원`);
    } else {
      console.log('⚠️ 로그인 세션이 없거나 잔액을 찾을 수 없습니다.');
    }

    // 3. [우선 순위 2] 이제 로또 구매를 시도합니다.
    const rawNumbers = process.env.APP_NUMBERS;
    const targetNumbers = rawNumbers ? [rawNumbers.split(',').map(n => parseInt(n.trim(), 10))] : [[1, 2, 3, 4, 5, 6]];
    
    try {
      const purchased = await purchaseManual(targetNumbers);
      if (purchased && purchased.length > 0) {
        currentBalance = purchased[0].balance || currentBalance;
        status = "success";
        message = "구매 성공";
      }
    } catch (buyError) {
      // 💡 로또 구매가 실패해도 괜찮습니다. 이미 위에서 잔액은 확보했습니다.
      message = filterError(buyError.message);
      console.log(`⚠️ 로또 구매만 실패: ${message}`);
    }

  } catch (globalError) {
    console.log('❌ 치명적 시스템 오류:', globalError.message);
    message = "사이트 접속 오류";
  }

  // 4. 어떤 상황에서도 확보된 '진짜 잔액'을 저장합니다. (15000 가짜 숫자 영구 삭제)
  saveResult(currentBalance, status, message);
};

function filterError(rawMsg) {
  if (rawMsg.includes("한도")) return "오늘 구매 한도를 초과했습니다.";
  if (rawMsg.includes("예치금") || rawMsg.includes("부족")) return "예치금이 부족합니다.";
  if (rawMsg.includes("시간") || rawMsg.includes("점검")) return "로또 판매 마감 시간입니다.";
  return "로또 시스템 일시적 제한";
}

function saveResult(balance, status, msg) {
  const resultData = {
    balance: balance,
    status: status,
    message: msg,
    last_run: new Date().toISOString()
  };
  fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
  console.log(`📊 최종 보고: 잔액 ${balance}원 / 상태 ${status}`);
}
