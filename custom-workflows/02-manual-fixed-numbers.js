import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";
    let finalStatus = "success";
    let finalMessage = "작업 완료";
    let purchasedGames = [];

    // 1. 잔액 조회
    try {
        console.log("=== 🎯 잔액 조회 시작 ===");
        await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
        const response = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle', timeout: 30000 });
        const json = JSON.parse(await response.text());
        if (json?.data?.userMndp?.crntEntrsAmt !== undefined) currentBalance = String(json.data.userMndp.crntEntrsAmt);
        console.log(`💰 조회된 잔액: ${currentBalance}원`);
    } catch (e) {
        finalStatus = "fail"; finalMessage = "잔액 조회 실패";
        console.log("❌ 잔액 조회 중 에러 발생");
    }

    let inputEnv = (process.env.INPUT_LOTTO_NUMBERS || '').replace(/['"]/g, '').trim(); 

    // 2. 구매 로직 (생략 - 기존과 동일하게 작동)
    if (finalStatus === "success" && currentBalance !== "0" && inputEnv !== "SYNC_ONLY") {
        try {
            let targetNumbersArray = inputEnv ? inputEnv.split(/[|_]/).map(group => group.split(',').map(n => parseInt(n.trim(), 10))) : [[10, 16, 21, 37, 42, 45]];
            const validGames = targetNumbersArray.filter(game => game.length === 6);
            if (validGames.length > 0) {
                purchasedGames = validGames;
                if (api.purchaseManual) {
                    await api.purchaseManual(validGames);
                    finalMessage = `총 ${validGames.length}게임 구매 성공!`;
                }
            }
        } catch (err) {
            finalStatus = "fail"; finalMessage = "구매 엔진 에러";
        }
    }

    // 3. 장부 기록
    let historyLog = [];
    try {
        if (fs.existsSync('result.json')) historyLog = JSON.parse(fs.readFileSync('result.json', 'utf8')).history || [];
    } catch(e) {}
    if (inputEnv !== "SYNC_ONLY") {
        historyLog.unshift({ date: new Date().toISOString(), status: finalStatus, message: finalMessage, games: purchasedGames });
        if (historyLog.length > 20) historyLog = historyLog.slice(0, 20);
    }
    fs.writeFileSync('result.json', JSON.stringify({ status: finalStatus, message: finalMessage, balance: currentBalance, last_run: new Date().toISOString(), history: historyLog }));

    // 4. 🚀 [초강력 디버깅] 텔레그램 전송부
    console.log("=== 📨 텔레그램 발송 시도 ===");
    try {
        const tgToken = process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = process.env.TELEGRAM_CHAT_ID;

        // 정보가 제대로 들어왔는지 로그로 확인 (보안상 일부만 출력)
        console.log(`- Token 존재 여부: ${tgToken ? "YES (앞글자: " + tgToken.substring(0,4) + ")" : "NO"}`);
        console.log(`- Chat ID 존재 여부: ${tgChatId ? "YES (값: " + tgChatId + ")" : "NO"}`);

        if (tgToken && tgChatId) {
            let tgMessage = (inputEnv === "SYNC_ONLY") 
                ? `📡 [로또 예치금 조회]\n- 잔액: ${Number(currentBalance).toLocaleString()}원`
                : `🎉 [로또 구매 결과]\n- 상태: ${finalStatus === "success" ? "성공" : "실패(" + finalMessage + ")"}\n- 현재 잔액: ${Number(currentBalance).toLocaleString()}원`;

            // 전송 API 호출
            const url = `https://api.telegram.org/bot${tgToken}/sendMessage`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: tgChatId, text: tgMessage })
            });
            
            const resJson = await res.json();
            if (resJson.ok) console.log("✅ 텔레그램 서버가 메시지를 정상적으로 수신했습니다!");
            else console.log(`❌ 텔레그램 에러 발생: ${resJson.description}`);
        } else {
            console.log("⚠️ 텔레그램 설정값(Token 또는 ID)이 비어있습니다. 깃허브 Secrets를 확인하세요.");
        }
    } catch(e) {
        console.log("❌ 텔레그램 전송 코드 자체에서 충돌 발생:", e.message);
    }

    return { status: finalStatus, balance: currentBalance };
}
