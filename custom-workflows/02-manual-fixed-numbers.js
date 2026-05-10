import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let lottoBalance = "미확인";
    let pensionBalance = "미확인";
    let currentBalance = "0";

    const moneyGates = [
        { name: "로또 구매창", url: "https://ol.dhlottery.co.kr/olotto/game/game645.do" },
        { name: "연금복권 구매창", url: "https://el.dhlottery.co.kr/pension720.do?method=pension720Buy" }
    ];

    try {
        console.log("=== 🕵️‍♂️ [테스트 모드] 전 구역 교차 검증 스캔 가동 ===");

        // 1. 신분 위장 (스텔스 유지)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        for (const gate of moneyGates) {
            console.log(`📡 [테스트 중] ${gate.name} 진입 중...`);
            try {
                await page.goto(gate.url, { waitUntil: 'networkidle', timeout: 30000 });
                await page.waitForTimeout(3000); 

                const found = await page.evaluate(() => {
                    const text = document.body.innerText;
                    const match = text.match(/(?:보유예치금|예치금)\s*([\d,]+)\s*원/);
                    return match ? match[1].replace(/,/g, '') : "0";
                });

                // 💡 [테스트 포인트] 찾았어도 멈추지 않고 기록만 남깁니다.
                if (gate.name === "로또 구매창") {
                    lottoBalance = found;
                    console.log(`📍 로또 창 확인 결과: ${found}원`);
                } else {
                    pensionBalance = found;
                    console.log(`📍 연금복권 창 확인 결과: ${found}원`);
                }

                if (found !== "0") currentBalance = found; // 유효한 잔액 업데이트

            } catch (e) {
                console.log(`⚠️ ${gate.name} 스캔 실패: ${e.message}`);
            }
        }

        console.log("------------------------------------------");
        console.log(`📊 [최종 테스트 보고서]`);
        console.log(`1. 로또 페이지 잔액: ${lottoBalance}원`);
        console.log(`2. 연금 페이지 잔액: ${pensionBalance}원`);
        console.log("------------------------------------------");

    } catch (e) {
        console.log(`❌ 테스트 공정 전체 에러: ${e.message}`);
    }

    // 🚀 실전 구매 프로세스
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        if (api.purchaseManual && currentBalance !== "0") {
            await api.purchaseManual([targetNumbers]);
            console.log(`✅ 구매 시도 완료 (최종 잔액: ${currentBalance}원)`);
        }
    } catch (err) {
        console.log(`알림: ${err.message}`);
    }

    // 결과 저장
    fs.writeFileSync('result.json', JSON.stringify({ 
        balance: currentBalance, 
        lotto: lottoBalance,
        pension: pensionBalance,
        last_run: new Date().toISOString() 
    }));

    return { status: "success", balance: currentBalance };
}
