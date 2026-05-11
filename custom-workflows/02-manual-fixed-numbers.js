import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";
    let finalStatus = "success";
    let finalMessage = "작업 완료";
    let purchasedGames = [];

    try {
        console.log("=== 🎯 잔액 조회 및 복합 로또 구매 ===");
        await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
        const response = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle', timeout: 30000 });
        const json = JSON.parse(await response.text());
        if (json?.data?.userMndp?.crntEntrsAmt !== undefined) currentBalance = String(json.data.userMndp.crntEntrsAmt);
        else throw new Error("JSON 구조 오류");
    } catch (e) {
        finalStatus = "fail"; finalMessage = "잔액 조회 실패 (로그인 만료 가능성)";
    }

    let inputEnv = process.env.INPUT_LOTTO_NUMBERS || '';
    inputEnv = inputEnv.replace(/['"]/g, '').trim(); 

    if (finalStatus === "success" && currentBalance !== "0") {
        if (inputEnv === "SYNC_ONLY") {
            finalMessage = "최신 예치금 동기화 완료";
        } else if (parseInt(currentBalance) >= 1000) {
            try {
                let targetNumbersArray = [];
                if (inputEnv) {
                    targetNumbersArray = inputEnv.split(/[|_]/).map(group => group.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)));
                } else {
                    targetNumbersArray = [[10, 16, 21, 37, 42, 45]]; 
                }
                const validGames = targetNumbersArray.filter(game => game.length === 6);
                if (validGames.length === 0) throw new Error("유효한 번호 조합 없음");
                purchasedGames = validGames;

                console.log(`🚀 총 ${validGames.length}게임 구매 시도...`);
                if (api.purchaseManual) {
                    await api.purchaseManual(validGames);
                    finalMessage = `총 ${validGames.length}게임 구매 성공!`;
                }
            } catch (err) {
                const failReason = await page.evaluate((internalError) => {
                    const bodyText = document.body.innerText;
                    if (bodyText.includes("구매 가능 시간이 아닙니다")) return "구매 가능 시간 아님 (06~24시)";
                    if (bodyText.includes("최대 5천원으로 제한")) return "이번 주 구매 한도 초과";
                    if (bodyText.includes("잔액이 부족")) return "예치금 잔액 부족";
                    
                    if (internalError.includes("시간") || internalError.includes("time")) return "구매 가능 시간 아님";
                    if (internalError.includes("한도") || internalError.includes("limit")) return "구매 한도 초과";
                    if (internalError.includes("잔액") || internalError.includes("balance")) return "예치금 부족";
                    
                    return internalError.split('\n')[0]; 
                }, err.message).catch(() => "페이지 분석 실패");

                finalStatus = "fail";
                finalMessage = failReason; 
            }
        } else {
            finalStatus = "fail"; finalMessage = "예치금 부족";
        }
    }

    let historyLog = [];
    try {
        if (fs.existsSync('result.json')) {
            const oldData = JSON.parse(fs.readFileSync('result.json', 'utf8'));
            if (oldData.history) historyLog = oldData.history;
        }
    } catch(e) {}

    if (inputEnv !== "SYNC_ONLY") {
        historyLog.unshift({ date: new Date().toISOString(), status: finalStatus, message: finalMessage, games: purchasedGames });
        if (historyLog.length > 20) historyLog = historyLog.slice(0, 20);
    }

    fs.writeFileSync('result.json', JSON.stringify({ 
        status: finalStatus, message: finalMessage, balance: currentBalance, 
        last_run: new Date().toISOString(), history: historyLog 
    }));

    // 💡 [핵심] 텔레그램 알림 전송 엔진
    try {
        const tgToken = process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = process.env.TELEGRAM_CHAT_ID;
        
        if (tgToken && tgChatId) {
            let tgMessage = "";
            if (inputEnv === "SYNC_ONLY") {
                tgMessage = `📡 [로또 예치금 조회]\n- 잔액: ${Number(currentBalance).toLocaleString()}원`;
            } else if (finalStatus === "success") {
                tgMessage = `🎉 [로또 자동 구매 성공!]\n- 결제 후 잔액: ${Number(currentBalance).toLocaleString()}원\n\n[구매 번호]\n`;
                purchasedGames.forEach((g, i) => {
                    tgMessage += `${i + 1}게임: ${g.join(', ')}\n`;
                });
            } else {
                tgMessage = `⚠️ [로또 구매 실패]\n- 사유: ${finalMessage}\n- 현재 잔액: ${Number(currentBalance).toLocaleString()}원`;
            }

            // 텔레그램 서버로 문자 발송!
            await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: tgChatId, text: tgMessage })
            });
            console.log("텔레그램 알림 전송 완료!");
        } else {
            console.log("텔레그램 토큰이 설정되지 않아 알림을 생략합니다.");
        }
    } catch(e) {
        console.log("텔레그램 알림 전송 실패:", e);
    }

    return { status: finalStatus, balance: currentBalance };
}
