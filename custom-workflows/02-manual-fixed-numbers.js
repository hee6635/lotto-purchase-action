import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";
    let status = "success";

    try {
        console.log("=== 📡 [사용자 제안] API 주소 직접 항해 작전 ===");

        // 1. 👻 스텔스 설정 (신분 위장)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 💡 [핵심] fetch 대신 주소창에 직접 입력해서 접속 (CORS 회피)
        console.log("📡 잔액 데이터 주소로 직접 이동 중...");
        try {
            const apiResponse = await page.goto(
                'https://dhlottery.co.kr/user.do?method=getUserBalance',
                { waitUntil: 'networkidle', timeout: 20000 }
            );
            
            const responseText = await apiResponse.text();
            console.log("==========================================");
            console.log("👀 [API 서버 응답 원본]:");
            console.log(responseText); 
            console.log("==========================================");

            // 3. 데이터 가공 (JSON 형태일 경우 대비 숫자만 추출)
            // 예: {"cashBalance":"10,000"} 또는 "10000"
            const match = responseText.match(/[\d,]+/); 
            if (match) {
                currentBalance = match[0].replace(/,/g, '');
                console.log(`✅ 데이터 포착 성공: ${currentBalance}원`);
            } else {
                console.log("⚠️ 응답 데이터에서 숫자를 찾을 수 없습니다.");
            }
        } catch(e) {
            console.log("❌ API 직접 접속 실패:", e.message);
            status = "fail";
        }

    } catch (e) {
        console.log(`❌ 전체 공정 에러: ${e.message}`);
        status = "fail";
    }

    // 🚀 [실전 구매] 잔액 확인 후 구매 페이지로 이동하여 진행
    console.log("🚀 로또 실전 구매 프로세스 가동...");
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        
        // 0원이 아니거나, 에러가 나더라도 일단 세션이 살아있다면 구매 시도
        if (api.purchaseManual) {
            await api.purchaseManual([targetNumbers]);
            console.log("✅ 구매 프로세스 완료");
        }
    } catch (err) {
        console.log(`알림: ${err.message}`);
    }

    // 결과 저장
    const resultData = { balance: currentBalance, last_run: new Date().toISOString() };
    fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));

    return { status: "success", balance: currentBalance };
}
