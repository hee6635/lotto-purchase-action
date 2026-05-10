import fs from 'fs';

export default async ({ purchaseManual }) => {
  console.log('=== 리모컨 어플 연동: 현장 상황 보고 모드 ===');

  const rawNumbers = process.env.APP_NUMBERS;
  const targetNumbers = rawNumbers ? [rawNumbers.split(',').map(n => parseInt(n.trim(), 10))] : [[1, 2, 3, 4, 5, 6]];

  try {
    const purchased = await purchaseManual(targetNumbers);
    if (purchased && purchased.length > 0) {
      saveResult(purchased[0].balance, "success", "구매 성공");
    }
  } catch (error) {
    // 💡 사이트에서 뱉은 복잡한 에러 메시지를 깔끔하게 정제
    const cleanMsg = filterError(error.message);
    console.log(`⚠️ 현장 에러 감지: ${cleanMsg}`);
    
    // 실패 시에도 잔액 정보와 함께 실패 사유를 기록
    saveResult(15000, "fail", cleanMsg); 
  }
};

function filterError(rawMsg) {
  // 사이트에서 보내는 메시지 핵심 키워드 매칭
  if (rawMsg.includes("한도") || rawMsg.includes("5,000원")) {
    return "오늘 구매 한도(5,000원)를 초과했습니다.";
  }
  if (rawMsg.includes("예치금") || rawMsg.includes("잔액") || rawMsg.includes("부족")) {
    return "예치금이 부족합니다. 충전이 필요합니다.";
  }
  if (rawMsg.includes("시간") || rawMsg.includes("점검") || rawMsg.includes("24시")) {
    return "현재 구매 가능 시간이 아닙니다. (사이트 확인)";
  }
  if (rawMsg.includes("로그인") || rawMsg.includes("비밀번호")) {
    return "동행복권 로그인 실패 (ID/PW 확인 필요)";
  }
  
  // 키워드가 없으면 앞부분만 조금 잘라서 전달
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
