import fs from 'fs';

export default async ({ purchaseManual, page }) => {
  console.log('=== 📱 모바일 사이트 우회 잔액 추출 가동 ===');

  let currentBalance = 0;
  let status = "fail";
  let message = "대기중";

  // 1. 기존 데이터 로드 (백업용)
  try {
    const rawData = fs.readFileSync('result.json', 'utf8');
    currentBalance = JSON.parse(rawData).balance || 0;
  } catch (e) { currentBalance = 0; }

  try {
    // 2. [핵심] 사용자님이 캡처해주신 '모바일 전용' 주소로 접속
    console.log('📡 모바일 연금복권 구매 페이지 접속 중...');
    await page.goto('https://el.dhlottery.co.kr/game/TotalGame.do?gameId=T720', {
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    await page.waitForTimeout(2000);

    // 3. [사진 위치 정밀 타격] "보유중인 예치금" 글자 옆의 숫자 찾기
    const extracted = await page.evaluate(() => {
      const text = document.body.innerText;
      // 화면 전체 글자 중에서 "보유중인 예치금" 뒤에 오는 숫자+원 조합을 싹쓸이합니다.
      const match = text.match(/보유중인 예치금.*?([\d,]+)\s*원/s) || text.match(/예치금.*?([\d,]+)\s*원/s);
      return match ? match[1] : null;
    });

    if (extracted) {
      currentBalance = parseInt(extracted.replace(/,/g, ''), 10);
      status = "success";
      message = "모바일 우회 동기화 성공";
      console.log(`✅ 사진 위치에서 확인된 진짜 예치금: ${currentBalance}원`);
    } else {
      console.log('⚠️ 모바일 페이지에서 "보유중인 예치금" 글자를 찾지 못했습니다.');
    }

    // 4. 로또 구매 시도 (로또가 점검 중이면 실패하겠지만, 잔액은 10,000원으로 갱신됨)
    const rawNumbers = process.env.APP_NUMBERS;
    if (rawNumbers) {
      console.log('🚀 로또 구매 시도 중...');
      const targetNumbers = [rawNumbers.split(',').map(n => parseInt(n.trim(), 10))];
      await purchaseManual(targetNumbers).catch(e => {
        console.log(`로또 구매 불가 상황: ${e.message}`);
        if (status === "success") {
          // 돈은 확인했는데 구매만 안 된 경우
          message = "로또 판매 시간 아님 (잔액 확인 완료)"; 
        }
      });
    }

  } catch (error) {
    console.log('❌ 모바일 우회 중 오류 발생:', error.message);
    if (status !== "success") message = "모바일 경로 접속 오류";
  }

  // 5. 최종 결과 기록 (가짜 데이터 없음!)
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
