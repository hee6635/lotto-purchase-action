import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    try {
        console.log("=== 🔍 [끝장 수사] 실시간 잔액 변동 감시 가동 ===");
        
        // 1. 세션이 가장 확실한 모바일 메인으로 접속
        console.log("📡 모바일 메인 페이지 접속 중...");
        await page.goto("https://m.dhlottery.co.kr/common.do?method=main", { waitUntil: "networkidle" });
        
        // 2. 👀 [추적 모드] 로봇이 지금 보고 있는 텍스트 실시간 확인
        console.log("⏳ 가짜 0원이 진짜 숫자로 바뀌는지 감시합니다...");

        const finalResult = await page.evaluate(async () => {
            const delay = ms => new Promise(res => setTimeout(res, ms));
            let foundVal = "0";

            for (let i = 0; i < 10; i++) { // 최대 10초간 감시
                const bodyText = document.body.innerText;
                // '예치금' 단어 뒤에 오는 숫자를 정밀 타격
                const match = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]+)\s*원/);
                
                if (match && match[1]) {
                    const tempVal = match[1].replace(/[^0-9]/g, '');
                    if (tempVal !== "0" && tempVal !== "") {
                        foundVal = tempVal; // 0이 아닌 진짜 숫자를 찾음!
                        break;
                    }
                }
                await delay(1000); // 1초 대기 후 다시 확인
            }
            return {
                balance: foundVal,
                pageSnippet: document.body.innerText.substring(0, 500) // 현재 화면 500자 갈무리
            };
        });

        console.log("------------------------------------------");
        console.log("👀 [현재 화면 상단 요약]");
        console.log(finalResult.pageSnippet);
        console.log("------------------------------------------");

        currentBalance = finalResult.balance;
        console.log(`✅ 최종 포착된 잔액: ${currentBalance}원`);

        if (currentBalance === "0") {
            console.log("⚠️ 10초간 지켜봤으나 계속 0원입니다. (실제 잔액이 0원이거나 로딩 실패)");
        }

    } catch (e) {
        console.log(`❌ 에러 발생: ${e.message}`);
        status = "fail";
    }

    // 3. 🚀 아침 6시 8분, 구매 시도는 무조건 실행
    console.log("🚀 로또 실전 구매 프로세스 가동...");
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        
        if (api.purchaseManual) {
            await api.purchaseManual([targetNumbers]);
            console.log(`✅ 구매 성공! 번호: [${targetNumbers.join(', ')}]`);
            message = "구매 및 잔액 동기화 성공!";
        }
    } catch (err) {
        console.log(`❌ 구매 결과: ${err.message}`);
        message = `알림: ${err.message}`;
    }

    // 4. 결과 저장
    try {
        const resultData = { balance: currentBalance, status, message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
