import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    try {
        console.log("=== 🕵️‍♂️ [사용자 제안] 네트워크 감청(Packet Sniffing) 작전 ===");

        // 1. 스텔스 및 모바일 화면 세팅
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        await page.setViewportSize({ width: 375, height: 812 });

        // 2. 💡 [사용자 핵심 로직] 통신 감청망 설치 (페이지 이동 전에 미리 깔아둡니다)
        page.on('response', async (response) => {
            const url = response.url();
            
            // 잔액과 관련된 영문/국문 API 주소가 될 만한 것들 모두 필터링
            if (url.includes('balance') || url.includes('money') || url.includes('cash') || 
                url.includes('myInfo')  || url.includes('user')  || url.includes('deposit')) {
                
                try {
                    const text = await response.text();
                    console.log("==========================================");
                    console.log(`📡 [네트워크 포착] ${url}`);
                    // 텍스트가 너무 길면 보기 힘드니 300자만 자르고 줄바꿈 제거
                    console.log(`📦 [응답 내용] ${text.substring(0, 300).replace(/\n/g, ' ')}`);
                    console.log("==========================================");
                } catch(e) {
                    // 이미지, 폰트 등 텍스트로 변환 불가능한 데이터는 무시
                }
            }
        });

        // 3. 모바일 메인 페이지로 진입하여 통신을 유도
        console.log("🚀 모바일 메인 페이지로 침투합니다...");
        await page.goto("https://m.dhlottery.co.kr/common.do?method=main", { 
            waitUntil: 'networkidle', 
            timeout: 30000 
        });
        
        // 4. 뒤에서 몰래 통신하는 데이터가 있는지 5초간 지켜보기
        console.log("⏳ 뒷구멍 통신이 완료될 때까지 5초간 대기하며 감청합니다...");
        await page.waitForTimeout(5000);

    } catch (e) {
        console.log(`❌ 감청 중 에러: ${e.message}`);
    }

    return { status: "success", balance: "0" };
}
