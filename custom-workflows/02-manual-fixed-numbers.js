import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) {
        console.error("❌ 조종기(page)를 찾을 수 없습니다.");
        return { status: "fail", message: "조종기 연결 실패" };
    }

    try {
        console.log("=== 🎯 [사용자님 아이디어] 연금복권 우회 작전 + 정밀 추적 ===");
        
        console.log("📡 연금복권 구매 페이지로 접속 중...");
        await page.goto("https://m.dhlottery.co.kr/game/pension720/buy", { waitUntil: "networkidle", timeout: 30000 });
        
        console.log("⏳ 페이지 진입 성공! 화면 상태를 확인합니다.");
        await page.waitForTimeout(4000); // 껍데기 로딩 대기

        // 👀 [추적 모드] 로봇이 보고 있는 화면 텍스트 전체 출력
        const allText = await page.evaluate(() => document.body.innerText);
        console.log("------------------------------------------");
        console.log("👀 [연금복권 구매창 로봇 시야 (앞부분 1000자)]");
        console.log(allText.substring(0, 1000));
        console.log("------------------------------------------");

        console.log("⏳ 진짜 잔액 데이터 수신 감시 시작 (최대 10초)...");

        // 🔍 [스마트 대기] 0원이 아닌 숫자가 뜰 때까지 대기
        currentBalance = await page.evaluate(async () => {
            return new Promise((resolve) => {
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    const bodyText = document.body.innerText;
                    
                    // 연금복권 창에서 '원' 앞의 숫자 추출 (예: 10,000 원)
                    const match = bodyText.match(/([0-9,]{2,10})\s*원/);
                    
                    if (match && match[1]) {
                        const val = match[1].replace(/[^0-9]/g, '');
                        // 0이 아닌 숫자가 들어오면 즉시 낚아챔
                        if (val !== "0" && val !== "") {
                            clearInterval(interval);
                            resolve(val);
                        }
                    }
                    
                    // 10초가 지나도 안 바뀌면 그냥 현재 화면의 숫자 반환
                    if (attempts >= 10) {
                        clearInterval(interval);
                        resolve(match && match[1] ? match[1].replace(/[^0-9]/g, '') : "0");
                    }
                }, 1000);
            });
        });

        console.log(`✅ 연금복권 창에서 확인된 예치금: ${currentBalance}원`);
        if (currentBalance === "0") console.log("⚠️ 10초 대기 후에도 0원입니다. (새벽 잔액 연동 서버 차단 확인)");

    } catch (e) {
        console.log(`❌ 작업 중 에러 발생: ${e.message}`);
        status = "fail";
        message = `에러: ${e.message}`;
    }

    // 구매 불가 시간 방어
    const kstTimeFinal = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTimeFinal.getHours();

    if (hour >= 0 && hour < 6) {
        console.log("⚠️ 점검 시간대(00-06시)이므로 로또 구매 시도는 생략합니다.");
        message = "잔액 동기화 완료 (점검시간)";
    } else {
        console.log("🚀 아침 6시가 지났습니다! 로또 구매를 시도합니다.");
        try {
            const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
            const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
            
            if (api.purchaseManual) {
                 await api.purchaseManual([targetNumbers]); 
                 console.log(`✅ 로또 구매 성공! 번호: [${targetNumbers.join(', ')}]`);
                 message = "로또 구매 성공!";
            }
        } catch (error) {
            console.log(`❌ 구매 에러: ${error.message}`);
            message = `구매 에러: ${error.message}`;
            status = "fail";
        }
    }

    try {
        const resultData = { balance: currentBalance, status: status, message: message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
