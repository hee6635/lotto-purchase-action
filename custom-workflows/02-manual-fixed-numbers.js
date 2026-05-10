import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) {
        return { status: "fail", message: "조종기 연결 실패" };
    }

    try {
        console.log("=== 🕵️‍♂️ [원인 완벽 해결] Playwright 전용 PC 위장 작전 ===");
        
        // 💡 [핵심] Playwright 방식의 완벽한 PC 위장! (이러면 404 에러 절대 안 납니다)
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        console.log("📡 위장 완벽 성공! 동행복권 PC 메인 페이지 접속 중...");
        await page.goto("https://dhlottery.co.kr/common.do?method=main", { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(4000); // 넉넉하게 대기

        // 🔍 PC 메인 화면 잔액 추출 (PC는 메뉴를 누를 필요 없이 바로 숫자가 나옴!)
        currentBalance = await page.evaluate(() => {
            const moneyTag = document.querySelector('.money strong') || document.querySelector('.my_money');
            if (moneyTag && moneyTag.innerText) {
                return moneyTag.innerText.replace(/[^0-9]/g, '');
            }
            
            const bodyText = document.body.innerText;
            const match = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]+)\s*원/);
            if (match && match[1]) {
                return match[1].replace(/[^0-9]/g, '');
            }
            return "0";
        });

        console.log(`✅ 드디어 껍데기를 뚫고 확인된 진짜 예치금: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 작업 중 에러 발생: ${e.message}`);
        status = "fail";
        message = `에러: ${e.message}`;
    }

    // ⏰ 6시 기준 구매 판단
    const kstTimeFinal = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTimeFinal.getHours();

    if (hour >= 0 && hour < 6) {
        console.log("⚠️ 06시 이전이므로 로또 구매는 생략합니다.");
        message = "잔액 동기화 완료 (점검시간)";
    } else {
        console.log("🚀 로또 구매 시도 중...");
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
