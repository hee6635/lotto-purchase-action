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

        // 1. 💰 API 직접 찌르기
        console.log("📡 예치금 API 엔드포인트로 돌격합니다...");
        const response = await page.goto(
            'https://www.dhlottery.co.kr/mypage/selectUserMndp.do',
            { waitUntil: 'networkidle', timeout: 30000 }
        );
        
        const rawText = await response.text();
        const json = JSON.parse(rawText);
        
        if (json?.data?.userMndp?.crntEntrsAmt !== undefined) {
            currentBalance = String(json.data.userMndp.crntEntrsAmt);
            console.log(`✅ [대성공] 잔액 API 직접 호출 성공: ${currentBalance}원`);
        } else {
            throw new Error("JSON 구조 오류");
        }

    } catch (e) {
        console.log(`❌ API 호출 실패: ${e.message}`);
        finalStatus = "fail";
        finalMessage = "잔액 조회 실패";
    }

    // 2. 🚀 [핵심] 방탄 필터가 적용된 다중 구매 로직
    if (finalStatus === "success" && currentBalance !== "0" && parseInt(currentBalance) >= 1000) {
        try {
            // 💡 혹시 모를 따옴표나 불필요한 공백을 1차로 싹 날립니다.
            let inputEnv = process.env.INPUT_LOTTO_NUMBERS || '';
            inputEnv = inputEnv.replace(/['"]/g, '').trim(); 
            
            let targetNumbersArray = [];
            
            if (inputEnv) {
                // 💡 [핵심] 파이프(|)로 오든 언더바(_)로 오든 완벽하게 쪼갭니다! (정규식 사용)
                targetNumbersArray = inputEnv.split(/[|_]/).map(group => {
                    return group.split(',')
                                .map(n => parseInt(n.trim(), 10))
                                .filter(n => !isNaN(n)); // NaN 같은 불순물 완벽 제거
                });
            } else {
                // 아무것도 안 들어오면 기본값 1게임
                targetNumbersArray = [[10, 16, 21, 37, 42, 45]]; 
            }

            // 💡 디버그용 엑스레이 로그 (어플이 뭘 보냈는지, 로봇이 어떻게 이해했는지 출력)
            console.log(`💡 수신된 데이터 원본: [${inputEnv}]`);
            console.log(`💡 파싱된 장바구니: ${JSON.stringify(targetNumbersArray)}`);

            // 💡 정상적인 6자리 번호인 게임만 안전하게 카트에 담습니다.
            const validGames = targetNumbersArray.filter(game => game.length === 6);

            if (validGames.length === 0) {
                throw new Error("유효한 6자리 번호 조합이 없습니다.");
            }

            console.log(`🚀 총 ${validGames.length}게임 구매 프로세스를 시도합니다...`);
            
            if (api.purchaseManual) {
                await api.purchaseManual(validGames);
                console.log(`✅ 구매 프로세스 완료!`);
                finalMessage = `총 ${validGames.length}게임 구매 성공!`;
            }
        } catch (err) {
            console.log(`⚠️ 구매 엔진 에러 발생: ${err.message}`);
            
            // 현장 검시관 (에러 원인 분석)
            const failReason = await page.evaluate(() => {
                const text = document.body.innerText;
                if (text.includes("최대 5천원으로 제한")) return "온라인 구매 한도(5게임) 초과";
                if (text.includes("잔액이 부족")) return "예치금 잔액 부족";
                const alertPopup = document.querySelector('#popupLayerAlert');
                if (alertPopup && alertPopup.innerText.trim() !== '') {
                    return "시스템 알림: " + alertPopup.innerText.replace(/\n/g, ' ').trim();
                }
                return "알 수 없는 에러";
            }).catch(() => "현장 검증 실패 (페이지 튕김)");

            console.log(`💡 [현장 검시 결과]: ${failReason}`);
            finalStatus = "fail";
            finalMessage = failReason; 
        }
    } else if (finalStatus === "success") {
        console.log("⚠️ 잔액이 부족하여 구매를 건너뜁니다.");
        finalStatus = "fail";
        finalMessage = "예치금 부족";
    }

    // 3. 결과 저장
    fs.writeFileSync('result.json', JSON.stringify({ 
        status: finalStatus,
        message: finalMessage,
        balance: currentBalance, 
        last_run: new Date().toISOString() 
    }));

    return { status: finalStatus, balance: currentBalance };
}
