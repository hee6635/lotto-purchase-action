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
        console.log("=== 🎯 [사용자님 아이디어] 연금복권 구매창 우회 타격 ===");
        
        // 💡 로또 구매창의 심야 차단을 피해, 24시간 열려있는 연금복권 구매창으로 진입!
        console.log("📡 연금복권 실구매창 주소로 접속 중...");
        await page.goto("https://el.dhlottery.co.kr/game/TotalGame.do?gameId=T720", { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(4000); // 넉넉하게 4초 대기

        // 🔍 [추적 모드] 연금복권 구매창 텍스트 확인
        const allText = await page.evaluate(() => document.body.innerText);
        console.log("------------------------------------------");
        console.log("👀 [연금복권 구매창 텍스트 추출]");
        console.log(allText.substring(0, 1000));
        console.log("------------------------------------------");

        // 🔍 예치금 추출
        currentBalance = await page.evaluate(() => {
            // 1. 연금복권 구매창 내의 잔액 태그 강제 확인
            const moneyEl = document.querySelector('#Money') || document.querySelector('#payAmt') || document.querySelector('.money');
            if (moneyEl && moneyEl.innerText && moneyEl.innerText.includes(',')) {
                return moneyEl.innerText.replace(/[^0-9]/g, '');
            }
            
            // 2. 백업: '예치금' 주변 혹은 '원' 앞의 숫자 긁어오기
            const bodyText = document.body.innerText;
            const match = bodyText.match(/([0-9,]{2,10})\s*원/); 
            if (match && match[1]) {
                return match[1].replace(/[^0-9]/g, '');
            }
            
            return "추출실패";
        });

        console.log(`✅ 최종 추출된 예치금 숫자: ${currentBalance}원`);

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

    // 결과 저장 (result.json)
    try {
        const resultData = { balance: currentBalance, status: status, message: message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
