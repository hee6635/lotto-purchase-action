/**
 * 02. 리모컨 어플 연동 정밀 추적용 스크립트
 */
import fs from 'fs';

export default async ({ purchaseManual }) => {
  console.log('=== 리모컨 어플 연동 구매 및 상태 기록 시작 ===');

  // 1. 어플에서 보낸 번호 가져오기 (환경변수)
  const rawNumbers = process.env.APP_NUMBERS;
  let targetNumbers = [];

  if (rawNumbers && rawNumbers.trim() !== "") {
    console.log(`📱 어플 수신 번호: ${rawNumbers}`);
    targetNumbers = [rawNumbers.split(',').map(n => parseInt(n.trim(), 10))];
  } else {
    console.log('⚠️ 번호가 없어 기본 번호로 진행합니다.');
    targetNumbers = [[1, 2, 3, 4, 5, 6]];
  }

  try {
    // 2. 실제 구매 시도
    const purchased = await purchaseManual(targetNumbers);
    
    // 3. 구매 성공 시 잔액 및 상태 기록
    if (purchased && purchased.length > 0) {
      const realBalance = purchased[0].balance || 0;
      saveResult(realBalance, "success", "구매 성공");
      console.log(`✅ 성공: 현재 잔액 ${realBalance}원`);
    }
  } catch (error) {
    // 4. 실패 시 (한도초과, 로그인 에러 등) 상태 기록
    console.log(`⚠️ 구매 실패 사유: ${error.message}`);
    
    // 실패 시에도 잔액 조회를 시도하거나, 마지막 알려진 잔액 유지
    // 테스트 편의를 위해 실패 시에도 현재 잔액(예: 15000)을 기록하도록 세팅 가능
    saveResult(15000, "fail", error.message); 
  }
};

/**
 * 결과를 result.json 파일로 저장하는 함수
 */
function saveResult(balance, status, msg) {
  const resultData = {
    balance: balance,
    status: status,    // "success" 또는 "fail"
    message: msg,      // 상세 메시지
    last_run: new Date().toISOString() // 어플이 '최신 파일'인지 판단하는 기준
  };
  
  fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
  console.log(`💰 result.json 업데이트 완료 (${status})`);
}
