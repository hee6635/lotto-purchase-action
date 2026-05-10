import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) {
        return { status: "fail", message: "조종기 연결 실패" };
    }

    try {
        console.log("=== 📡 [통합 감시 모드] API 데이터 + 화면 상태 추적 ===");
        
        // 1. 메인 접속
        console.log("📡 동행복권 메인 접속 중...");
        await page.goto("https://dhlottery.co.kr/common.do?method=main", { waitUntil: "networkidle" });
        await page.waitForTimeout(3000);

        // 2. 🔍 [추적 1] 현재 화면 텍스트 감시
        const allText = await page.evaluate(() => document.body.innerText);
        console.log("------------------------------------------");
        console.log("👀 [감시 1: 현재 페이지 텍스트 상태]");
        console.log(allText.substring(0, 600)); // 앞부분 600자만 출력
        console.log("------------------------------------------");

        // 3. 🔍 [추적 2] 서버 API 직접 호출 및 데이터 탈취
        console.log("🔍 서버 데이터 패킷(JSON) 탈취 시도...");
        const apiResponse = await page.evaluate(async () => {
            try {
                const response = await fetch("https://dhlottery.co.kr/user.do?method=cashBalanceApi");
                return await response.json();
            } catch (e) {
                return { error: e.message };
            }
        });

        console.log("------------------------------------------");
        console.log("👀 [감시 2: 서버 API 응답 원본 데이터]");
        console.log(JSON.stringify(apiResponse, null, 2));
        console.log("------------------------------------------");

        // 4. 데이터 검증
        if (apiResponse && apiResponse.cashBalance) {
            currentBalance = apiResponse.cashBalance.replace(/[^0-9]/g, '');
            console.log(`✅ 최종 잔액 확정: ${currentBalance}원`);
        } else {
            console.log("⚠️ API 응답에 잔액이 없습니다. 세션 확인이 필요합니다.");
            currentBalance = "0";
        }

    } catch (e) {
        console.log(`❌ 추출 중 에러 발생: ${e.message}`);
        status = "fail";
        message = `에러: ${e.message}`;
    }

    // ⏰ 6시 기준 구매 판단
    const kstTime = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTime.getHours();

    if (hour >= 6) {
        console.log("🚀 6시가 지났습니다! 실전 구매 가동!");
        try {
            const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
            const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
            if (api.purchaseManual) {
                await api.purchaseManual([targetNumbers]);
                console.log(`✅ 구매 성공: [${targetNumbers.join(', ')}]`);
                message = "로또 구매 성공!";
            }
        } catch (err) {
            console.log(`❌ 구매 에러: ${err.message}`);
            message = `구매 에러: ${err.message}`;
        }
    } else {
        console.log("⚠️ 점검 시간(00-06시)입니다. 잔액 정보만 저장합니다.");
        message = "잔액 동기화 완료 (점검시간)";
    }

    // 결과 저장
    try {
        const resultData = { balance: currentBalance, status, message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
