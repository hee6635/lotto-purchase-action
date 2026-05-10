import fs from 'fs';

export default async ({ purchaseManual, page }) => {
  console.log('=== 🚨 긴급 데이터 추출 및 동기화 모드 가동 ===');

  let currentBalance = 0;
  let status = "fail";
  let message = "";

  try {
    // 1. [접속] 일단 메인 페이지로 갑니다.
    console.log('📡 사이트 접속 시도...');
    await page.goto('https://dhlottery.co.kr/common.do?method=main', { waitUntil: 'networkidle', timeout: 60000 });
    
    // 2. [로그인 확인] 만약 로그인이 안 되어 있다면 구매 엔진을 통해 세션을 강제로 맺습니다.
    const isLoggedIn = await page.$('.btn_logout').catch(() => null);
    if (!isLoggedIn) {
      console.log('🔑 세션이 끊겨 있습니다. 재로그인 시도...');
      // 구매는 안 되더라도 이 함수가 실행되면 로그인은 처리됩니다.
      await purchaseManual([[1, 2, 3, 4, 5, 6]]).catch(() => {});
      await page.goto('https://dhlottery.co.kr/common.do?method=main');
    }

    // 3. [팝업 제거] 점검 안내 팝업 등이 앞을 가리고 있다면 강제로 닫거나 무시합니다.
    console.log('🧹 화면 가림막 제거 중...');
    await page.evaluate(() => {
        const popups = document.querySelectorAll('.popup, .layer_popup, #at_popup');
        popups.forEach(p => p.style.display = 'none');
    });

    // 4. [불도저 추출] 화면 전체의 텍스트를 긁어서 숫자를 뽑아냅니다.
    console.log('🔍 데이터 정밀 수색 중...');
    const extractedBalance = await page.evaluate(() => {
      // 화면 전체 텍스트를 가져와서 '예치금' 혹은 '총 잔액' 뒤의 숫자를 찾습니다.
      const bodyText = document.body.innerText;
      const regex = /(?:예치금|잔액|예치금 잔액)\s*[:]*\s*([\d,]+)/;
      const match = bodyText.match(regex);
      
      if (match && match[1]) return match[1];
      
      // 혹시 모르니 클래스명으로 한 번 더 시도
      const el = document.querySelector('.money strong') || document.querySelector('.user_info .money');
      return el ? el.innerText : null;
    });

    if (extractedBalance) {
      currentBalance = parseInt(extractedBalance.replace(/,/g, ''), 10);
      status = "success";
      message = "실시간 강제 동기화 성공";
      console.log(`✅ 확인된 진짜 잔액: ${currentBalance}원`);
    } else {
      status = "fail";
      message = "화면에서 잔액을 찾지 못함";
      console.log('❌ 숫자를 찾지 못했습니다. 화면 구성을 확인해야 합니다.');
    }

  } catch (error) {
    console.log('❌ 치명적 오류:', error.message);
    message = "데이터 추출 엔진 오류";
  }

  // 어떤 상황에서도 결과 기록 (기존 15000원 기록이 있다면 덮어씌워짐)
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
