import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    try {
        console.log("=== 🕵️‍♂️ [우회 작전] 연금복권 모바일 경로 정밀 수색 ===");

        // 1. 👻 스텔스 및 모바일 환경 위장
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        // 모바일 브라우저처럼 보이게 뷰포트 조절
        await page.setViewportSize({ width: 375, height: 812 });

        // 2. 📡 연금복권 모바일 구매 페이지로 접속 (여기가 진짜 노다지입니다)
        console.log("📡 연금복권 모바일 구매처 진입 중...");
        await page.goto("https://m.dhlottery.co.kr/game/pension720/buy", { 
            waitUntil: 'networkidle', 
            timeout: 40000 
        });
        
        // 3. 🔍 [현장 감시] 로봇이 지금 뭘 보고 있는지 딱 200자만 출력
        console.log("⏳ 데이터 로딩 대기 중...");
        await page.waitForTimeout(5000); 

        const debugView = await page.evaluate(() => {
            const text = document.body.innerText;
            // '예치금' 단어를 포함한 주변 텍스트 200자 추출
            const idx = text.indexOf("예치금");
            if (idx === -1) return "❌ '예치금' 단어가 여전히 안 보임. (현재 URL: " + window.location.href + ")";
            return "🎯 포착 문맥: " + text.substring(idx - 20, idx + 100).replace(/\n/g, ' ');
        });

        console.log("==========================================");
        console.log(debugView);
        console.log("==========================================");

        // 4. 💰 잔액 추출 (모바일 버전 전용 패턴)
        currentBalance = await page.evaluate(() => {
            const text = document.body.innerText;
            // 모바일은 '나의 예치금' 또는 '보유 예치금'으로 표시되는 경우가 많습니다.
            const match = text.match(/(?:나의 예치금|예치금|보유)\s*[:\n]?\s*([\d,]+)\s*원/);
            if (match && match[1].replace(/,/g, '') !== "0") {
                return match[1].replace(/,/g, '');
            }
            return "0";
        });

        console.log(`✅ 모바일 경로 최종 포착: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 우회 수색 중 에러: ${e.message}`);
    }

    // 결과 저장
    fs.writeFileSync('result.json', JSON.stringify({ 
        balance: currentBalance, 
        last_run: new Date().toISOString() 
    }));

    return { status: "success", balance: currentBalance };
}
