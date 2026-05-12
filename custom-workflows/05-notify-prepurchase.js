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
  } catch(e) { console.error("알람 발송 실패:", e); }
};

export default async function() {
  console.log("🔔 예약 구매 사전 알람 체크 시작...");
  
  let results = { reservation: null };
  try {
    if (fs.existsSync('result.json')) {
      results = JSON.parse(fs.readFileSync('result.json', 'utf8'));
    }
  } catch(e) { return; }

  const res = results.reservation;
  
  // 💡 예약이 활성화되어 있을 때만 알람 발송
  if (res && res.isActive) {
    const msg = `🔔 [로또 비서 알림]\n\n잠시 후 오후 5시에 예약 구매가 시작됩니다.\n- 구매 예정: 매주 ${res.count}게임\n- 기한: ${res.endDate.substring(0,4)}.${res.endDate.substring(4,6)}.${res.endDate.substring(6,8)} 까지`;
    await sendTelegram(msg);
    console.log("✅ 알람 발송 완료");
  } else {
    console.log("⏩ 활성화된 예약이 없어 알람을 스킵합니다.");
  }
}
