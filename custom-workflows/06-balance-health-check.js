import fs from 'fs';

// ── 텔레그램 발송 함수 ──
const sendTelegram = async (msg) => {
  try {
    const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const tgChatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (tgToken && tgChatId) {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChatId, text: msg })
      });
    }
  } catch(e) {
    console.error("텔레그램 발송 실패:", e);
  }
};

export default async function() {
  console.log("🕵️ 수요일 잔액 파수꾼 출근...");
  
  let results = { balance1: "0", balance2: "0", reservation: null };
  
  // 1. 장부 파일(result.json) 읽기
  try {
    if (fs.existsSync('result.json')) {
      results = JSON.parse(fs.readFileSync('result.json', 'utf8'));
    } else {
      console.log("⏩ result.json 파일이 없어 점검을 중단합니다.");
      return;
    }
  } catch(e) {
    console.error("파일 읽기 오류:", e);
    return;
  }

  const res = results.reservation;

  // 2. 예약이 활성화되어 있는지 확인
  if (!res || !res.isActive) {
    console.log("⏩ 활성화된 예약이 없어 점검을 종료합니다.");
    return;
  }

  // 잔액 숫자만 추출 (문자열인 경우 대비)
  const b1 = parseInt(results.balance1.replace(/[^0-9]/g, '')) || 0;
  const b2 = parseInt(results.balance2.replace(/[^0-9]/g, '')) || 0;
  
  let errorMsgs = [];
  const target = res.targetMode || 'both'; // 기본값은 부부 모두

  console.log(`🔎 점검 대상: ${target === 'both' ? '부부 모두' : target}`);

  // 3. 💡 예약 주인(targetMode)에 따른 맞춤형 잔액 검사
  
  // 계정 1 점검 대상일 때
  if (target === 'acc1' || target === 'both') {
    if (b1 < 5000) {
      errorMsgs.push(`🔴 계정 1 잔액 부족: 현재 ${b1.toLocaleString()}원 (5,000원 필요)`);
    }
  }

  // 계정 2 점검 대상일 때
  if (target === 'acc2' || target === 'both') {
    if (b2 < 5000) {
      errorMsgs.push(`🔴 계정 2 잔액 부족: 현재 ${b2.toLocaleString()}원 (5,000원 필요)`);
    }
  }

  // 4. 결과 보고
  if (errorMsgs.length > 0) {
    // ⚠️ 문제가 있을 때만 텔레그램 발송
    const msg = `🚨 [로또 잔액 파수꾼 경고]\n\n기술자님, 다음 주 구매를 위한 예치금이 부족합니다!\n\n${errorMsgs.join('\n')}\n\n어제 자동이체가 정상 처리되었는지 확인이 필요합니다.`;
    
    await sendTelegram(msg);
    console.log("❌ 점검 결과: 잔액 부족 알림 발송 완료");
  } else {
    // ✅ 정상이면 로그만 남기고 조용히 종료
    console.log("✅ 점검 결과: 모든 예약 계정의 잔액이 충분합니다.");
    
    // (선택 사항) 테스트 중이라면 아래 주석을 해제하여 정상 알림을 받아볼 수 있습니다.
    /*
    await sendTelegram(`✅ [파수꾼 보고] 모든 계정 잔액 정상입니다.\n계정1: ${b1.toLocaleString()}원\n계정2: ${b2.toLocaleString()}원`);
    */
  }
}
