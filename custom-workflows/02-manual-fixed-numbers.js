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
        console.log("=== 💡 [발상의 전환] 예치금 거래내역 페이지 직행 ===");
        
        // 1. 버튼 클릭 필요 없는 '예치금 내역' 모바일 페이지로 다이렉트 접속
        console.log("📡 예치금 거래내역 페이지로 접속 중...");
        await page.goto("https://m.dhlottery.co.kr/myPage.do?method=depositList", { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(4000); // 넉넉하게 4초 대기

        // 2. 👀 [시야 추적] 로봇이 상담센터가 아닌 제대로 된 내역 창을 보는지 확인
        const allText = await page.evaluate(() => document.body.innerText);
        console.log("------------------------------------------");
        console.log("👀 [예치금 내역 화면 텍스트 (최대 1000자)]");
        console.log(allText.substring(0, 1000));
        console.log("------------------------------------------");

        // 3. 잔액 추출 (내역 페이지는 잔액이 명확하게 찍힘)
        currentBalance = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // 튕겨서 로그아웃 되었는지 확인
            if (bodyText.includes("로그인해주세요") || bodyText.includes("로그아웃") === false) {
                return "로그아웃됨";
            }

            // '총 예치금', '보유 예치금', 혹은 그냥 '예치금 10,000원' 등을 포괄적으로 찾음
            const match = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]+)\s*원/);
            if (match && match[1]) {
                const val = match[1].replace(/[^0-9]/g, '');
                return val !== "" ? val : "0";
            }
            return "0"; // 못 찾으면 0 반환
        });

        console.log(`✅ 내역 페이지에서 확인된 예치금: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 작업 중 에러 발생: ${e.message}`);
        status = "fail";
        message = `에러: ${e.message}`;
    }

    // ⏰ 6시가 다가옵니다!
    const kstTimeFinal = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTimeFinal.getHours();

    if (hour >= 0 && hour < 6) {
        console.log("⚠️ 아직 06시 이전입니다. 잔액 동기화만 진행합니다.");
        message = "잔액 동기화 완료 (점검시간)";
    } else {
        console.log("🚀 드디어 6시 오픈! 로또 구매 시도 중...");
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
