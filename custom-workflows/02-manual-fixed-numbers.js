import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    try {
        console.log("=== 📡 [네트워크 통신망 가로채기] 감시 모드 가동 ===");

        // 1. 🔍 [추적 모드] 서버가 보내는 모든 응답을 실시간 감시
        page.on('response', async (response) => {
            try {
                const url = response.url();
                // 잔액 데이터가 포함된 API 주소를 포착했을 때
                if (url.includes("cashBalanceApi") || url.includes("cashBalance")) {
                    const json = await response.json();
                    console.log("------------------------------------------");
                    console.log("🎯 [서버 응답 가로채기 성공!]");
                    console.log(JSON.stringify(json, null, 2));
                    
                    if (json.cashBalance) {
                        currentBalance = json.cashBalance.replace(/[^0-9]/g, '');
                        console.log(`💰 확인된 진짜 잔액: ${currentBalance}원`);
                    }
                    console.log("------------------------------------------");
                }
            } catch (e) {
                // 응답이 JSON이 아닌 경우는 무시
            }
        });

        // 2. 메인 페이지 접속 (접속하면 자동으로 위 응답 리스너가 가로챕니다)
        console.log("📡 데이터 포착을 위해 메인 페이지 접속 중...");
        await page.goto("https://dhlottery.co.kr/common.do?method=main", { waitUntil: "networkidle" });
        
        // 데이터가 날아올 때까지 잠시 대기
        await page.waitForTimeout(5000);

        // 3. 만약 위에서 가로채지 못했다면 최후의 수단으로 직접 변수 확인
        if (currentBalance === "--" || currentBalance === "0") {
            console.log("⚠️ 자동 가로채기 실패, 수동으로 서버에 재요청합니다...");
            const manualResult = await page.evaluate(async () => {
                const res = await fetch("/user.do?method=cashBalanceApi");
                return await res.json();
            });
            console.log("👀 [수동 요청 결과]:", JSON.stringify(manualResult));
            if (manualResult.cashBalance) {
                currentBalance = manualResult.cashBalance.replace(/[^0-9]/g, '');
            }
        }

        console.log(`✅ 최종 확정 잔액: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 작업 중 에러 발생: ${e.message}`);
        status = "fail";
    }

    // 4. 로또 구매 로직 (시간 제한 없이 시도)
    console.log("🚀 로또 실전 구매를 시도합니다.");
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        
        if (api.purchaseManual) {
            await api.purchaseManual([targetNumbers]);
            console.log(`✅ 구매 성공: [${targetNumbers.join(', ')}]`);
            message = "구매 및 잔액 업데이트 완료";
        }
    } catch (err) {
        console.log(`❌ 구매 결과 알림: ${err.message}`);
        message = `알림: ${err.message}`;
    }

    // 결과 저장
    try {
        const resultData = { balance: currentBalance, status, message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
