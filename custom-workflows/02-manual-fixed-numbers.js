import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    try {
        console.log("=== 🕵️‍♂️ [연금복권 전용] 미스터리 잔액 추적 가동 ===");

        // 1. 👻 스텔스 설정 (로봇 탐지 차단)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 📡 연금복권 구매 페이지 직행
        console.log("📡 연금복권 구매 페이지 접속 중...");
        await page.goto("https://el.dhlottery.co.kr/pension720.do?method=pension720Buy", { 
            waitUntil: 'networkidle', 
            timeout: 40000 
        });

        // 3. 🔍 [현장 디버그] '예치금' 단어가 포함된 모든 줄을 출력
        console.log("⏳ 화면 로딩 및 잔액 데이터 수신 대기 (최대 10초)...");
        
        const finalReport = await page.evaluate(async () => {
            const delay = ms => new Promise(res => setTimeout(res, ms));
            let foundBalance = "0";
            let debugLog = "";

            for (let i = 1; i <= 10; i++) {
                const fullText = document.body.innerText;
                
                // '예치금', '잔액', '보유' 단어가 포함된 문장 찾기
                const lines = fullText.split('\n').filter(line => 
                    line.includes('예치금') || line.includes('보유') || line.includes('잔액')
                );

                if (lines.length > 0) {
                    debugLog = `[${i}초차 확인]: ` + lines.join(' | ');
                    
                    // 정밀 정규식으로 숫자 추출 시도
                    const match = fullText.match(/(?:보유예치금|예치금|잔액)\s*[:\n]?\s*([\d,]+)\s*원/);
                    if (match && match[1].replace(/,/g, '') !== "0") {
                        foundBalance = match[1].replace(/,/g, '');
                        break; // 0이 아닌 숫자를 찾으면 즉시 종료
                    }
                }
                await delay(1000);
            }
            return { balance: foundBalance, log: debugLog };
        });

        console.log("==========================================");
        console.log("👀 [연금복권 현장 수사 보고]");
        console.log(finalReport.log || "관련 키워드를 찾지 못함");
        console.log("==========================================");

        currentBalance = finalReport.balance;
        console.log(`✅ 최종 포착 잔액: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 연금복권 수색 중 에러: ${e.message}`);
    }

    // 결과 저장 (어플 화면 동기화)
    fs.writeFileSync('result.json', JSON.stringify({ 
        balance: currentBalance, 
        last_run: new Date().toISOString() 
    }));

    return { status: "success", balance: currentBalance };
}
