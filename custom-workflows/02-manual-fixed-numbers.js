import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    try {
        console.log("=== 🕵️‍♂️ [현장 검증] 스텔스 접속 및 텍스트 덤프 가동 ===");

        // 1. 👻 스텔스 설정 (로봇 탐지 우회)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 📡 메인 페이지 접속 (PC 버전)
        console.log("📡 동행복권 PC 메인 접속 중...");
        await page.goto("https://dhlottery.co.kr/common.do?method=main", { 
            waitUntil: "networkidle", 
            timeout: 60000 
        });

        // 3. 💡 [사용자 제안 코드 추가] 로봇의 시야를 로그로 강제 출력
        const debugText = await page.evaluate(() => {
            // 앞부분 1000자 정도를 긁어옵니다. (로그인 여부, 잔액 텍스트 포함 확인용)
            return document.body.innerText.substring(0, 1000);
        });
        
        console.log("==========================================");
        console.log("👀 [사용자 디버그] 로봇이 보고 있는 실시간 텍스트:");
        console.log(debugText);
        console.log("==========================================");

        // 4. ⏳ 잔액이 0원이 아닐 때까지 버티기 (사용자 제안 로직)
        console.log("⏳ 데이터가 0원에서 숫자로 바뀌는지 지켜봅니다 (최대 10초)...");
        currentBalance = await page.evaluate(async () => {
            const delay = ms => new Promise(res => setTimeout(res, ms));
            
            for (let i = 0; i < 10; i++) {
                const text = document.body.innerText;
                // '예치금' 뒤에 숫자가 오는지 확인
                const match = text.match(/예치금\s*[:\n]?\s*([\d,]+)\s*원/);
                
                if (match) {
                    const val = match[1].replace(/,/g, '');
                    if (val !== "0" && val !== "") return val;
                }
                await delay(1000);
            }
            return "0";
        });

        console.log(`✅ 최종 포착 잔액: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 작업 중 에러: ${e.message}`);
    }

    // 5. 🚀 실전 구매 시도 (로그인 성공 메시지가 보인다면 진행)
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        if (api.purchaseManual && currentBalance !== "0") {
            await api.purchaseManual([targetNumbers]);
            console.log("✅ 구매 프로세스 완료");
        }
    } catch (err) {
        console.log(`알림: ${err.message}`);
    }

    // 결과 저장
    const resultData = { balance: currentBalance, last_run: new Date().toISOString() };
    fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));

    return { status: "success", balance: currentBalance };
}
