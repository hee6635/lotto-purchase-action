import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    // 🔍 타격 목표 (돈이 흐르는 두 개의 성지)
    const moneyGates = [
        { name: "로또 구매창", url: "https://ol.dhlottery.co.kr/olotto/game/game645.do" },
        { name: "연금복권 구매창", url: "https://el.dhlottery.co.kr/pension720.do?method=pension720Buy" }
    ];

    try {
        console.log("=== 🎯 [교차 검증] 로또 & 연금복권 구매창 정밀 스캔 시작 ===");

        // 1. 👻 신분 위장 (스텔스 모드)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        for (const gate of moneyGates) {
            console.log(`📡 [수색] ${gate.name} 진입 중...`);
            try {
                await page.goto(gate.url, { waitUntil: 'networkidle', timeout: 20000 });
                await page.waitForTimeout(3000); // 숫자 데이터 로딩 대기

                const found = await page.evaluate(() => {
                    const text = document.body.innerText;
                    // '보유예치금' 또는 '예치금' 뒤에 오는 숫자를 낚아챕니다.
                    const match = text.match(/(?:보유예치금|예치금)\s*([\d,]+)\s*원/);
                    return match ? match[1].replace(/,/g, '') : "0";
                });

                if (found !== "0") {
                    currentBalance = found;
                    console.log(`✅ [성공] ${gate.name}에서 ${currentBalance}원 포착!`);
                    break; // 잔액을 찾았으면 다음 페이지는 안 가도 됩니다.
                } else {
                    console.log(`⚠️ ${gate.name}에서 잔액을 찾지 못했습니다 (0원 혹은 로딩 실패).`);
                }
            } catch (e) {
                console.log(`❌ ${gate.name} 접속 중 오류 발생: ${e.message}`);
            }
        }

    } catch (e) {
        console.log(`❌ 전체 공정 에러: ${e.message}`);
    }

    console.log(`🏁 최종 확정 잔액: ${currentBalance}원`);

    // 🚀 [실전 구매] 6시가 넘었으므로 구매 시도
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        
        if (api.purchaseManual && currentBalance !== "0") {
            console.log("🚀 로또 구매 프로세스 가동...");
            await api.purchaseManual([targetNumbers]);
            console.log(`✅ 구매 완료! 번호: [${targetNumbers.join(', ')}]`);
        }
    } catch (err) {
        console.log(`알림: ${err.message}`);
    }

    // 결과 저장 (어플 동기화용)
    fs.writeFileSync('result.json', JSON.stringify({ 
        balance: currentBalance, 
        last_run: new Date().toISOString() 
    }));

    return { status: "success", balance: currentBalance };
}
