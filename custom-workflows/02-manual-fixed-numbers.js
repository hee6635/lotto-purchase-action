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
                console.log(`⚠️ 구매 엔진 에러 감지: ${err.message}`);
                
                // 💡 [필터 업그레이드] 한국어 키워드 대폭 추가!
                const failReason = await page.evaluate((internalError) => {
                    const bodyText = document.body.innerText;
                    // 1. 화면 텍스트 정밀 수색
                    if (bodyText.includes("구매 가능 시간이 아닙니다")) return "구매 가능 시간 아님 (06~24시)";
                    if (bodyText.includes("최대 5천원으로 제한")) return "이번 주 구매 한도 초과";
                    if (bodyText.includes("잔액이 부족")) return "예치금 잔액 부족";
                    
                    // 2. 발생한 에러 메시지 내용 분석 (한국어 포함)
                    if (internalError.includes("시간") || internalError.includes("time")) return "구매 가능 시간 아님";
                    if (internalError.includes("한도") || internalError.includes("limit")) return "구매 한도 초과";
                    if (internalError.includes("잔액") || internalError.includes("balance")) return "예치금 부족";
                    
                    return internalError.split('\n')[0]; // 그래도 모르면 에러 첫줄이라도 그대로 적기
                }, err.message).catch(() => "페이지 분석 실패");

                console.log(`💡 [최종 검시 결과]: ${failReason}`);
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

    return { status: finalStatus, balance: currentBalance };
}
