import fs from 'fs';

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
  } catch(e) {}
};

export default async function() {
  console.log("🕵️ 수요일 잔액 파수꾼 출근...");
  
  let results = { balance1: "0", balance2: "0", reservation: null };
  try {
    if (fs.existsSync('result.json')) {
      results = JSON.parse(fs.readFileSync('result.json', 'utf8'));
    }
  } catch(e) { return; }

  const b1 = parseInt(results.balance1.replace(/[^0-9]/g, '')) || 0;
  const b2 = parseInt(results.balance2.replace(/[^0-9]/g, '')) || 0;
  const res = results.reservation;

  if (!res || !res.isActive) return;

  // 💡 다음 주 구매를 위해 각 계정에 최소 5,000원씩 있는지 확인
  let errorMsgs = [];
  if (b1 < 5000) errorMsgs.push(`계정 1 잔액 부족 (${results.balance1})`);
  // 계정 2를 사용하는 모드(10게임)일 때만 계정 2 잔액 체크
  if (res.count > 5 && b2 < 5000) errorMsgs.push(`계정 2 잔액 부족 (${results.balance2})`);

  if (errorMsgs.length > 0) {
    const msg = `🚨 [로또 잔액 파수꾼 경고]\n\n어제 자동이체가 누락된 것 같습니다!\n\n${errorMsgs.join('\n')}\n\n지금 충전하지 않으면 다음 주 월요일 구매가 실패합니다.`;
    await sendTelegram(msg);
    console.log("❌ 문제 발견: 경고 발송 완료");
  } else {
    console.log("✅ 잔액 정상: 모든 계정 장전 완료.");
  }
}
