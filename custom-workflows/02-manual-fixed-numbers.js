import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";
    let finalStatus = "success";
    let finalMessage = "작업 완료";

    try {
        console.log("=== 🎯 [사용자 발견 API] 예치금 직접 호출 작전 ===");

        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 1. 💰 API 직접 찌르기 (완벽 검증됨)
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

    // 2. 🚀 실전 로또 구매 및 정밀 에러 분석
    if (finalStatus === "success" && currentBalance !== "0" && parseInt(currentBalance) >= 1000) {
        try {
            const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
            const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
            
            console.log("🚀 로또 구매 프로세스를 시도합니다...");
            if (api.purchaseManual) {
                await api.purchaseManual([targetNumbers]);
                console.log(`✅ 구매 프로세스 완료!`);
                finalMessage = "로또 구매 성공!";
            }
        } catch (err) {
            console.log(`⚠️ 구매 엔진 타임아웃/에러 발생: ${err.message}`);
            
            // 💡 [핵심] 실패 원인 정밀 검시관 출동
            const failReason = await page.evaluate(() => {
                const text = document.body.innerText;
                
                // 동행복권의 대표적인 실패 사유들을 화면에서 찾습니다.
                if (text.includes("최대 5천원으로 제한") || text.includes("최대 5천원")) {
                    return "이번 주 온라인 구매 한도(5게임/5,000원) 초과";
                }
                if (text.includes("잔액이 부족") || text.includes("예치금이 부족")) {
                    return "예치금 잔액 부족";
                }
                if (text.includes("판매시간이 아닙니다") || text.includes("판매 시간이 아닙니다")) {
                    return "로또 판매 시간이 아님";
                }
                
                // 팝업 경고창이 떠있다면 그 텍스트를 긁어옵니다.
                const alertPopup = document.querySelector('#popupLayerAlert');
                if (alertPopup && alertPopup.innerText.trim() !== '') {
                    return "시스템 알림: " + alertPopup.innerText.replace(/\n/g, ' ').trim();
                }
                
                return "알 수 없는 에러 (로그 확인 필요)";
            });

            console.log(`💡 [현장 검시 결과]: ${failReason}`);
            finalStatus = "fail";
            finalMessage = failReason; // 어플로 보낼 메시지 업데이트
        }
    } else if (finalStatus === "success") {
        console.log("⚠️ 잔액이 1,000원 미만이라 구매를 건너뜁니다.");
        finalStatus = "fail";
        finalMessage = "예치금 부족 (1,000원 미만)";
    }

    // 3. 결과 저장 (React 어플로 동기화)
    fs.writeFileSync('result.json', JSON.stringify({ 
        status: finalStatus,
        message: finalMessage,
        balance: currentBalance, 
        last_run: new Date().toISOString() 
    }));

    return { status: finalStatus, balance: currentBalance };
}
