import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    // 🔍 수사 대상 (가장 확률 높은 3곳)
    const targets = [
        { name: "모바일 메인", url: "https://m.dhlottery.co.kr/common.do?method=main" },
        { name: "예치금 내역", url: "https://m.dhlottery.co.kr/myPage.do?method=depositList" },
        { name: "로또 구매창", url: "https://ol.dhlottery.co.kr/olotto/game/game645.do" }
    ];

    console.log("=== 🕵️‍♂️ [핀포인트 전수 조사] 진짜 예치금을 찾아라 ===");

    for (const target of targets) {
        try {
            console.log(`📡 [수색 중] ${target.name} 접속...`);
            // 타임아웃을 30초로 늘려 타르핏(접속 지연) 방어
            await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(3000); // 데이터 로딩 대기

            const report = await page.evaluate((name) => {
                const fullText = document.body.innerText;
                const idx = fullText.indexOf("예치금");
                if (idx === -1) return `❌ ${name}: '예치금' 단어 없음 (로그인 상태 확인 필요)`;
                
                // 단어 주변 120자를 긁어 문맥 확인
                const snippet = fullText.substring(Math.max(0, idx - 20), idx + 100).replace(/\n/g, ' ');
                return `✅ ${name} 포착: ${snippet}`;
            }, target.name);

            console.log("------------------------------------------");
            console.log(report);
            console.log("------------------------------------------");

            // 💰 숫자 추출 시도 (0이 아닌 진짜 금액을 찾으면 즉시 중단)
            const match = report.match(/예치금\s*[:\n]?\s*([0-9,]+)/);
            if (match && match[1].replace(/,/g, '') !== "0") {
                currentBalance = match[1].replace(/,/g, '');
                console.log(`✨ [검거 성공] ${target.name}에서 잔액을 찾았습니다: ${currentBalance}원`);
                break; 
            }
        } catch (e) {
            console.log(`⚠️ ${target.name} 접속 실패: ${e.message}`);
        }
    }

    console.log(`🏁 최종 확정 잔액: ${currentBalance}원`);

    // 🚀 실전 구매 시도 (이미 로직은 정상 작동 확인됨!)
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        if (api.purchaseManual) {
            await api.purchaseManual([targetNumbers]);
            console.log("✅ 구매 프로세스 가동 완료");
        }
    } catch (err) {
        console.log(`구매 알림: ${err.message}`);
    }

    // 결과 저장 (어플 화면 업데이트용)
    fs.writeFileSync('result.json', JSON.stringify({ balance: currentBalance, last_run: new Date().toISOString() }));

    return { status: "success", balance: currentBalance };
}
