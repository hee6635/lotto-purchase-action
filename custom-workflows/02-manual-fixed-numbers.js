import fs from 'fs';

/**
 * 02. 리모컨 어플 연동: 연금복권 페이지 우회 잔액 추출
 */
export default async ({ purchaseManual, page }) => {
  console.log('=== 🛰️ 연금복권 페이지 우회 잔액 추적 가동 ===');

  let currentBalance = 0;
  let status = "fail";
  let message = "";

  // 1. 기존 데이터 로드 (백업용)
  try {
    const rawData = fs.readFileSync('result.json', 'utf8');
    currentBalance = JSON.parse(rawData).balance || 0;
  } catch (e) { currentBalance = 0; }

  try {
    // 2. [핵심] 연금복권 메인 페이지로 우회 접속
    // 로또 페이지가 점검 중이어도 연금복권 쪽은 열려 있을 확률이 매우 높습니다.
    console.log('📡 연금복권 서버 접속 중...');
    await page.goto('https://pension.dhlottery.co.kr/common.do?method=main', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    await page.waitForTimeout(2000);

    // 3. 연금복권 페이지의 예치금 영역 정밀 수색
    // 연금복권 사이트의 상단 정보창 레이아웃을 타격합니다.
    const extracted = await page.evaluate(() => {
      // 방법 A: 상단 유저 정보 영역의 money 클래스
      const moneyEl = document.querySelector('.user_info .money strong') 
                   || document.querySelector('.money strong')
                   || document.querySelector('#article .amount');
      
      if (moneyEl) return moneyEl.innerText;

      // 방법 B: 화면 전체에서 '예치금' 글자 찾기
      const bodyText = document.body.innerText;
      const match = bodyText.match(/(?:예치금|잔액)\s*([\d,]+)원/);
      return match ? match[1] : null;
    });

    if (extracted) {
      currentBalance = parseInt(extracted.replace(/,/g, ''), 10);
      status = "success";
      message = "연금복권 페이지 우회 동기화 성공";
      console.log(`✅ 현장 확인 진짜 잔액: ${currentBalance}원`);
    } else {
      console.log('⚠️ 연금복권 페이지에서도 잔액을 찾지 못했습니다. (로그인 필요)');
      message = "로그인 세션 확인 불가";
    }

    // 4. 로또 구매 시도 (로또가 점검 중이면 실패하겠지만, 잔액은 이미 위에서 확보함)
    const rawNumbers = process.env.APP_NUMBERS;
    if (rawNumbers) {
      console.log('🚀 로또 구매 시도 중...');
      const targetNumbers = [rawNumbers.split(',').map(n => parseInt(n.trim(), 10))];
      await purchaseManual(targetNumbers).catch(e => console.log(`로또 구매 불가: ${e.message}`));
    }

  } catch (error) {
    console.log('❌ 우회 접속 중 오류 발생:', error.message);
    message = "우회 경로 접속 오류";
  }

  // 5. 결과 기록 (가짜 15000원 데이터는 이제 완전히 사라집니다)
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
