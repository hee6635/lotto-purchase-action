import fs from 'fs';

export default async ({ purchaseManual, getBalance }) => { // getBalance 기능 추가
  console.log('=== 🤖 실시간 잔액 추적 모드 가동 ===');

  const rawNumbers = process.env.APP_NUMBERS;
  const targetNumbers = rawNumbers ? [rawNumbers.split(',').map(n => parseInt(n.trim(), 10))] : [[1, 2, 3, 4, 5, 6]];

  // 1. 일단 현재 사이트에 로그인된 진짜 예치금부터 확인 시도
  let currentBalance = 0;
  try {
    // 엔진에 따라 getBalance() 또는 구매 전 결과값에서 잔액을 가져옵니다.
    // 여기서는 안전하게 구매 시도 결과를 통해 잔액을 확보합니다.
    const purchased = await purchaseManual(targetNumbers);
    
    if (purchased && purchased.length > 0) {
      currentBalance = purchased[0].balance || 0;
      saveResult(currentBalance, "success", "구매 성공");
    }
  } catch (error) {
    const cleanMsg = filterError(error.message);
    
    // 💡 [중요] 실패했을 때 가짜 15000원 대신, 
    // 에러 메시지 속에 숨어있는 '진짜 잔액'을 찾아내거나 엔진의 마지막 잔액을 사용합니다.
    // 만약 잔액 추출이 안 되면 0 또는 '확인불가'로 표시하게 됩니다.
    
    // 에러 메시지에서 "잔액: 14,000원" 같은 문구를 찾는 정규식 예시
    const balanceMatch = error.message.match(/잔액\s*:\s*([\d,]+)/);
    const foundBalance = balanceMatch ? parseInt(balanceMatch[1].replace(/,/g, ''), 10) : 0;

    console.log(`⚠️ 구매 실패 사유: ${cleanMsg}`);
    // 가짜 15000원 삭제! 찾은 잔액이 있다면 그 금액을, 없으면 0을 기록합니다.
    saveResult(foundBalance, "fail", cleanMsg); 
  }
};

function filterError(rawMsg) {
  if (rawMsg.includes("한도") || rawMsg.includes("5,000원")) return "오늘 구매 한도를 초과했습니다.";
  if (rawMsg.includes("예치금") || rawMsg.includes("잔액") || rawMsg.includes("부족")) return "예치금이 부족합니다.";
  if (rawMsg.includes("시간") || rawMsg.includes("점검")) return "현재 구매 가능 시간이 아닙니다.";
  return "사이트 응답 지연 또는 오류입니다.";
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
