import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    try {
        console.log("=== 🎯 [정밀 타격] 예치금 데이터만 추출 ===");

        // 1. 신분 위장 (Headless 탐지 방어)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 💡 [사용자 제안] API 주소로 직접 진입
        const apiTarget = 'https://dhlottery.co.kr/user.do?method=getUserBalance';
        const response = await page.goto(apiTarget, { waitUntil: 'networkidle', timeout: 20000 });
        const rawText = await response.text();

        // 3. 🔍 '예치금' 관련 숫자만 추려내기
        // 응답이 JSON {"cashBalance":"10,000"} 이든, 단순 텍스트든 숫자만 뽑습니다.
        const match = rawText.match(/[\d,]+/);
        if (match) {
            currentBalance = match[0].replace(/,/g, '');
            console.log(`💰 포착된 예치금: ${currentBalance}원`);
        } else {
            console.log("❌ 데이터에서 숫자를 찾을 수 없음");
            console.log("원본 응답 확인:", rawText.substring(0, 100)); // 짧게 확인
        }

    } catch (e) {
        console.log(`❌ 에러 발생: ${e.message}`);
    }

    // 4. 로또 구매 프로세스
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        if (api.purchaseManual) {
            await api.purchaseManual([targetNumbers]);
            console.log("✅ 구매 시도 완료");
        }
    } catch (err) {
        console.log(`구매 알림: ${err.message}`);
    }

    // 결과 저장
    fs.writeFileSync('result.json', JSON.stringify({ balance: currentBalance, last_run: new Date().toISOString() }));

    return { status: "success", balance: currentBalance };
}
