import fs from 'fs';

export default async ({ purchaseManual, page }) => {
  console.log('=== ⚡ 실시간 잔액 강제 동기화 가동 ===');

  let currentBalance = 0;
  let status = "fail";
  let message = "";

  try {
    // 1. [강제 로그인 시도] 구매 엔진을 통해 로그인을 먼저 시도합니다.
    console.log('🔑 세션 확보 중...');
    // 구매는 실패하더라도 이 과정에서 로그인은 완료됩니다.
    await purchaseManual([[1, 2, 3, 4, 5, 6]]).catch(() => console.log("구매 시도는 차단됨 (무시하고 잔액 확인 진행)"));

    // 2. [불도저 잔액 찾기] 사이트 메인으로 이동
    await page.goto('https://dhlottery.co.kr/common.do?method=main', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 3. [정밀 타격] 여러 가지 가능성 있는 잔액 위치를 다 뒤집니다.
    const balance = await page.evaluate(() => {
      // 방법 A: 표준 예치금 위치
      const el1 = document.querySelector('.money strong');
      // 방법 B: 유저 정보 섹션
      const el2 = document.querySelector('.user_info .money');
      // 방법 C: 텍스트로 '원' 앞에 있는 숫자 찾기
      const allTexts = document.body.innerText;
      const match = allTexts.match(/예치금\s*([\d,]+)원/) || allTexts.match(/잔액\s*([\d,]+)원/);
      
      if (el1) return el1.innerText;
      if (el2) return el2.innerText;
      if (match) return match[1];
      return null;
    });

    if (balance) {
      currentBalance = parseInt(balance.replace(/,/g, ''), 10);
      status = "success";
      message = "실시간 동기화 완료";
      console.log(`✅ 현장 잔액 확인 성공: ${currentBalance}원`);
    } else {
      message = "로그인 세션 확인 불가";
      console.log('❌ 숫자를 찾지 못했습니다. (로그인 안 됨)');
    }

  } catch (error) {
    console.log('❌ 에러 발생:', error.message);
    message = "데이터 추출 실패";
  }

  // 4. 어떤 상황에서도 확보된 숫자를 기록 (가짜 15000원 완전 삭제)
  saveResult(currentBalance, status, message);
};

function saveResult(balance, status, msg) {
  const resultData = {
    balance: balance,
    status: status,
    message: msg,
    last_run: new Date().toISOString()
  };
  fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
}
