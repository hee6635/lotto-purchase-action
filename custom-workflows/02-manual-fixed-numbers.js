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
        console.log("=== 📱 [최종] 모바일 메인 데이터 수신 대기 작전 ===");
        
        console.log("📡 모바일 메인 페이지로 접속 중...");
        await page.goto("https://m.dhlottery.co.kr/common.do?method=main", { waitUntil: "networkidle", timeout: 30000 });
        
        console.log("⏳ 화면은 떴습니다! 서버에서 진짜 잔액 숫자를 보내줄 때까지 감시합니다 (최대 10초)...");

        // 💡 [핵심] 1초마다 화면을 확인하며 0원이 진짜 금액으로 바뀌는지 감시!
        currentBalance = await page.evaluate(async () => {
            return new Promise((resolve) => {
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    const bodyText = document.body.innerText;
                    const match = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]+)\s*원/);
                    
                    if (match && match[1]) {
                        const val = match[1].replace(/[^0-9]/g, '');
                        // 0이 아니면 가짜 껍데기가 진짜로 바뀐 것! 즉시 퇴근!
                        if (val !== "0" && val !== "") {
                            clearInterval(interval);
                            resolve(val);
                        }
                    }
                    
                    // 10초가 지나도 0원이면 점검시간이라 DB가 죽은 것임
                    if (attempts >= 10) {
                        clearInterval(interval);
                        resolve(match && match[1] ? match[1].replace(/[^0-9]/g, '') : "추출실패");
                    }
                }, 1000); // 1초마다 확인
            });
        });

        console.log(`✅ 최종 추출된 예치금 숫자: ${currentBalance}원`);
        
        if (currentBalance === "0") {
            console.log("⚠️ 10초를 기다렸지만 계속 0원입니다. (새벽 은행/DB 점검으로 잔액 연동이 끊겨있습니다!)");
        }

    } catch (e) {
        console.log(`❌ 작업 중 에러 발생: ${e.message}`);
        status = "fail";
        message = `에러: ${e.message}`;
    }

    // 구매 불가 시간 방어 (한국시간 00~06시)
    const kstTimeFinal = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTimeFinal.getHours();

    if (hour >= 0 && hour < 6) {
        console.log("⚠️ 점검 시간대(00-06시)이므로 로또 구매 시도는 생략합니다.");
        message = "잔액 동기화 완료 (점검시간)";
    } else {
        console.log("🚀 구매 가능 시간입니다. 로또 구매 시도 중...");
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

    // 결과 저장
    try {
        const resultData = { balance: currentBalance, status: status, message: message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
