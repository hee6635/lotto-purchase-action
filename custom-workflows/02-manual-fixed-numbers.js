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
        finalStatus = "fail"; finalMessage = "잔액 조회 실패 (로그인 만료 또는 점검중)";
    }

    let inputEnv = (process.env.INPUT_LOTTO_NUMBERS || '').replace(/['"]/g, '').trim(); 

    // 2. 구매 로직 및 초정밀 에러 분석
    if (finalStatus === "success" && currentBalance !== "0" && inputEnv !== "SYNC_ONLY") {
        try {
            let targetNumbersArray = inputEnv ? inputEnv.split(/[|_]/).map(group => group.split(',').map(n => parseInt(n.trim(), 10))) : [[10, 16, 21, 37, 42, 45]];
            const validGames = targetNumbersArray.filter(game => game.length === 6);
            if (validGames.length > 0) {
                purchasedGames = validGames;
                console.log(`🚀 총 ${validGames.length}게임 구매 시도...`);
                if (api.purchaseManual) {
                    await api.purchaseManual(validGames);
                    finalMessage = `총 ${validGames.length}게임 구매 완료!`;
                }
            }
        } catch (err) {
            // 💡 [핵심] 실패 사유를 화면 글자와 에러 코드에서 정밀하게 뽑아냅니다.
            let failReason = "알 수 없는 구매 엔진 에러";
            try {
                failReason = await page.evaluate((internalError) => {
                    const bodyText = document.body.innerText;
                    if (bodyText.includes("구매 가능 시간이 아닙니다") || bodyText.includes("판매시간이 아닙니다")) return "구매 가능 시간 아님 (매일 06시~24시 / 토요일 06시~20시)";
                    if (bodyText.includes("최대 5천원으로 제한")) return "이번 주 구매 한도 초과 (1계정당 5게임 제한)";
                    if (bodyText.includes("잔액이 부족")) return "예치금 잔액 부족";
                    if (bodyText.includes("동행복권 시스템 점검")) return "동행복권 시스템 점검 중";
                    
                    const lowerErr = internalError.toLowerCase();
                    if (lowerErr.includes("time") || lowerErr.includes("closed")) return "구매 가능 시간 아님";
                    if (lowerErr.includes("limit")) return "이번 주 구매 한도 초과";
                    if (lowerErr.includes("balance")) return "예치금 잔액 부족";
                    
                    return internalError.split('\n')[0]; // 영어 에러의 첫 줄만 깔끔하게 따오기
                }, err.message);
            } catch(e) {
                if (err.message.includes("Timeout")) failReason = "동행복권 서버 응답 시간 초과";
                else failReason = err.message.split('\n')[0];
            }
            finalStatus = "fail"; 
            finalMessage = failReason;
        }
    }

    // 3. 장부(result.json) 기록
    let historyLog = [];
    try {
        if (fs.existsSync('result.json')) historyLog = JSON.parse(fs.readFileSync('result.json', 'utf8')).history || [];
    } catch(e) {}
    
    if (inputEnv !== "SYNC_ONLY") {
        historyLog.unshift({ date: new Date().toISOString(), status: finalStatus, message: finalMessage, games: purchasedGames });
        if (historyLog.length > 20) historyLog = historyLog.slice(0, 20); // 최근 20건만 유지
    }
    
    fs.writeFileSync('result.json', JSON.stringify({ status: finalStatus, message: finalMessage, balance: currentBalance, last_run: new Date().toISOString(), history: historyLog }));

    // 4. 📨 텔레그램 영수증 정교화 발송
    console.log("=== 📨 텔레그램 발송 시도 ===");
    try {
        const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
        const tgChatId = process.env.TELEGRAM_CHAT_ID?.trim();

        if (tgToken && tgChatId) {
            let tgMessage = "";
            
            if (inputEnv === "SYNC_ONLY") {
                tgMessage = `📡 [로또 예치금 동기화 완료]\n\n💰 현재 잔액: ${Number(currentBalance).toLocaleString()}원`;
            } 
            else if (finalStatus === "success") {
                // 💡 [성공 영수증] 구매한 번호를 예쁘게 나열해줍니다.
                let gamesText = "";
                purchasedGames.forEach((game, i) => {
                    gamesText += `[${i + 1}게임] ${game.join(", ")}\n`;
                });
                tgMessage = `🎉 [로또 구매 성공!]\n\n💰 결제 후 잔액: ${Number(currentBalance).toLocaleString()}원\n\n🎯 [구매 번호]\n${gamesText}`;
            } 
            else {
                // 💡 [실패 영수증] 실패 사유를 명확하게 경고해줍니다.
                tgMessage = `⚠️ [로또 구매 실패]\n\n🛑 사유: ${finalMessage}\n💰 현재 잔액: ${Number(currentBalance).toLocaleString()}원`;
            }

            const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: tgChatId, text: tgMessage })
            });
            
            const resJson = await res.json();
            if (resJson.ok) console.log("✅ 텔레그램 발송 성공!");
            else console.log(`❌ 텔레그램 발송 에러: ${resJson.description}`);
        } else {
            console.log("⚠️ 텔레그램 토큰 또는 Chat ID가 설정되지 않았습니다.");
        }
    } catch(e) { 
        console.log("❌ 발송 오류:", e.message); 
    }

    return { status: finalStatus, balance: currentBalance };
}
