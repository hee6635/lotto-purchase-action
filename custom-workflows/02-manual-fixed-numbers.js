import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    try {
        console.log("=== 🎯 [사용자 발견 API] 예치금 직접 호출 작전 ===");

        // 1. 스텔스 설정 (혹시 모를 차단 방지)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 💡 [사용자 제안 핵심 로직] 내부 API 주소로 직접 찌르기
        console.log("📡 예치금 API 엔드포인트로 돌격합니다...");
        const response = await page.goto(
            'https://www.dhlottery.co.kr/mypage/selectUserMndp.do',
            { waitUntil: 'networkidle', timeout: 30000 }
        );
        
        const rawText = await response.text();
        
        // 3. JSON 데이터 정밀 추출
        try {
            const json = JSON.parse(rawText);
            // 사용자님이 찾아낸 구조가 정확히 맞는지 확인
            if (json?.data?.userMndp?.crntEntrsAmt !== undefined) {
                currentBalance = String(json.data.userMndp.crntEntrsAmt);
                console.log(`✅ [대성공] 잔액 API 직접 호출 성공: ${currentBalance}원`);
            } else {
                console.log("⚠️ JSON은 맞지만 데이터 구조가 다릅니다. 원본:", rawText);
            }
        } catch (parseError) {
            console.log("❌ JSON 파싱 실패. (세션이 끊겨 로그인 HTML 페이지를 뱉었을 수 있습니다)");
            console.log(`📦 [응답 앞부분]: ${rawText.substring(0, 200)}`);
        }

    } catch (e) {
        console.log(`❌ API 호출 중 에러: ${e.message}`);
    }

    // 4. 🚀 실전 로또 구매 (잔액이 확인되었을 때만 진행)
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        
        if (api.purchaseManual && currentBalance !== "0") {
            console.log("🚀 확인된 잔액으로 로또 구매를 시도합니다...");
            await api.purchaseManual([targetNumbers]);
            console.log(`✅ 구매 프로세스 완료!`);
        }
    } catch (err) {
        console.log(`⚠️ 구매 중 알림: ${err.message}`);
    }

    // 5. 결과 저장 (React 어플로 동기화)
    fs.writeFileSync('result.json', JSON.stringify({ 
        balance: currentBalance, 
        last_run: new Date().toISOString() 
    }));

    return { status: "success", balance: currentBalance };
}
