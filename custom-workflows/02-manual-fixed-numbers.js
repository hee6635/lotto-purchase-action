import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    try {
        console.log("=== 🕵️‍♂️ [정밀 수색] 예치금 주변 핀포인트 디버그 가동 ===");

        // 1. 👻 스텔스 설정 (로봇 탐지 우회)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 📡 메인 페이지 접속
        console.log("📡 동행복권 접속 중...");
        await page.goto("https://dhlottery.co.kr/common.do?method=main", { 
            waitUntil: "networkidle", 
            timeout: 60000 
        });

        // 3. 💡 [사용자 제안 코드 적용] 예치금 주변 110자 정밀 스캔
        console.log("🔍 예치금 단어 주변 환경을 정찰합니다...");
        const debugText = await page.evaluate(() => {
            const full = document.body.innerText;
            const idx = full.indexOf("예치금");
            if (idx === -1) return "❌ [경보] 페이지 전체에서 '예치금' 키워드를 찾을 수 없음";
            
            // 키워드 발견 시 앞 10자, 뒤 100자를 잘라서 문맥 파악
            return full.substring(Math.max(0, idx - 10), Math.min(full.length, idx + 100)).replace(/\n/g, ' ');
        });

        console.log("==========================================");
        console.log("👀 [현장 보고서] 예치금 주변 텍스트:");
        console.log(debugText);
        console.log("==========================================");

        // 4. ⏳ 잔액 추적 (사용자 제안 10초 대기 로직)
        console.log("⏳ 숫자가 0원에서 변할 때까지 대기 중...");
        currentBalance = await page.evaluate(async () => {
            const delay = ms => new Promise(res => setTimeout(res, ms));
            for (let i = 0; i < 10; i++) {
                const text = document.body.innerText;
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

    // 5. 🚀 실전 구매 시도
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        if (api.purchaseManual && currentBalance !== "0") {
            await api.purchaseManual([targetNumbers]);
            console.log("✅ 구매 프로세스 가동 완료");
        }
    } catch (err) {
        console.log(`알림: ${err.message}`);
    }

    // 결과 저장
    const resultData = { balance: currentBalance, last_run: new Date().toISOString() };
    fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));

    return { status: "success", balance: currentBalance };
}
