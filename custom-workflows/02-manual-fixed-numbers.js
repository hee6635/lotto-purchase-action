import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";

    try {
        console.log("=== 🎯 [정밀 타격] 엉뚱한 숫자 방지 & 진짜 잔액 추출 ===");

        // 1. 신분 위장
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. API 주소 직접 진입
        const apiTarget = 'https://dhlottery.co.kr/user.do?method=getUserBalance';
        const response = await page.goto(apiTarget, { waitUntil: 'networkidle', timeout: 20000 });
        const rawText = await response.text();

        // 3. 🔍 [정밀 분석] "cashBalance" 키워드 뒤에 오는 숫자만 타격
        // 예: {"cashBalance":"10,000", ...} 에서 10,000만 쏙 빼옴
        const balanceMatch = rawText.match(/"cashBalance"\s*:\s*"([0-9,]+)"/);
        
        if (balanceMatch && balanceMatch[1]) {
            currentBalance = balanceMatch[1].replace(/,/g, '');
            console.log(`💰 [월척 포착] 진짜 예치금: ${currentBalance}원`);
        } else {
            // 만약 JSON 형식이 아닐 경우를 대비한 2차 수색
            const backupMatch = rawText.match(/예치금\s*[:\n]?\s*([0-9,]+)\s*원/);
            currentBalance = backupMatch ? backupMatch[1].replace(/,/g, '') : "0";
            
            if (currentBalance === "0") {
                console.log("⚠️ 정밀 타격 실패. 원본 데이터 확인:", rawText.substring(0, 150));
            } else {
                console.log(`💰 [백업 포착] 예치금: ${currentBalance}원`);
            }
        }

    } catch (e) {
        console.log(`❌ 에러: ${e.message}`);
    }

    // 4. 로또 구매 프로세스 (구매 단계는 이미 검증 완료!)
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
