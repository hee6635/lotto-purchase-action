import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    try {
        console.log("=== 🕵️‍♂️ [사용자 제안] 끈질긴 잔액 추적 작전 가동 ===");

        // 1. 👻 스텔스 설정 (로봇 탐지 우회)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 📡 메인 페이지 접속 (타임아웃 60초로 넉넉하게)
        console.log("📡 동행복권 접속 중... (데이터가 뜰 때까지 기다립니다)");
        await page.goto("https://dhlottery.co.kr/common.do?method=main", { 
            waitUntil: "networkidle", 
            timeout: 60000 
        });

        // 3. 💡 [사용자 제안 로직 적용] 0원이 숫자로 바뀔 때까지 10초간 감시
        console.log("⏳ 가짜 0원이 진짜 숫자로 변하는지 10초간 지켜봅니다...");
        currentBalance = await page.evaluate(async () => {
            const delay = ms => new Promise(res => setTimeout(res, ms));
            
            for (let i = 0; i < 10; i++) {
                const bodyText = document.body.innerText;
                // 정규식 보완: 예치금 뒤에 콜론(:)이나 공백이 있어도 잡히게 수정
                const match = bodyText.match(/예치금\s*[:\n]?\s*([\d,]+)\s*원/);
                
                if (match) {
                    const val = match[1].replace(/,/g, '');
                    // 0이 아닌 진짜 숫자가 포착되면 즉시 반환
                    if (val !== "0" && val !== "") return val;
                }
                await delay(1000); // 1초씩 쉬면서 재확인
            }
            return "0"; // 끝까지 0이면 0 반환
        });

        console.log(`✅ 최종 포착된 잔액: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 추적 중 에러 발생: ${e.message}`);
    }

    // 4. 🚀 실전 구매 시도
    console.log("🚀 로또 실전 구매 프로세스 가동...");
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        
        if (api.purchaseManual && currentBalance !== "0") {
            await api.purchaseManual([targetNumbers]);
            console.log(`✅ 구매 성공! 번호: [${targetNumbers.join(', ')}]`);
        }
    } catch (err) {
        console.log(`알림: ${err.message}`);
    }

    // 결과 저장 (어플 동기화용)
    const resultData = { balance: currentBalance, last_run: new Date().toISOString() };
    fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));

    return { status: "success", balance: currentBalance };
}
