import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    try {
        console.log("=== 🕵️‍♂️ [사용자 제안] 연금복권 페이지 텍스트 끝장 분석 ===");

        // 1. 스텔스 설정
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 연금복권 접속 및 10초 대기
        console.log("📡 연금복권 구매 페이지 진입 중...");
        await page.goto("https://el.dhlottery.co.kr/pension720.do?method=pension720Buy", { 
            waitUntil: 'networkidle', 
            timeout: 40000 
        });
        
        console.log("⏳ 10초 대기 가동... (서버가 응답을 끝낼 때까지 대기)");
        await page.waitForTimeout(10000);

        // 3. 💡 [사용자 제안 코드] 화면 텍스트 원본 추출
        console.log("🔍 로봇의 시야(innerText)를 스캔합니다...");
        const bodyText = await page.evaluate(() => document.body.innerText);
        const idx = bodyText.indexOf("예치금");
        
        console.log("==========================================");
        if (idx === -1) {
            console.log("❌ 예치금 키워드 없음");
            console.log("=== 페이지 전체 텍스트 앞 500자 ===");
            console.log(bodyText.substring(0, 500));
        } else {
            console.log("✅ 예치금 단어 발견!");
            console.log("=== 예치금 주변 텍스트 ===");
            // 줄바꿈이 있으면 보기 힘드니 띄어쓰기로 바꿔서 출력합니다.
            console.log(bodyText.substring(Math.max(0, idx - 20), idx + 100).replace(/\n/g, ' '));
        }
        console.log("==========================================");

    } catch (e) {
        console.log(`❌ 디버그 에러: ${e.message}`);
    }

    return { status: "success", balance: "0" };
}
