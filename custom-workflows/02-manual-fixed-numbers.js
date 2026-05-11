import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    try {
        console.log("=== 🕵️‍♂️ [사용자 제안] 마이페이지(userSsl.do) 강제 진입 작전 ===");

        // 1. 스텔스 설정
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 💡 [사용자 제안 코드] 마이페이지로 이동하여 세션 강제 활성화
        console.log("📡 로그인 안정화를 위해 마이페이지로 진입합니다...");
        await page.goto('https://dhlottery.co.kr/userSsl.do?method=myPage', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        console.log("⏳ 데이터 안착 대기 중 (3초)...");
        await page.waitForTimeout(3000);

        // 3. 💡 [사용자 제안 코드] '예치금' 단어 주변 텍스트 스캔
        console.log("🔍 현장 텍스트를 스캔합니다...");
        const result = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const idx = bodyText.indexOf("예치금");
            
            if (idx === -1) {
                return "❌ '예치금' 키워드 없음. (로그인 풀림 또는 페이지 튕김 의심)\n미리보기: " + bodyText.substring(0, 100);
            }
            
            // 줄바꿈을 공백으로 바꿔서 한 줄로 깔끔하게 출력
            return bodyText.substring(Math.max(0, idx - 10), idx + 80).replace(/\n/g, ' ');
        });

        console.log("==========================================");
        console.log(`👀 [현장 보고]`);
        console.log(result);
        console.log("==========================================");

    } catch (e) {
        console.log(`❌ 디버그 중 에러: ${e.message}`);
    }

    return { status: "success", balance: "0" };
}
