import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    try {
        console.log("=== 🌅 [6시 정각] 점검 종료 및 실전 데이터 추출 ===");
        
        // 1. PC 메인 접속 (6시 이후엔 점검 팝업이 사라집니다)
        console.log("📡 동행복권 PC 메인 페이지 접속 중...");
        await page.goto("https://dhlottery.co.kr/common.do?method=main", { waitUntil: "networkidle" });
        await page.waitForTimeout(5000); // 6시 직후 서버 부하 대비 5초 대기

        // 2. 🔍 [추적] 화면에 숨겨진 잔액 변수 및 태그 싹 다 뒤지기
        const debugData = await page.evaluate(() => {
            // 사이트 내부 자바스크립트 변수에 잔액이 있는지 확인
            const win = window;
            return {
                innerMoney: win.curCash || win.cashBalance || "없음",
                tagMoney: document.querySelector('.money strong')?.innerText || "태그없음",
                myMoney: document.querySelector('.my_money')?.innerText || "영역없음"
            };
        });

        console.log("------------------------------------------");
        console.log("👀 [감시: 화면 내부 데이터 상태]");
        console.log(`변수 잔액: ${debugData.innerMoney}`);
        console.log(`태그 잔액: ${debugData.tagMoney}`);
        console.log(`영역 잔액: ${debugData.myMoney}`);
        console.log("------------------------------------------");

        // 3. 잔액 확정 로직
        if (debugData.tagMoney !== "태그없음") {
            currentBalance = debugData.tagMoney.replace(/[^0-9]/g, '');
        } else if (debugData.innerMoney !== "없음") {
            currentBalance = debugData.innerMoney.toString().replace(/[^0-9]/g, '');
        } else {
            // 최후의 수단: 텍스트 긁기
            const bodyText = await page.evaluate(() => document.body.innerText);
            const match = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]+)\s*원/);
            currentBalance = match ? match[1].replace(/[^0-9]/g, '') : "0";
        }

        console.log(`✅ 최종 확정 잔액: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 에러 발생: ${e.message}`);
        status = "fail";
    }

    // 4. 로또 구매 시도 (6시 지났으므로 무조건 시도!)
    console.log("🚀 아침 6시! 구매 제한 해제. 로또 구매를 시도합니다.");
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        
        if (api.purchaseManual) {
            await api.purchaseManual([targetNumbers]);
            console.log(`✅ 구매 성공: [${targetNumbers.join(', ')}]`);
            message = "로또 구매 및 잔액 동기화 성공!";
        }
    } catch (err) {
        console.log(`❌ 구매 시도 중 알림: ${err.message} (이미 구매했거나 잔액 부족일 수 있음)`);
        message = `구매 알림: ${err.message}`;
    }

    // 결과 저장
    try {
        const resultData = { balance: currentBalance, status, message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
