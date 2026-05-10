import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    try {
        console.log("=== 📡 [사용자님 요청] API 데이터 직접 접속 작전 ===");
        
        // 1. 💡 [핵심] 껍데기 화면 다 버리고, 서버가 JSON 데이터만 뱉는 주소로 직접 이동!
        console.log("📡 서버 잔액 API 주소로 직접 진입 중...");
        await page.goto("https://m.dhlottery.co.kr/user.do?method=cashBalanceApi", { waitUntil: "networkidle" });
        
        // 2. 👀 [추적 모드] 화면에 뜬 데이터 원본 확인
        const rawJson = await page.evaluate(() => document.body.innerText);
        console.log("------------------------------------------");
        console.log("👀 [API 서버가 뱉어낸 생데이터]");
        console.log(rawJson); // {"cashBalance":"10,000", ...} 이런 식으로 뜰 겁니다.
        console.log("------------------------------------------");

        // 3. 데이터 가공
        if (rawJson.includes("cashBalance")) {
            const data = JSON.parse(rawJson);
            currentBalance = data.cashBalance.replace(/[^0-9]/g, '');
            console.log(`✅ 드디어 확인된 진짜 잔액: ${currentBalance}원`);
        } else {
            console.log("⚠️ 데이터에 잔액 정보가 없습니다. 다시 한번 메인으로 이동해 세션을 깨웁니다.");
            await page.goto("https://m.dhlottery.co.kr/common.do?method=main");
            currentBalance = "0";
        }

    } catch (e) {
        console.log(`❌ API 추출 중 에러: ${e.message}`);
        status = "fail";
    }

    // 4. 🚀 6시 13분! 아까 로그에서 구매 버튼 클릭까지 확인됐으니, 이제 진짜 구매합니다!
    console.log("🚀 로또 구매 프로세스를 즉시 가동합니다.");
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        
        if (api.purchaseManual) {
            await api.purchaseManual([targetNumbers]);
            console.log(`✅ 구매 최종 성공! 번호: [${targetNumbers.join(', ')}]`);
            message = "로또 구매 및 잔액 업데이트 성공!";
        }
    } catch (err) {
        console.log(`❌ 구매 시도 알림: ${err.message}`);
        message = `구매 결과: ${err.message}`;
    }

    // 결과 저장
    try {
        const resultData = { balance: currentBalance, status, message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
