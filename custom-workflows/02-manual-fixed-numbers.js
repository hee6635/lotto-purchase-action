const fs = require('fs');

module.exports = async (api) => {
    // 1. 조종기(page) 확보 (index.js에서 무사히 전달됨!)
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) {
        console.error("❌ 조종기(page)를 찾을 수 없습니다.");
        return { status: "fail", message: "조종기 연결 실패" };
    }

    try {
        console.log("=== 📱 예치금 및 로또 자동화 작업 시작 ===");
        
        // 2. 예치금 추출 (가장 텍스트가 명확하게 뜨는 마이페이지로 우회 접속)
        console.log("📡 확실한 예치금 조회를 위해 마이페이지 접속 중...");
        await page.goto("https://dhlottery.co.kr/user.do?method=myPage", { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2000); // 로딩 대기

        // 3. 3중 안전장치가 적용된 예치금 스크래핑
        currentBalance = await page.evaluate(() => {
            // 1순위: PC/모바일 마이페이지의 정해진 예치금 태그 찾기
            const moneyTag = document.querySelector('.money strong') || document.querySelector('.my_money');
            if (moneyTag) return moneyTag.innerText.replace(/[^0-9]/g, '');

            // 2순위: 전체 텍스트에서 '예치금' 주변의 숫자 찾기
            const bodyText = document.body.innerText;
            const match1 = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]+)\s*원/);
            if (match1) return match1[1].replace(/[^0-9]/g, '');

            // 3순위: 어떻게든 화면에 있는 '원' 앞의 숫자 긁어오기 (최후의 수단)
            const match2 = bodyText.match(/([0-9,]+)\s*원/);
            if (match2) return match2[1].replace(/[^0-9]/g, '');

            return "--";
        });

        console.log(`✅ 현재 예치금 확인 완료: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 예치금 확인 실패: ${e.message}`);
        status = "fail";
        message = `예치금 확인 에러: ${e.message}`;
    }

    // 4. 로또 수동 구매 시도
    try {
        const hour = new Date().getHours();
        
        // 동행복권 구매 불가 시간 (00:00 ~ 06:00) 방어 로직
        if (hour >= 0 && hour < 6) {
            console.log("⚠️ 현재는 로또 구매 불가 시간(00:00~06:00)입니다. 예치금 정보만 업데이트합니다.");
            message = "구매 불가 시간 (잔액 동기화 완료)";
        } else {
            console.log("🚀 로또 구매 시도 중...");
            
            // 어플에서 보낸 번호(INPUT_LOTTO_NUMBERS)가 있으면 쓰고, 없으면 기본값 사용
            const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
            const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
            
            if (api.purchaseManual) {
                 await api.purchaseManual([targetNumbers]); // 1게임 구매
                 console.log(`✅ 로또 구매 성공! 번호: [${targetNumbers.join(', ')}]`);
                 message = "로또 구매 성공!";
            } else {
                 throw new Error("엔진에서 수동 구매 기능을 찾을 수 없습니다.");
            }
        }
    } catch (e) {
        console.log(`❌ 구매 실패 로그: ${e.message}`);
        status = "fail";
        message = `로또 구매 실패: ${e.message}`;
    }

    // 5. 어플(React) 동기화를 위해 result.json 파일 생성
    try {
        const resultData = {
            balance: currentBalance,
            status: status,
            message: message,
            last_run: new Date().toISOString()
        };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 파일 업데이트 완료 (어플 동기화 준비 끝)");
    } catch (e) {
        console.log(`❌ result.json 저장 실패: ${e.message}`);
    }

    console.log("=== 🏁 모든 작업 종료 ===");
    return { status, message, balance: currentBalance };
};
