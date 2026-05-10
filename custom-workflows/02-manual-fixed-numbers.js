import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    try {
        console.log("=== 🕵️‍♂️ [잠입 수사] 연금복권 iframe 내부 추적 가동 ===");

        // 1. 👻 신분 위장 및 스텔스
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 📡 연금복권 페이지 접속
        console.log("📡 연금복권 페이지 접속 중...");
        await page.goto("https://el.dhlottery.co.kr/pension720.do?method=pension720Buy", { 
            waitUntil: 'networkidle', 
            timeout: 40000 
        });
        await page.waitForTimeout(5000); // 액자 속 내용이 뜰 때까지 넉넉히 대기

        // 3. 🔍 [핵심] 모든 iframe(액자)을 하나씩 뒤져서 잔액 찾기
        console.log("🔍 모든 프레임 내부를 전수 조사합니다...");
        const allFrames = page.frames();
        console.log(`📍 발견된 프레임 수: ${allFrames.length}개`);

        for (const frame of allFrames) {
            try {
                const frameUrl = frame.url();
                // 💡 [디버그] 현재 뒤지고 있는 프레임 주소 확인
                if (frameUrl.includes('dhlottery')) {
                    const frameText = await frame.innerText('body');
                    
                    if (frameText.includes('예치금') || frameText.includes('보유')) {
                        console.log(`🎯 [타격 성공] 데이터 발견 프레임: ${frameUrl}`);
                        
                        // 해당 프레임에서 숫자 추출
                        const match = frameText.match(/(?:보유예치금|예치금|잔액)\s*[:\n]?\s*([\d,]+)\s*원/);
                        if (match && match[1].replace(/,/g, '') !== "0") {
                            currentBalance = match[1].replace(/,/g, '');
                            console.log(`✅ 액자 속에서 찾은 진짜 잔액: ${currentBalance}원`);
                            break; 
                        }
                    }
                }
            } catch (e) {
                // 특정 프레임 접근 불가 시 패스
            }
        }

        if (currentBalance === "0") {
            console.log("⚠️ 모든 프레임을 뒤졌으나 0원입니다. (세션 문제 혹은 로딩 지연)");
        }

    } catch (e) {
        console.log(`❌ 잠입 수사 중 에러: ${e.message}`);
    }

    // 결과 저장
    fs.writeFileSync('result.json', JSON.stringify({ 
        balance: currentBalance, 
        last_run: new Date().toISOString() 
    }));

    return { status: "success", balance: currentBalance };
}
