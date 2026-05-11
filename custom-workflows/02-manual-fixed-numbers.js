import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";
    let finalStatus = "success";
    let finalMessage = "작업 완료";

    try {
        console.log("=== 🎯 잔액 조회 및 복합 로또 구매 ===");
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 1. 💰 API 직접 찌르기 (잔액 조회)
        console.log("📡 예치금 API 엔드포인트로 돌격합니다...");
        const response = await page.goto(
            'https://www.dhlottery.co.kr/mypage/selectUserMndp.do',
            { waitUntil: 'networkidle', timeout: 30000 }
        );
        
        const rawText = await response.text();
        const json = JSON.parse(rawText);
        
        if (json?.data?.userMndp?.crntEntrsAmt !== undefined) {
            currentBalance = String(json.data.userMndp.crntEntrsAmt);
            console.log(`✅ [대성공] 실시간 잔액 확인: ${currentBalance}원`);
        } else {
            throw new Error("JSON 구조 오류");
        }

    } catch (e) {
        console.log(`❌ API 호출 실패: ${e.message}`);
        finalStatus = "fail";
        finalMessage = "잔액 조회 실패";
    }

    // 2. 🚀 로봇의 분기점: 동기화(단순 조회) vs 실제 구매
    if (finalStatus === "success" && currentBalance !== "0") {
        
        let inputEnv = process.env.INPUT_LOTTO_NUMBERS || '';
        inputEnv = inputEnv.replace(/['"]/g, '').trim(); 

        // 💡 [핵심] 암호가 SYNC_ONLY면 여기서 바로 퇴근합니다!
        if (inputEnv === "SYNC_ONLY") {
            console.log("🔄 [동기화 모드] 예치금 조회가 완료되었습니다. 구매 프로세스를 생략합니다.");
            finalMessage = "최신 예치금 동기화 완료";
            
        } else if (parseInt(currentBalance) >= 1000) {
            // 암호가 없거나 번호면 원래 하던 대로 구매 진행
            try {
                let targetNumbersArray = [];
                if (inputEnv) {
                    targetNumbersArray = inputEnv.split(/[|_]/).map(group => {
                        return group.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
                    });
                } else {
                    targetNumbersArray = [[10, 16, 21, 37, 42, 45]]; 
                }

                const validGames = targetNumbersArray.filter(game => game.length === 6);
                if (validGames.length === 0) throw new Error("유효한 6자리 번호 조합이 없습니다.");

                console.log(`🚀 총 ${validGames.length}게임 구매 프로세스를 시도합니다...`);
                
                if (api.purchaseManual) {
                    await api.purchaseManual(validGames);
                    console.log(`✅ 구매 프로세스 완료!`);
                    finalMessage = `총 ${validGames.length}게임 구매 성공!`;
                }
            } catch (err) {
                console.log(`⚠️ 구매 엔진 에러 발생: ${err.message}`);
                const failReason = await page.evaluate(() => {
                    const text = document.body.innerText;
                    if (text.includes("최대 5천원으로 제한")) return "온라인 구매 한도(5게임) 초과";
                    if (text.includes("잔액이 부족")) return "예치금 잔액 부족";
                    const alertPopup = document.querySelector('#popupLayerAlert');
                    if (alertPopup && alertPopup.innerText.trim() !== '') return "시스템 알림: " + alertPopup.innerText.replace(/\n/g, ' ').trim();
                    return "알 수 없는 에러";
                }).catch(() => "현장 검증 실패 (페이지 튕김)");

                console.log(`💡 [현장 검시 결과]: ${failReason}`);
                finalStatus = "fail";
                finalMessage = failReason; 
            }
        } else {
            console.log("⚠️ 예치금이 부족하여 구매를 건너뜁니다.");
            finalStatus = "fail";
            finalMessage = "예치금 부족";
        }
    }

    // 3. 최신 결과 저장
    fs.writeFileSync('result.json', JSON.stringify({ 
        status: finalStatus, message: finalMessage, balance: currentBalance, last_run: new Date().toISOString() 
    }));

    return { status: finalStatus, balance: currentBalance };
}
